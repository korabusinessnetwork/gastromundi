// Ponte KORA — instalação no PC do caixa (o .exe que se instala sozinho).
//
// Por que existe:
// - A ponte vai virar UM arquivo só (`KoraPonte.exe`, empacotado com pkg). O
//   dono copia esse arquivo para o PC do caixa e pronto: lá não tem o
//   repositório, não tem Node, não tem npm. Pode estar rodando do Downloads,
//   de um pen drive, de qualquer pasta.
// - Duas consequências que este módulo resolve:
//   1. O snapshot do pkg é SOMENTE LEITURA e a pasta onde o .exe está pode
//      sumir (pen drive) ou ser limpa (Downloads). Então os dados da ponte
//      (token do estabelecimento, fila de pedidos, fila de impressão) têm que
//      morar num lugar estável do usuário — %LOCALAPPDATA%\KORA\Ponte\dados.
//   2. Para a ponte "existir" no PC do caixa sem manual de instalação, ela se
//      copia para essa mesma pasta e se pendura no Windows para subir sozinha.
// - Tudo por usuário, NADA em Program Files: instalar em Program Files pediria
//   UAC/administrador, e o caixa raramente é admin da máquina. Pasta do
//   usuário = zero pop-up de permissão, zero senha de TI. É de propósito.
// - Zero dependência npm: a cópia é `fs.copyFile`, o atalho (.lnk) sai do
//   WScript.Shell hospedado no PowerShell, a tarefa agendada sai do `schtasks`
//   e a regra de firewall sai do `netsh` — tudo já vem no Windows.
// - Nada aqui lança para fora: toda função assíncrona resolve `{ok, ...}` /
//   `{ok:false, erro}`, no mesmo contrato do resto da ponte.
//
// Quatro coisas do "ciclo de vida" moram aqui, e cada uma existe por um
// problema que o restaurante já viveu:
//   * INSTALAR   — copiar o programa para um lugar estável (era só isto).
//   * VOLTAR     — o Windows relança a ponte sozinha se ela morrer, via Tarefa
//                  Agendada do usuário (sem administrador). O atalho da pasta
//                  Inicialização, sozinho, só dispara no logon e nunca mais.
//   * ATUALIZAR  — rodar um `.exe` mais novo substitui o instalado. Sem isso o
//                  PC do caixa fica congelado na build do dia da instalação,
//                  correções de segurança inclusive.
//   * LIBERAR    — a ponte escuta na rede (o celular do garçom precisa
//                  alcançá-la) e o Windows barra isso por padrão. Aqui só
//                  DESCOBRIMOS se está liberado; criar a regra é uma ação
//                  separada, com um UAC pedido de propósito.

import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const EH_WINDOWS = process.platform === "win32";

/**
 * `true` quando estamos rodando dentro do executável empacotado (pkg injeta
 * `process.pkg`). É o que separa "dev, `node servidor.js` no repositório" de
 * "PC do caixa, KoraPonte.exe" — os dois modos guardam dados em lugares
 * diferentes de propósito.
 */
export const EMPACOTADO = process.pkg !== undefined;

export const NOME_EXE = "KoraPonte.exe";
export const NOME_ATALHO = "KORA Ponte.lnk";
export const DESCRICAO_ATALHO = "KORA Ponte — pedidos e impressão sem internet";

/**
 * Ficha do que está instalado, gravada ao lado do executável instalado.
 * É ela que responde "de qual build é o programa que está aí?" sem precisar
 * abrir o .exe: guarda versão, impressão digital (sha256) e a data do arquivo
 * de origem. Sem essa ficha a única pista seria a data do arquivo copiado —
 * que é a data da INSTALAÇÃO, não a da build, e por isso engana.
 */
export const NOME_MARCA = "instalado.json";

/**
 * Nome da regra de firewall e da tarefa agendada. Sem acento de propósito:
 * `netsh` e `schtasks` respondem na página de código antiga do Windows
 * (não UTF-8), e um "ç" no nome voltaria quebrado justo na hora de conferir
 * se a regra existe.
 */
export const NOME_REGRA_FIREWALL = "KORA Ponte - celular do garcom";
export const NOME_TAREFA = "KORA Ponte";

/** Porta padrão da ponte — a mesma do servidor.js. */
export const PORTA_PADRAO = 8123;

/**
 * De quanto em quanto tempo a tarefa agendada tenta subir a ponte de novo.
 * Se ela já estiver no ar, o Windows nem chega a lançar o programa (política
 * `IgnoreNew`): o custo no dia a dia é zero. Se ela morreu, o pior caso é o
 * garçom ficar dois minutos sem conseguir mandar pedido — em vez de até
 * alguém reiniciar o PC.
 */
export const REPETICAO_TAREFA = "PT2M";

/**
 * Argumento que só o auto-start do Windows carrega (tarefa agendada e, para
 * quem ainda usa, o atalho da Inicialização).
 *
 * A partir da Leva 15 a ponte roda sem janela, e o único sinal de que ela
 * subiu passou a ser o painel abrindo no navegador. Isso é ótimo no duplo
 * clique — e péssimo toda vez que o Windows liga: ninguém quer o navegador
 * pulando na cara ao ligar o PC do caixa. Com este argumento, a ponte sobe
 * calada; sem ele (Área de Trabalho, duplo clique), abre o painel.
 */
export const ARG_AUTOSTART = "--autostart";

export const TIMEOUT_ATALHOS_MS = 20000;
export const TIMEOUT_CONSULTA_MS = 15000;
/** A criação da regra passa por um UAC: o tempo aqui é o tempo do dono decidir. */
export const TIMEOUT_FIREWALL_MS = 120000;

const POWERSHELL_BASE = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

// Nome da variável de ambiente que leva o caminho do JSON de configuração até
// o PowerShell. Ver o comentário de segurança em `SCRIPT_ATALHOS`.
const VAR_CONFIG = "KORA_PONTE_ATALHOS";
const VAR_FIREWALL = "KORA_PONTE_FIREWALL";

// Sufixo do executável antigo enquanto a atualização acontece. Fica visível de
// propósito: se um dia sobrar, dá para reconhecer o que é aquilo.
const SUFIXO_ANTIGO = ".antigo-";

/** Quanto tempo o estado de firewall/tarefa vale antes de perguntar de novo ao Windows. */
const VALIDADE_SONDAGEM_MS = 60000;

// ── Onde as coisas moram ────────────────────────────────────────────────

function existeCaminho(caminho) {
  try {
    return typeof caminho === "string" && caminho !== "" && fs.existsSync(caminho);
  } catch {
    return false;
  }
}

function existePasta(caminho) {
  try {
    return typeof caminho === "string" && caminho !== "" && fs.statSync(caminho).isDirectory();
  } catch {
    return false;
  }
}

function texto(valor) {
  return typeof valor === "string" && valor.trim() ? valor : "";
}

/**
 * Escreve no diário de bordo sem criar dependência circular: `lib/log.js`
 * importa `EMPACOTADO` daqui, então importar `logar` no topo deste arquivo
 * travaria a inicialização dos dois. O import tardio acontece só quando já
 * existe alguma coisa para registrar.
 *
 * Nunca lança — linha de log não derruba instalação.
 */
async function registrar(mensagem) {
  try {
    const { logar } = await import("./log.js");
    logar(mensagem);
  } catch {
    // Sem log ainda dá para instalar. O contrário não é verdade.
  }
}

/**
 * Versão da ponte, lida do `package.json` (a mesma que o `pkg` usa para gerar
 * o executável e que o servidor mostra em `/saude`). Vem de arquivo em vez de
 * constante para não existir dois lugares dizendo versões diferentes.
 *
 * Devolve "" se não der para ler — aí quem decide atualização é a impressão
 * digital do arquivo, que é informação mais confiável do que versão nenhuma.
 *
 * @returns {string}
 */
export function lerVersaoDoPacote() {
  try {
    const aqui = path.dirname(fileURLToPath(import.meta.url));
    const bruto = fs.readFileSync(path.join(aqui, "..", "package.json"), "utf8");
    const v = JSON.parse(bruto)?.version;
    return typeof v === "string" && v.trim() ? v.trim() : "";
  } catch {
    return "";
  }
}

export const VERSAO = lerVersaoDoPacote();

/**
 * Porta em que a ponte escuta — é o que a regra de firewall precisa liberar.
 * Versão pura (recebe o ambiente) para o teste não depender do PC de quem roda.
 *
 * @param {{env?: object}} [ctx]
 * @returns {number}
 */
export function resolverPorta({ env = process.env } = {}) {
  const bruta = Number(env?.KORA_PONTE_PORTA);
  return Number.isInteger(bruta) && bruta > 0 && bruta <= 65535 ? bruta : PORTA_PADRAO;
}

/**
 * Raiz da instalação, versão pura (recebe ambiente em vez de ler o global) —
 * é assim que o teste consegue exercitar Windows e não-Windows sem mexer em
 * `process`.
 *
 * @param {{env?: object, homedir?: string}} [ctx]
 * @returns {string}
 */
export function resolverDirInstalacao({ env = process.env, homedir = os.homedir() } = {}) {
  const local = texto(env?.LOCALAPPDATA);
  // Fora do Windows não existe LOCALAPPDATA — uma pasta oculta no home cumpre
  // o mesmo papel e o desenvolvedor consegue rodar o empacotado em Linux/Mac.
  return local ? path.join(local, "KORA", "Ponte") : path.join(homedir, ".kora-ponte");
}

/**
 * Pasta onde a ponte instalada guarda token, pedidos e fila de impressão.
 * Versão pura de `dirDados` (sem tocar em disco nem no ambiente global).
 *
 * @param {{empacotado: boolean, raizDev?: string, env?: object, homedir?: string}} ctx
 * @returns {string}
 */
export function resolverDirDados({ empacotado, raizDev, env = process.env, homedir = os.homedir() }) {
  // Em dev, `dados/` continua ao lado do servidor.js, exatamente como sempre
  // foi — quem clona o repositório não perde token nem fila ao atualizar.
  if (!empacotado) return path.join(raizDev ?? ".", "dados");
  return path.join(resolverDirInstalacao({ env, homedir }), "dados");
}

/**
 * Pasta de dados de verdade (lê o ambiente real e garante que ela existe).
 *
 * @param {string} raizDev pasta do servidor.js — usada só fora do empacotado
 * @returns {string}
 */
export function dirDados(raizDev) {
  const dir = resolverDirDados({ empacotado: EMPACOTADO, raizDev });
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Se nem criar a pasta deu, quem for gravar vai falhar com uma mensagem
    // melhor do que a daqui. Não vale derrubar a ponte na importação.
  }
  return dir;
}

/**
 * Pasta da instalação (%LOCALAPPDATA%\KORA\Ponte). Por usuário, sem UAC.
 * @returns {string}
 */
export function dirInstalacao() {
  return resolverDirInstalacao();
}

/**
 * Caminho final do executável instalado.
 * @returns {string}
 */
export function caminhoExeInstalado() {
  return path.join(dirInstalacao(), NOME_EXE);
}

/** Caminho da ficha do que está instalado (ver `NOME_MARCA`). */
export function caminhoMarcaInstalacao() {
  return path.join(dirInstalacao(), NOME_MARCA);
}

/**
 * Onde ficam os dois atalhos. Versão pura para teste.
 *
 * A Área de Trabalho é o ponto chato: com OneDrive ligado (caso do dono e de
 * boa parte dos PCs de restaurante) ela vira `...\OneDrive\Desktop`, e um
 * atalho criado em `%USERPROFILE%\Desktop` simplesmente não aparece na tela.
 * Por isso testamos os candidatos e ficamos com o que existe.
 *
 * @param {{env?: object, homedir?: string, existe?: (c: string) => boolean}} [ctx]
 * @returns {{startup: string, areaTrabalho: string}}
 */
export function resolverCaminhosAtalhos({ env = process.env, homedir = os.homedir(), existe = existePasta } = {}) {
  const appData = texto(env?.APPDATA) || path.join(homedir, "AppData", "Roaming");
  const startup = path.join(
    appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", NOME_ATALHO,
  );

  const candidatos = [
    texto(env?.OneDrive) ? path.join(env.OneDrive, "Desktop") : "",
    path.join(homedir, "OneDrive", "Desktop"),
    path.join(homedir, "Desktop"),
  ].filter(Boolean);

  const pasta = candidatos.find((c) => existe(c)) ?? path.join(homedir, "Desktop");
  return { startup, areaTrabalho: path.join(pasta, NOME_ATALHO) };
}

function caminhosAtalhos() {
  return resolverCaminhosAtalhos();
}

/**
 * Dois caminhos apontam para o mesmo arquivo? No Windows o sistema de arquivos
 * não distingue maiúscula de minúscula, e `C:\Users\...` vs `c:/users/...` é o
 * mesmo lugar — comparar string crua diria "não" e a ponte se copiaria em
 * cima de si mesma.
 *
 * @returns {boolean}
 */
export function mesmoCaminho(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const normalizar = (c) => {
    const abs = path.resolve(c);
    return EH_WINDOWS ? abs.toLowerCase() : abs;
  };
  return normalizar(a) === normalizar(b);
}

// ── Rodar programa do Windows (netsh / schtasks) ────────────────────────
//
// Diferente do PowerShell dos atalhos, aqui o CÓDIGO DE SAÍDA é informação:
// `netsh ... show rule` sai com 1 quando a regra não existe, e isso não é
// falha — é a resposta. Por isso este helper nunca rejeita: devolve o que
// aconteceu e quem chamou interpreta.
//
// Sempre `execFile` com `windowsHide: true`, NUNCA `cmd /c`: sem shell no
// meio, nenhum caractere de caminho ou de nome vira comando.
function rodar(programa, args, timeout) {
  return new Promise((resolve) => {
    execFile(
      programa,
      args,
      { timeout, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 },
      (erro, stdout, stderr) => {
        resolve({
          codigo: erro ? (typeof erro.code === "number" ? erro.code : 1) : 0,
          saida: String(stdout ?? ""),
          detalhe: String(stderr || erro?.message || "").trim().split("\n")[0] || "",
          expirou: !!erro?.killed,
        });
      },
    );
  });
}

// ── Firewall: o Windows deixa o celular do garçom entrar? ───────────────
//
// A ponte escuta em 0.0.0.0 porque o celular do garçom PRECISA alcançá-la
// pela rede do estabelecimento. Só que, na primeira vez, o Windows abre
// aquela caixa de diálogo com escudo de UAC perguntando se libera — no meio
// do expediente, na cara de quem estiver passando. Se alguém clica "Cancelar"
// (o reflexo natural), o celular do garçom fica bloqueado PARA SEMPRE e
// nenhuma tela explica por quê.
//
// O que fazemos:
//   1. CONSULTAR se a regra existe (não precisa de administrador).
//   2. Se não existe, não travar nada: registrar no log e deixar o estado
//      visível para o painel avisar em português.
//   3. Criar a regra só quando o dono pedir, num UAC único e explicado.

/**
 * Argumentos da CONSULTA da regra (não precisa de administrador).
 *
 * @param {{nome?: string}} [ctx]
 * @returns {string[]}
 */
export function argsConsultarRegraFirewall({ nome = NOME_REGRA_FIREWALL } = {}) {
  return ["advfirewall", "firewall", "show", "rule", `name=${nome}`, "dir=in"];
}

/**
 * Argumentos da CRIAÇÃO da regra. Escopo mínimo de propósito: só a porta da
 * ponte, só TCP, só entrada e só no perfil de rede PRIVADA (o Wi-Fi do
 * estabelecimento). Numa rede pública — cliente no cabo, hotel, feira — a
 * ponte continua invisível.
 *
 * Devolve `null` quando a porta não é um número válido: nada com cara de
 * comando entra na linha do `netsh`.
 *
 * @param {{nome?: string, porta: number}} ctx
 * @returns {string[]|null}
 */
export function argsCriarRegraFirewall({ nome = NOME_REGRA_FIREWALL, porta } = {}) {
  const p = Number(porta);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return null;
  return [
    "advfirewall", "firewall", "add", "rule",
    `name=${nome}`,
    "dir=in",
    "action=allow",
    "protocol=TCP",
    `localport=${p}`,
    "profile=private",
    "enable=yes",
    "description=Deixa o celular do garcom falar com a Ponte KORA pelo Wi-Fi do estabelecimento.",
  ];
}

/** Argumentos para apagar a regra (usado ao desativar/desinstalar). */
export function argsRemoverRegraFirewall({ nome = NOME_REGRA_FIREWALL } = {}) {
  return ["advfirewall", "firewall", "delete", "rule", `name=${nome}`, "dir=in"];
}

/**
 * A regra existe, a partir do que o `netsh` respondeu?
 *
 * Duas condições juntas de propósito. O código de saída sozinho não basta
 * (algumas versões respondem 0 com "nenhuma regra corresponde"), e procurar
 * texto sozinho também não. E procuramos pelo NOME da regra, que é ASCII —
 * comparar contra "Sim"/"Yes" quebraria em Windows traduzido.
 *
 * @param {{codigo: number, saida: string, nome?: string}} ctx
 * @returns {boolean}
 */
export function interpretarConsultaFirewall({ codigo, saida, nome = NOME_REGRA_FIREWALL } = {}) {
  if (codigo !== 0) return false;
  const encontrado = String(saida ?? "").toLowerCase();
  const alvo = String(nome ?? "").toLowerCase();
  return !!alvo && encontrado.includes(alvo);
}

// CRÍTICO DE SEGURANÇA — mesmo padrão de `SCRIPT_ATALHOS`: script constante,
// dados por arquivo JSON, caminho do JSON por variável de ambiente. O que
// muda aqui é o `-Verb RunAs`: é ele que pede UM UAC, de propósito, no
// momento em que o dono clicou pedindo isso — em vez do diálogo surpresa do
// Windows no meio do expediente.
const SCRIPT_FIREWALL = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$arquivo = $env:${VAR_FIREWALL}
if ([string]::IsNullOrWhiteSpace($arquivo)) {
  [Console]::Error.WriteLine('configuracao da regra nao informada')
  exit 1
}

try {
  $cfg = [System.IO.File]::ReadAllText($arquivo, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
} catch {
  [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
  exit 1
}

# Lista de argumentos vinda do JSON: cada item é DADO para o netsh, nunca um
# pedaço de linha de comando montada por concatenação.
$lista = @($cfg.argumentos)
if ($lista.Count -eq 0) {
  [Console]::Error.WriteLine('regra sem argumentos')
  exit 1
}

try {
  $p = Start-Process -FilePath 'netsh.exe' -ArgumentList $lista -Verb RunAs -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -ne 0) {
    [Console]::Error.WriteLine('o Windows recusou a criacao da regra')
    exit 1
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
  exit 1
}
`;

// Estado do firewall e da tarefa, guardado em memória. O painel pergunta o
// estado de 3 em 3 segundos: rodar `netsh` e `schtasks` a cada pergunta seria
// lançar dois processos por segundo no PC do caixa. Então respondemos o
// último resultado conhecido e mandamos perguntar de novo em segundo plano,
// no máximo de minuto em minuto.
let sondagemFirewall = { verificado: false, liberado: null, erro: null, em: 0 };
let sondagemTarefa = { verificado: false, existe: false, em: 0 };
let sondando = false;

/**
 * Decide o que fazer com a resposta do `netsh`: qual passa a ser o estado
 * conhecido do firewall, o que responder a quem perguntou e se vale escrever
 * uma linha no ponte.log. Parte pura de `consultarFirewall` — o teste confere a
 * decisão sem chamar o `netsh` da máquina de quem roda a suíte.
 *
 * @param {{antes?: {verificado: boolean, liberado: boolean|null, erro: string|null}, resultado: {codigo: number|null, saida?: string, expirou?: boolean}, porta?: number}} ctx
 * @returns {{sondagem: {verificado: boolean, liberado: boolean|null, erro: string|null}, resposta: {ok: boolean, liberado: boolean, erro: string|null}, log: string|null}}
 */
export function montarSondagemFirewall({ antes, resultado, porta = PORTA_PADRAO } = {}) {
  const anterior = antes ?? { verificado: false, liberado: null, erro: null };

  if (resultado?.expirou) {
    // "Não sei" — nunca `liberado: false`, que faria o painel acusar bloqueio
    // que ninguém confirmou.
    const erro = "O Windows demorou demais para responder sobre o firewall.";
    return {
      sondagem: { verificado: false, liberado: null, erro },
      resposta: { ok: false, liberado: false, erro },
      log: null,
    };
  }

  const liberado = interpretarConsultaFirewall({ codigo: resultado?.codigo, saida: resultado?.saida });

  // Só escreve no log quando o estado MUDA. A sondagem se repete de minuto em
  // minuto: registrar toda vez encheria o ponte.log da mesma linha e empurraria
  // para fora o que interessa (pedido, impressão, erro de verdade).
  const jaSabiaFechado = anterior.verificado && anterior.liberado === false;
  let log = null;
  if (!liberado && !jaSabiaFechado) {
    // O nome do botão sai daqui igual ao que está no painel — quem lê o
    // ponte.log vai procurar exatamente esta frase na tela.
    log = `o Windows ainda não liberou o acesso do celular à porta ${porta} — use "Liberar o celular no Wi-Fi" no painel`;
  } else if (liberado && jaSabiaFechado) {
    log = `o acesso do celular à porta ${porta} está liberado no firewall`;
  }

  return {
    sondagem: { verificado: true, liberado, erro: null },
    resposta: { ok: true, liberado, erro: null },
    log,
  };
}

/**
 * Pergunta ao Windows se a regra de entrada da ponte existe.
 * Nunca lança: falha vira `{ok:false, erro}`.
 *
 * @param {{porta?: number}} [ctx]
 * @returns {Promise<{ok: boolean, liberado: boolean, erro: string|null}>}
 */
export async function consultarFirewall({ porta = resolverPorta() } = {}) {
  if (!EH_WINDOWS) return { ok: true, liberado: true, erro: null };

  const r = await rodar("netsh", argsConsultarRegraFirewall(), TIMEOUT_CONSULTA_MS);
  const { sondagem, resposta, log } = montarSondagemFirewall({ antes: sondagemFirewall, resultado: r, porta });

  // Guarda a hora MESMO quando o netsh não respondeu: sem isso a sondagem
  // ficaria eternamente "vencida" e o painel — que pergunta de 3 em 3 segundos
  // — mandaria lançar um `netsh` atrás do outro no PC do caixa.
  sondagemFirewall = { ...sondagem, em: Date.now() };
  if (log) await registrar(log);

  return resposta;
}

/**
 * Ambiente que o PowerShell recebe na hora de criar a regra.
 *
 * É por aqui que o caminho do JSON chega ao script: ele lê
 * `$env:KORA_PONTE_FIREWALL` e, sem essa variável, para na terceira linha
 * dizendo que não recebeu configuração — o `netsh` nem chega a rodar e o
 * celular do garçom continua bloqueado. Função pura de propósito: é este elo,
 * e só ele, que separa "a regra foi criada" de "não aconteceu nada".
 *
 * @param {{env?: object, arqConfig: string}} ctx
 * @returns {object}
 */
export function montarAmbienteFirewall({ env = process.env, arqConfig } = {}) {
  return { ...env, [VAR_FIREWALL]: String(arqConfig ?? "") };
}

/**
 * Decide o que a ponte passa a SABER — e o que ela DIZ ao dono — quando a
 * liberação do firewall não chega ao fim. Parte pura de `liberarNoFirewall`: o
 * teste confere a decisão sem abrir janela de permissão nenhuma na máquina de
 * quem roda a suíte.
 *
 * São três desfechos, e virar tudo na mesma frase engana quem lê:
 *
 *   * NEM CHEGOU A RODAR (a gravação do script na pasta temporária falhou, o
 *     antivírus barrou): nenhuma janela do Windows apareceu, então mandar
 *     clicar "Sim" é mandar o dono procurar uma janela que não existe. E nada
 *     mudou no Windows, então `verificado` e `liberado` são preservados como
 *     estavam — só o `erro` é trocado, de propósito, para o painel ter o que
 *     mostrar. (Quem grava a sondagem, `liberarNoFirewall`, ainda repõe o
 *     carimbo `em` para agora: adia em até um minuto a próxima pergunta real
 *     ao Windows, o que é inofensivo porque `consultarFirewall` acabou de
 *     rodar ali em cima.)
 *   * RODOU E NINGUÉM RESPONDEU (dois minutos de janela aberta): "não sei". O
 *     dono ainda pode responder "Sim" depois do tempo e a regra nascer — dizer
 *     `liberado: false` aqui seria acusar bloqueio que ninguém confirmou.
 *   * RODOU E O WINDOWS RECUSOU: aí sim é bloqueio confirmado.
 *
 * @param {{antes?: {verificado: boolean, liberado: boolean|null, erro: string|null}, erro?: {message?: string, expirou?: boolean}, tentouRodar?: boolean}} ctx
 * @returns {{sondagem: {verificado: boolean, liberado: boolean|null, erro: string}, resposta: {ok: boolean, liberado: boolean, erro: string}, log: string}}
 */
export function montarFalhaFirewall({ antes, erro, tentouRodar = true } = {}) {
  const anterior = antes ?? { verificado: false, liberado: null, erro: null };

  let motivo;
  let sondagem;
  if (!tentouRodar) {
    motivo = "não deu para preparar a liberação neste computador";
    sondagem = { verificado: anterior.verificado === true, liberado: anterior.liberado ?? null, erro: motivo };
  } else if (erro?.expirou) {
    motivo = "ninguém respondeu à janela de permissão do Windows";
    sondagem = { verificado: false, liberado: null, erro: motivo };
  } else {
    motivo = "o Windows não deixou criar a regra";
    sondagem = { verificado: true, liberado: false, erro: motivo };
  }

  const comoResolver = tentouRodar
    // O nome entre aspas é, LETRA POR LETRA, o do botão do painel
    // (ponte/painel.html). Mandar procurar um botão com outro nome é mandar o
    // dono procurar na tela algo que não está lá.
    ? ' Clique em "Liberar o celular no Wi-Fi" de novo e responda "Sim" na janela de permissão que o Windows abrir.'
    : " Tente de novo em alguns instantes; se continuar, feche e abra a ponte outra vez.";

  // O detalhe técnico fica no ponte.log, que é onde ele ajuda — a ponte roda
  // sem janela e este arquivo é a única forma de saber o que o Windows disse.
  // Na tela vai só a frase de balcão: quem lê é o dono no meio do movimento.
  const detalhe = texto(erro?.message);
  return {
    sondagem,
    resposta: {
      ok: false,
      liberado: false,
      erro: `Não foi possível liberar o acesso do celular: ${motivo}.${comoResolver}`,
    },
    log: `liberação do firewall não concluída: ${motivo}${detalhe ? ` (${detalhe})` : ""}`,
  };
}

/**
 * Cria a regra de entrada. É a ÚNICA coisa da ponte que pede administrador, e
 * ela pede uma vez só, quando o dono clica — nunca sozinha.
 *
 * @param {{porta?: number}} [ctx]
 * @returns {Promise<{ok: boolean, liberado: boolean, erro: string|null}>}
 */
export async function liberarNoFirewall({ porta = resolverPorta() } = {}) {
  if (!EH_WINDOWS) {
    return { ok: false, liberado: false, erro: "A liberação automática do firewall só existe no Windows." };
  }

  const argumentos = argsCriarRegraFirewall({ porta });
  if (!argumentos) {
    return { ok: false, liberado: false, erro: `A porta configurada (${porta}) não é válida.` };
  }

  // Regra já existe? Então não há por que abrir a janela de permissão do
  // Windows de novo — e `netsh add` criaria uma SEGUNDA regra com o mesmo
  // nome, que depois ninguém sabe que existe para apagar.
  const antes = await consultarFirewall({ porta });
  if (antes.ok && antes.liberado) return { ok: true, liberado: true, erro: null };

  const marca = crypto.randomBytes(8).toString("hex");
  const base = path.join(os.tmpdir(), `kora-fw-${marca}`);
  const arqConfig = `${base}.json`;
  const arqScript = `${base}.ps1`;

  // Os dois `writeFile` abaixo também podem falhar (pasta temporária cheia,
  // antivírus barrando o .ps1) e a culpa não seria do Windows. Esta marca é o
  // que separa "o Windows disse não" de "a janela do Windows nem apareceu".
  let tentouRodar = false;

  try {
    await fsp.writeFile(arqConfig, JSON.stringify({ argumentos }), "utf8");
    await fsp.writeFile(arqScript, SCRIPT_FIREWALL, "utf8");
    // `rodarPowershell` (e não `rodar`) porque só ele passa o ambiente: sem a
    // variável com o caminho da configuração o script sai sem fazer nada.
    tentouRodar = true;
    await rodarPowershell(["-File", arqScript], {
      timeout: TIMEOUT_FIREWALL_MS,
      env: montarAmbienteFirewall({ arqConfig }),
    });
  } catch (e) {
    const { sondagem, resposta, log } = montarFalhaFirewall({ antes: sondagemFirewall, erro: e, tentouRodar });
    sondagemFirewall = { ...sondagem, em: Date.now() };
    await registrar(log);
    return resposta;
  } finally {
    await Promise.all([arqConfig, arqScript].map((a) => fsp.rm(a, { force: true }).catch(() => {})));
  }

  await registrar(`acesso do celular liberado no firewall (porta ${porta}, só rede privada)`);
  sondagemFirewall = { verificado: true, liberado: true, erro: null, em: Date.now() };
  return { ok: true, liberado: true, erro: null };
}

// ── Tarefa Agendada: a ponte volta sozinha ──────────────────────────────
//
// O atalho na pasta Inicialização faz UMA coisa: dispara no logon. Se a ponte
// morrer às 13h de um sábado cheio, ela fica morta — e como o programa não tem
// janela, ninguém percebe. A Tarefa Agendada resolve os dois lados:
//   * tenta subir a ponte de novo a cada dois minutos (`Repetition`), e se ela
//     já estiver no ar o Windows nem lança o programa (`IgnoreNew`);
//   * se o programa cair com erro, ainda tenta 3 vezes (`RestartOnFailure`).
//
// Tudo isso é `schtasks` do próprio Windows, criado NO USUÁRIO: não pede
// administrador, não custa nada e não instala programa de terceiro.
//
// O que a tarefa NÃO resolve: subir antes de alguém fazer logon. Isso exigiria
// rodar como SISTEMA, que pede administrador — e a instalação da ponte é sem
// UAC de propósito. Se o PC reiniciar de madrugada e ninguém entrar na conta,
// a ponte só sobe quando alguém entrar. Está assim na documentação.

/**
 * Escapa texto que vai para dentro do XML da tarefa. Caminho de usuário com
 * `&` (existe: "Bar & Grill") quebraria o XML e a tarefa não seria criada.
 *
 * @param {string} valor
 * @returns {string}
 */
export function escaparXml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]
  ));
}

/**
 * XML da tarefa agendada. Função pura — o teste confere justamente as opções
 * cujos padrões do Windows quebrariam a ponte:
 *
 * - `ExecutionTimeLimit` PT0S: o padrão é 3 DIAS, e ao fim deles o Windows
 *   MATA a tarefa. O PC do caixa fica ligado meses.
 * - `DisallowStartIfOnBatteries` / `StopIfGoingOnBatteries` falsos: o padrão é
 *   verdadeiro, e num caixa que é notebook a ponte não subiria (ou cairia) na
 *   bateria.
 * - `MultipleInstancesPolicy` IgnoreNew: a repetição de dois em dois minutos
 *   não pode gerar uma segunda ponte.
 *
 * @param {{exe: string, argumentos?: string, usuario?: string, repeticao?: string, descricao?: string}} ctx
 * @returns {string}
 */
export function montarXmlTarefa({
  exe,
  argumentos = ARG_AUTOSTART,
  usuario = "",
  repeticao = REPETICAO_TAREFA,
  descricao = DESCRICAO_ATALHO,
} = {}) {
  const principal = texto(usuario)
    ? `      <UserId>${escaparXml(usuario)}</UserId>\n`
    : "";
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${escaparXml(descricao)}</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>${escaparXml(repeticao)}</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Autor">
${principal}      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Autor">
    <Exec>
      <Command>${escaparXml(exe)}</Command>
      <Arguments>${escaparXml(argumentos)}</Arguments>
      <WorkingDirectory>${escaparXml(path.dirname(exe ?? ""))}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

/** Argumentos do `schtasks` para criar/substituir a tarefa a partir do XML. */
export function argsCriarTarefa({ nome = NOME_TAREFA, arquivoXml } = {}) {
  return ["/Create", "/TN", nome, "/XML", String(arquivoXml ?? ""), "/F"];
}

/** Argumentos do `schtasks` para conferir se a tarefa existe. */
export function argsConsultarTarefa({ nome = NOME_TAREFA } = {}) {
  return ["/Query", "/TN", nome];
}

/** Argumentos do `schtasks` para apagar a tarefa, sem perguntar nada. */
export function argsRemoverTarefa({ nome = NOME_TAREFA } = {}) {
  return ["/Delete", "/TN", nome, "/F"];
}

/**
 * A tarefa existe? O `schtasks /Query` sai com 0 quando achou e diferente de
 * zero quando não achou — aqui o código de saída é resposta, não falha.
 *
 * @param {{codigo: number}} ctx
 * @returns {boolean}
 */
export function interpretarConsultaTarefa({ codigo } = {}) {
  return codigo === 0;
}

/**
 * Cria (ou refaz) a tarefa agendada apontando para o exe instalado.
 *
 * O XML vai para o disco em UTF-16: o `schtasks` recusa arquivo em UTF-8 sem
 * marca de ordem de bytes ("O arquivo XML não é válido"), e essa é a causa
 * clássica de a tarefa não nascer.
 *
 * @param {string} exe caminho do executável instalado
 * @returns {Promise<{ok: boolean, erro: string|null}>}
 */
export async function criarTarefaAgendada(exe) {
  if (!EH_WINDOWS) return { ok: false, erro: "Tarefa agendada só existe no Windows." };

  let usuario = "";
  try {
    usuario = texto(os.userInfo().username);
  } catch {
    // Sem nome de usuário o `schtasks` assume quem está criando. Segue.
  }

  const xml = montarXmlTarefa({ exe, usuario });
  const marca = crypto.randomBytes(8).toString("hex");
  const arquivo = path.join(os.tmpdir(), `kora-tarefa-${marca}.xml`);

  try {
    await fsp.writeFile(arquivo, `\uFEFF${xml}`, "utf16le");
    const r = await rodar("schtasks", argsCriarTarefa({ arquivoXml: arquivo }), TIMEOUT_CONSULTA_MS);
    if (r.codigo !== 0) {
      const motivo = r.expirou ? "o Windows demorou demais para responder" : (r.detalhe || "o Windows recusou a tarefa");
      sondagemTarefa = { verificado: true, existe: false, em: Date.now() };
      return { ok: false, erro: motivo };
    }
  } catch (e) {
    return { ok: false, erro: e?.message ?? "falha desconhecida" };
  } finally {
    await fsp.rm(arquivo, { force: true }).catch(() => {});
  }

  sondagemTarefa = { verificado: true, existe: true, em: Date.now() };
  return { ok: true, erro: null };
}

/**
 * Apaga a tarefa agendada. Tarefa que não existe não é erro — o dono pode
 * clicar em "desligar" duas vezes.
 *
 * @returns {Promise<{ok: boolean, removida: boolean, erro: string|null}>}
 */
export async function removerTarefaAgendada() {
  if (!EH_WINDOWS) return { ok: true, removida: false, erro: null };

  const existia = await rodar("schtasks", argsConsultarTarefa(), TIMEOUT_CONSULTA_MS);
  if (!interpretarConsultaTarefa({ codigo: existia.codigo })) {
    sondagemTarefa = { verificado: true, existe: false, em: Date.now() };
    return { ok: true, removida: false, erro: null };
  }

  const r = await rodar("schtasks", argsRemoverTarefa(), TIMEOUT_CONSULTA_MS);
  if (r.codigo !== 0) {
    return { ok: false, removida: false, erro: r.detalhe || "o Windows não deixou remover a tarefa" };
  }
  sondagemTarefa = { verificado: true, existe: false, em: Date.now() };
  return { ok: true, removida: true, erro: null };
}

/** Pergunta ao Windows se a tarefa agendada está lá. */
export async function consultarTarefaAgendada() {
  if (!EH_WINDOWS) return { ok: true, existe: false, erro: null };
  const r = await rodar("schtasks", argsConsultarTarefa(), TIMEOUT_CONSULTA_MS);
  const existe = interpretarConsultaTarefa({ codigo: r.codigo });
  sondagemTarefa = { verificado: true, existe, em: Date.now() };
  return { ok: true, existe, erro: null };
}

// ── Estado (o painel do caixa pergunta a cada 3s) ───────────────────────

/**
 * Monta o estado a partir dos caminhos já resolvidos. Versão pura de
 * `estadoInstalacao` — o teste injeta caminhos de `os.tmpdir()`.
 *
 * `autoStart` responde a pergunta do dono ("ela sobe sozinha?"), e hoje há
 * dois jeitos de isso ser verdade: a tarefa agendada (o jeito bom) ou o atalho
 * antigo na Inicialização (quem instalou antes e ainda não reinstalou).
 *
 * `firewall.em` é a hora em que essa resposta sobre o firewall foi apurada —
 * NÃO a hora desta consulta. O que sai daqui é a última sondagem conhecida, e
 * ela pode ter até um minuto de idade (`VALIDADE_SONDAGEM_MS`). Sem esse
 * carimbo, o painel — que pergunta de 3 em 3 segundos — não teria como
 * distinguir "o Windows já respondeu sobre o clique de agora" de "esta é a
 * mesma resposta de antes do clique", e acabaria cravando fracasso com a
 * janela de permissão ainda aberta na frente do dono. Vale 0 enquanto ninguém
 * perguntou ao Windows. Mesmo relógio do painel: ele só é servido no PC do
 * caixa, que é este.
 *
 * @returns {{empacotado: boolean, instalado: boolean, autoStart: boolean, autoStartPorTarefa: boolean, versao: string, caminhoAtual: string, caminhoInstalado: string, firewall: {verificado: boolean, liberado: boolean|null, erro: string|null, em: number}}}
 */
export function montarEstado({
  empacotado,
  execPath,
  caminhoInstalado,
  caminhoAutoStart,
  existe = existeCaminho,
  tarefaAgendada = false,
  firewall = { verificado: false, liberado: null, erro: null },
  versao = VERSAO,
}) {
  return {
    empacotado: !!empacotado,
    instalado: existe(caminhoInstalado),
    autoStart: !!tarefaAgendada || existe(caminhoAutoStart),
    autoStartPorTarefa: !!tarefaAgendada,
    versao: versao ?? "",
    caminhoAtual: execPath ?? "",
    caminhoInstalado: caminhoInstalado ?? "",
    firewall: {
      verificado: !!firewall?.verificado,
      liberado: firewall?.verificado ? !!firewall.liberado : null,
      erro: firewall?.erro ?? null,
      em: Number(firewall?.em) || 0,
    },
  };
}

/**
 * Está na hora de perguntar de novo ao Windows? Parte pura de
 * `agendarSondagem` — o teste confere a decisão sem lançar processo nenhum.
 *
 * O que manda é a hora da última TENTATIVA, não o resultado dela. Se o `netsh`
 * travou e não respondeu, perguntar de novo três segundos depois só empilha
 * processo no PC do caixa: a resposta seria a mesma. Como `em` nasce 0, a
 * primeira sondagem continua acontecendo na hora.
 *
 * @param {{firewall?: {em?: number}, tarefa?: {em?: number}, agora?: number, validade?: number}} ctx
 * @returns {boolean}
 */
export function deveSondar({ firewall, tarefa, agora = Date.now(), validade = VALIDADE_SONDAGEM_MS } = {}) {
  const vencido = (s) => {
    const em = Number(s?.em) || 0;
    return !em || agora - em > validade;
  };
  return vencido(firewall) || vencido(tarefa);
}

/**
 * Manda perguntar ao Windows (firewall e tarefa) sem fazer ninguém esperar.
 *
 * Só no executável: em desenvolvimento — e, principalmente, na suíte de
 * testes — nada aqui pode sair lançando `netsh` e `schtasks` no PC de quem
 * está rodando.
 */
function agendarSondagem() {
  if (!EMPACOTADO || !EH_WINDOWS || sondando) return;
  if (!deveSondar({ firewall: sondagemFirewall, tarefa: sondagemTarefa })) return;

  sondando = true;
  Promise.allSettled([consultarFirewall(), consultarTarefaAgendada()])
    .catch(() => {})
    .finally(() => { sondando = false; });
}

/**
 * Estado atual da instalação. Síncrona e barata de propósito: o painel do
 * caixa chama de poucos em poucos segundos, então aqui só entram dois
 * `existsSync` — o que depende do Windows responder (firewall, tarefa) sai do
 * último resultado conhecido, e a próxima consulta é agendada em segundo plano.
 */
export function estadoInstalacao() {
  agendarSondagem();
  return montarEstado({
    empacotado: EMPACOTADO,
    execPath: process.execPath,
    caminhoInstalado: caminhoExeInstalado(),
    caminhoAutoStart: caminhosAtalhos().startup,
    tarefaAgendada: sondagemTarefa.existe,
    firewall: sondagemFirewall,
  });
}

// ── Criação dos atalhos (.lnk) ──────────────────────────────────────────
//
// CRÍTICO DE SEGURANÇA — mesmo padrão de lib/impressoras.js:
// NENHUM caminho é interpolado dentro deste script. Ele é uma constante fixa;
// os caminhos reais vão num arquivo JSON temporário e o PowerShell LÊ esse
// arquivo. Nem o caminho do próprio JSON aparece aqui: ele chega por variável
// de ambiente. Assim, um caminho hostil (com aspas, `;`, `$(...)`) é sempre
// DADO, nunca comando — o equivalente a usar query parametrizada em vez de
// concatenar SQL.
const SCRIPT_ATALHOS = `$ErrorActionPreference = 'Stop'
# Sem isto o acento da mensagem de erro chega quebrado no log da ponte.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$arquivo = $env:${VAR_CONFIG}
if ([string]::IsNullOrWhiteSpace($arquivo)) {
  [Console]::Error.WriteLine('configuracao dos atalhos nao informada')
  exit 1
}

try {
  $cfg = [System.IO.File]::ReadAllText($arquivo, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $shell = New-Object -ComObject WScript.Shell
} catch {
  [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
  exit 1
}

# Cada atalho é uma tentativa independente: se a Área de Trabalho falhar, o da
# Inicialização (que é o que faz a ponte subir com o Windows, o importante)
# ainda tem que ser criado. Por isso o try/catch é DENTRO do laço.
$falhas = @()
foreach ($item in @($cfg.atalhos)) {
  try {
    $pasta = [System.IO.Path]::GetDirectoryName($item.lnk)
    if (-not [System.IO.Directory]::Exists($pasta)) {
      [void][System.IO.Directory]::CreateDirectory($pasta)
    }
    $atalho = $shell.CreateShortcut($item.lnk)
    $atalho.TargetPath = $item.alvo
    $atalho.WorkingDirectory = $item.trabalho
    $atalho.IconLocation = $item.alvo
    $atalho.Description = $item.descricao
    # Só o atalho da Inicialização traz argumento (--autostart). Vem do mesmo
    # JSON, como DADO — nunca concatenado no comando.
    if ($null -ne $item.argumentos) { $atalho.Arguments = [string]$item.argumentos }
    $atalho.Save()
  } catch {
    # Só a causa raiz — o embrulho do PowerShell não ajuda quem lê a tela.
    $falhas += $_.Exception.GetBaseException().Message
  }
}

if ($falhas.Count -gt 0) {
  [Console]::Error.WriteLine($falhas[0])
  exit 1
}
`;

function rodarPowershell(args, { timeout, env }) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [...POWERSHELL_BASE, ...args],
      { timeout, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024, env },
      (erro, stdout, stderr) => {
        if (erro) {
          const detalhe = String(stderr || erro.message || "").trim().split("\n")[0] || "sem detalhe";
          const causa = erro.killed ? "o Windows demorou demais para responder" : detalhe;
          const falha = new Error(causa);
          // "Demorou" e "recusou" viram frases diferentes na tela do caixa —
          // quem chamou precisa conseguir separar as duas coisas.
          falha.expirou = !!erro.killed;
          return reject(falha);
        }
        resolve(String(stdout ?? ""));
      },
    );
  });
}

/**
 * Monta o que o PowerShell vai ler para criar os atalhos. Versão pura
 * (nada de disco, nada de ambiente) — é por aqui que o teste garante que o
 * `--autostart` fica SÓ na Inicialização.
 *
 * `incluirInicializacao` é falso quando a tarefa agendada ficou de pé: com os
 * dois no lugar, o Windows tentaria subir a ponte duas vezes no logon.
 *
 * @param {{alvo: string, startup: string, areaTrabalho: string, incluirInicializacao?: boolean}} ctx
 * @returns {{atalhos: Array<{lnk: string, alvo: string, trabalho: string, argumentos: string, descricao: string}>}}
 */
export function montarConfigAtalhos({ alvo, startup, areaTrabalho, incluirInicializacao = true }) {
  const trabalho = path.dirname(alvo);
  const atalhos = [];
  if (incluirInicializacao) {
    // Inicialização do Windows: sobe calada junto com o PC.
    atalhos.push({ lnk: startup, alvo, trabalho, argumentos: ARG_AUTOSTART, descricao: DESCRICAO_ATALHO });
  }
  // Área de Trabalho: é o dono clicando de propósito — abre o painel.
  atalhos.push({ lnk: areaTrabalho, alvo, trabalho, argumentos: "", descricao: DESCRICAO_ATALHO });
  return { atalhos };
}

/**
 * Cria (ou refaz) os atalhos apontando para o exe instalado.
 * @returns {Promise<{ok: true} | {ok: false, erro: string}>}
 */
async function criarAtalhos(alvo, { incluirInicializacao = true } = {}) {
  const { startup, areaTrabalho } = caminhosAtalhos();
  const config = montarConfigAtalhos({ alvo, startup, areaTrabalho, incluirInicializacao });

  // Nomes só com hexadecimal: o que vai para a linha de comando é gerado
  // aqui, nunca vem de fora.
  const marca = crypto.randomBytes(8).toString("hex");
  const base = path.join(os.tmpdir(), `kora-inst-${marca}`);
  const arqConfig = `${base}.json`;
  const arqScript = `${base}.ps1`;

  try {
    await fsp.writeFile(arqConfig, JSON.stringify(config), "utf8");
    await fsp.writeFile(arqScript, SCRIPT_ATALHOS, "utf8");
    await rodarPowershell(["-File", arqScript], {
      timeout: TIMEOUT_ATALHOS_MS,
      env: { ...process.env, [VAR_CONFIG]: arqConfig },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: `Não foi possível criar os atalhos da ponte (${e.message}).` };
  } finally {
    // Sempre limpa, inclusive em erro — senão a pasta temporária do PC do
    // caixa vai acumulando um par de arquivos por instalação.
    await Promise.all([arqConfig, arqScript].map((a) => fsp.rm(a, { force: true }).catch(() => {})));
  }
}

// ── Atualização: rodar um .exe mais novo troca o que está instalado ─────
//
// Sem isto, o PC do caixa fica congelado na build do dia em que instalou: o
// dono baixa a versão nova, dá dois cliques, e o programa que continua no ar
// é o velho — correções de segurança e de impressão inclusive. Como a pasta
// `dist/` não vai para o git, ninguém percebe.

/**
 * Compara duas versões no formato `1.2.3`.
 *
 * Devolve 0 quando ALGUMA das duas é desconhecida: aí quem decide é a data do
 * arquivo, não um palpite de que "sem versão" significa versão zero.
 *
 * @returns {-1|0|1}
 */
export function compararVersoes(a, b) {
  const partes = (v) => {
    if (typeof v !== "string") return null;
    const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const pa = partes(a);
  const pb = partes(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function paraMilissegundos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const t = valor instanceof Date ? valor.getTime() : new Date(valor).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Vale a pena trocar o programa instalado pelo que está rodando agora?
 *
 * Função pura, e é ela quem impede os dois erros caros: deixar o caixa numa
 * build velha, e REBAIXAR uma instalação boa porque alguém deu dois cliques
 * num `.exe` antigo que estava esquecido no Downloads.
 *
 * Ordem das perguntas:
 * 1. Não há nada instalado → instala.
 * 2. Mesma impressão digital → é o mesmo arquivo, não mexe.
 * 3. Versões diferentes → ganha a maior.
 * 4. Mesma versão, arquivo diferente (o caso do dia a dia: a versão não muda a
 *    cada correção) → ganha o arquivo de origem mais novo.
 *
 * @param {{atual: {versao?: string, hash?: string, origemEm?: string|Date}|null, instalado: {versao?: string, hash?: string, origemEm?: string|Date}|null}} ctx
 * @returns {{atualizar: boolean, motivo: string}}
 */
export function decidirAtualizacao({ atual, instalado } = {}) {
  if (!instalado) return { atualizar: true, motivo: "ainda não havia programa instalado" };
  if (atual?.hash && instalado?.hash && atual.hash === instalado.hash) {
    return { atualizar: false, motivo: "o programa instalado já é exatamente este" };
  }

  const cmp = compararVersoes(atual?.versao, instalado?.versao);
  if (cmp > 0) return { atualizar: true, motivo: `versão ${atual.versao} no lugar da ${instalado.versao}` };
  if (cmp < 0) return { atualizar: false, motivo: `o programa instalado (versão ${instalado.versao}) é mais novo que este` };

  const a = paraMilissegundos(atual?.origemEm);
  const b = paraMilissegundos(instalado?.origemEm);
  if (a === null) return { atualizar: false, motivo: "não deu para saber qual dos dois é mais novo" };
  // Instalação antiga, de antes desta ficha: não há de quando ela é. O
  // arquivo que está rodando agora pelo menos se identifica.
  if (b === null) return { atualizar: true, motivo: "o programa instalado não diz de quando é" };
  if (a > b) return { atualizar: true, motivo: "este arquivo é mais novo que o instalado" };
  return { atualizar: false, motivo: "o programa instalado é igual ou mais novo" };
}

/** Impressão digital do arquivo, lida em pedaços (o .exe tem ~58 MB). */
function hashArquivo(caminho) {
  return new Promise((resolve) => {
    try {
      const soma = crypto.createHash("sha256");
      const fluxo = fs.createReadStream(caminho);
      fluxo.on("data", (p) => soma.update(p));
      fluxo.on("error", () => resolve(""));
      fluxo.on("end", () => resolve(soma.digest("hex")));
    } catch {
      resolve("");
    }
  });
}

function lerJsonSeguro(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return null;
  }
}

/** Ficha do executável que está rodando agora (versão, impressão digital, data). */
async function fichaDoAtual(exe) {
  let origemEm = null;
  try {
    origemEm = (await fsp.stat(exe)).mtime.toISOString();
  } catch {
    // Sem data: `decidirAtualizacao` prefere não mexer, que é o certo.
  }
  return { versao: VERSAO, hash: await hashArquivo(exe), bytes: await tamanho(exe), origemEm };
}

async function tamanho(arquivo) {
  try {
    return (await fsp.stat(arquivo)).size;
  } catch {
    return 0;
  }
}

/**
 * Ficha do que já está instalado. Usa a ficha gravada na instalação anterior
 * quando ela bate com o tamanho do arquivo — assim não precisa reler 58 MB a
 * cada clique. Se não houver ficha (instalação antiga), calcula na hora e usa
 * a data do próprio arquivo.
 */
async function fichaDoInstalado(exe) {
  if (!existeCaminho(exe)) return null;

  let bytes = 0;
  let dataArquivo = null;
  try {
    const st = await fsp.stat(exe);
    bytes = st.size;
    dataArquivo = st.mtime.toISOString();
  } catch {
    return null;
  }

  const marca = lerJsonSeguro(caminhoMarcaInstalacao());
  if (marca && marca.bytes === bytes && typeof marca.hash === "string" && marca.hash) {
    return { versao: marca.versao ?? "", hash: marca.hash, bytes, origemEm: marca.origemEm ?? dataArquivo };
  }
  return { versao: "", hash: await hashArquivo(exe), bytes, origemEm: dataArquivo };
}

/**
 * As operações de disco da troca, num objeto só. É o que o teste substitui por
 * versões de mentira para poder ensaiar o disco cheio e o exe travado pelo
 * Windows sem precisar de um disco cheio nem de um exe travado.
 */
const OPS_ARQUIVO = {
  rename: (de, para) => fsp.rename(de, para),
  copyFile: (de, para) => fsp.copyFile(de, para),
  rm: (alvo) => fsp.rm(alvo, { force: true }),
  existe: (alvo) => existeCaminho(alvo),
};

/**
 * Troca o executável instalado com o Windows segurando o arquivo antigo.
 *
 * O Windows não deixa SOBRESCREVER um `.exe` em execução — mas deixa RENOMEAR.
 * Então o antigo sai da frente, o novo entra no lugar certo, e o antigo é
 * apagado depois (se ainda estiver rodando, o Windows recusa e ele fica para a
 * próxima instalação limpar, via `limparRestos`).
 *
 * Se a cópia falhar no meio, o desfazer tem DUAS etapas, nesta ordem: apagar o
 * pedaço que a cópia deixou no destino e só então trazer o antigo de volta. O
 * `copyFile` do sistema cria e trunca o destino ANTES de escrever, então disco
 * cheio deixa lá um KoraPonte.exe pela metade — que não abre e é pior do que
 * exe nenhum, porque ninguém vê que está quebrado e a próxima limpeza ainda
 * levaria a única cópia boa. Um caixa sem KoraPonte.exe é um caixa sem comanda
 * saindo; um caixa com KoraPonte.exe truncado é a mesma coisa, calada. O erro
 * original sobe de qualquer jeito: quem chamou precisa saber que não trocou.
 *
 * As operações de arquivo entram por parâmetro justamente para o teste
 * conseguir ensaiar os dois desastres (cópia que falha no meio, exe antigo que
 * o Windows não deixa apagar) sem depender da sorte da máquina.
 *
 * @param {{origem: string, destino: string, fs?: {rename?: Function, copyFile?: Function, rm?: Function, existe?: Function}}} ctx
 * @returns {Promise<{antigo: string, sobrou: boolean}>}
 */
export async function trocarExecutavel({ origem, destino, fs: operacoes } = {}) {
  const ops = { ...OPS_ARQUIVO, ...(operacoes ?? {}) };
  const marca = crypto.randomBytes(4).toString("hex");
  const antigo = `${destino}${SUFIXO_ANTIGO}${marca}`;
  let saiuDaFrente = false;

  try {
    if (ops.existe(destino)) {
      await ops.rename(destino, antigo);
      saiuDaFrente = true;
    }
    await ops.copyFile(origem, destino);
  } catch (e) {
    if (saiuDaFrente) {
      // Primeiro o pedaço truncado sai da frente; só então o programa que
      // funciona volta ao lugar. Nenhum dos dois lança: o erro que interessa é
      // o da cópia, e ele é relançado logo abaixo.
      await ops.rm(destino).catch(() => {});
      await ops.rename(antigo, destino).catch(() => {});
    }
    throw e;
  }

  // A sobra não é falha: o exe antigo ainda pode estar no ar segurando o
  // próprio arquivo. Ele sai na próxima subida.
  let sobrou = false;
  if (saiuDaFrente) {
    await ops.rm(antigo).catch(() => { sobrou = true; });
  }
  return { antigo, sobrou };
}

/** Varre sobras de atualizações anteriores (o `.antigo-...` que ficou travado). */
export async function limparRestos(dir) {
  try {
    const itens = await fsp.readdir(dir);
    const alvo = `${NOME_EXE}${SUFIXO_ANTIGO}`;
    await Promise.all(
      itens
        .filter((n) => n.startsWith(alvo))
        .map((n) => fsp.rm(path.join(dir, n), { force: true }).catch(() => {})),
    );
  } catch {
    // Pasta ainda não existe (primeira instalação) — nada a limpar.
  }
}

async function gravarMarca(ficha) {
  try {
    await fsp.writeFile(
      caminhoMarcaInstalacao(),
      JSON.stringify({ ...ficha, instaladoEm: new Date().toISOString() }),
      "utf8",
    );
  } catch {
    // Sem a ficha a atualização ainda funciona (cai na impressão digital
    // calculada na hora) — só fica mais lenta. Não vale falhar a instalação.
  }
}

// ── Instalar / desinstalar ──────────────────────────────────────────────

function explicarCopia(e) {
  if (e?.code === "EBUSY" || e?.code === "EPERM" || e?.code === "ETXTBSY") {
    return "A ponte já instalada parece estar aberta. Feche a janela dela (ou o ícone perto do relógio) e tente de novo.";
  }
  if (e?.code === "ENOSPC") return "Não há espaço em disco para instalar a ponte.";
  return e?.message ?? "falha desconhecida";
}

/**
 * Põe ESTE executável no lugar do que está instalado, quando ele for mais novo.
 *
 * É a parte "atualizar" da instalação, separada de propósito: quando o dono
 * baixa a versão nova e dá dois cliques, a ponte velha já está no ar segurando
 * a porta — o programa novo precisa conseguir se copiar por cima e sair, sem
 * mexer em atalho, tarefa nem firewall.
 *
 * Não troca nada quando a cópia instalada já é a mesma ou mais nova (quem
 * decide é `decidirAtualizacao`).
 *
 * Durante a troca a pasta FICA sem executável por um instante: o Windows não
 * deixa sobrescrever um `.exe` em execução, então o antigo é renomeado para
 * fora do caminho ANTES de o novo ser copiado (ver `trocarExecutavel`). O que
 * está garantido é o desfazer: se a cópia falhar no meio, o pedaço truncado é
 * apagado e o programa antigo volta ao lugar. Nunca lança — falha vira
 * `{ok:false, erro}`.
 *
 * @returns {Promise<{ok: boolean, atualizou: boolean, jaEraEste: boolean, motivo: string, caminho: string|null, erro: string|null}>}
 */
export async function atualizarInstalado() {
  const destino = caminhoExeInstalado();
  const origem = process.execPath;
  const resposta = (extra) => ({
    ok: true,
    atualizou: false,
    jaEraEste: false,
    motivo: "",
    caminho: destino,
    erro: null,
    ...extra,
  });

  if (!EMPACOTADO) {
    return resposta({
      ok: false,
      caminho: null,
      erro: "Atualizar só faz sentido no programa pronto (KoraPonte.exe). Em modo de desenvolvimento a ponte roda pelo `node servidor.js`.",
    });
  }

  // Restos de uma atualização anterior (`KoraPonte.exe.antigo-…`): o Windows só
  // deixa apagar depois que aquele exe saiu do ar, e este é o momento.
  await limparRestos(path.dirname(destino));

  // Rodando já a partir da cópia instalada (o caso normal do dia a dia, via
  // atalho ou tarefa): não faz sentido copiar em cima de si mesma.
  if (mesmoCaminho(origem, destino)) {
    return resposta({ jaEraEste: true, motivo: "esta é a cópia que já está instalada" });
  }

  let motivo = "";
  try {
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    const [fichaAtual, fichaInstalada] = await Promise.all([fichaDoAtual(origem), fichaDoInstalado(destino)]);
    const decisao = decidirAtualizacao({ atual: fichaAtual, instalado: fichaInstalada });
    motivo = decisao.motivo;

    if (!decisao.atualizar) {
      await registrar(`programa NÃO foi substituído — ${motivo}`);
      return resposta({ motivo });
    }

    await trocarExecutavel({ origem, destino });
    await gravarMarca(fichaAtual);
    const trocou = !!fichaInstalada;
    await registrar(
      trocou
        ? `programa atualizado em ${destino} — ${motivo} (versão ${fichaAtual.versao || "desconhecida"})`
        : `programa instalado em ${destino} (versão ${fichaAtual.versao || "desconhecida"})`,
    );
    return resposta({ atualizou: trocou, motivo });
  } catch (e) {
    return resposta({
      ok: false,
      motivo,
      erro: `Não foi possível copiar a ponte para a pasta do programa: ${explicarCopia(e)}`,
    });
  }
}

/**
 * Instala (ou atualiza) a ponte no PC do caixa:
 * - copia o próprio executável para %LOCALAPPDATA%\KORA\Ponte\KoraPonte.exe,
 *   substituindo o que estiver lá quando este arquivo for mais novo;
 * - cria a Tarefa Agendada que faz a ponte subir com o Windows e VOLTAR
 *   sozinha se ela morrer;
 * - cria o atalho da Área de Trabalho (e o da Inicialização só se a tarefa não
 *   tiver dado certo — os dois juntos subiriam a ponte duas vezes);
 * - confere se o Windows já liberou o acesso do celular, sem pedir nada.
 *
 * Os atalhos apontam para a CÓPIA, nunca para o arquivo de onde o usuário
 * rodou, que pode estar no pen drive ou no Downloads.
 *
 * Nunca lança: erro vira `{ok:false, erro}` com texto que o caixa entende.
 *
 * @returns {Promise<{ok: boolean, jaEstava: boolean, atualizou: boolean, motivo: string, reiniciar: boolean, autoStart: string, firewall: {liberado: boolean|null, erro: string|null}, caminho: string|null, erro: string|null}>}
 */
export async function instalar() {
  const recusa = (erro) => ({
    ok: false,
    jaEstava: false,
    atualizou: false,
    motivo: "",
    reiniciar: false,
    autoStart: "nenhum",
    firewall: { liberado: null, erro: null },
    caminho: null,
    erro,
  });

  if (!EMPACOTADO) {
    return recusa(
      "Instalar só faz sentido no programa pronto (KoraPonte.exe). Em modo de desenvolvimento a ponte roda pelo `node servidor.js`.",
    );
  }
  if (!EH_WINDOWS) {
    return recusa("A instalação automática só existe no Windows. Em outros sistemas, rode o executável direto.");
  }

  const destino = caminhoExeInstalado();
  const jaEstava = mesmoCaminho(process.execPath, destino);

  // Copiar/atualizar o exe é a mesma coisa que o programa novo faz sozinho
  // quando encontra a ponte velha já no ar — por isso mora em função separada.
  const copia = await atualizarInstalado();
  if (!copia.ok) {
    return {
      ok: false,
      jaEstava,
      atualizou: false,
      motivo: copia.motivo,
      reiniciar: false,
      autoStart: "nenhum",
      firewall: { liberado: null, erro: null },
      caminho: destino,
      erro: copia.erro,
    };
  }
  const atualizou = copia.atualizou;
  const motivo = copia.motivo;

  // Auto-start: a tarefa agendada primeiro, porque é ela que faz a ponte
  // VOLTAR sozinha. O atalho da Inicialização vira plano B.
  const tarefa = await criarTarefaAgendada(destino);
  const atalhos = await criarAtalhos(destino, { incluirInicializacao: !tarefa.ok });

  if (tarefa.ok) {
    // Quem instalou antes desta versão tem o atalho na Inicialização. Com a
    // tarefa no ar ele viraria uma segunda tentativa de subir a ponte no
    // logon — some com ele.
    await removerAtalhos([caminhosAtalhos().startup]);
    await registrar("auto-start pela Tarefa Agendada do Windows (volta sozinha se cair)");
  } else {
    await registrar(`tarefa agendada não pôde ser criada (${tarefa.erro}) — auto-start pelo atalho da Inicialização`);
  }

  if (!atalhos.ok) {
    // O exe já está no lugar certo; só os atalhos falharam. Vale contar a
    // verdade: dá para abrir pela pasta enquanto isso.
    return {
      ok: false,
      jaEstava,
      atualizou,
      motivo,
      reiniciar: false,
      autoStart: tarefa.ok ? "tarefa" : "nenhum",
      firewall: { liberado: null, erro: null },
      caminho: destino,
      erro: atalhos.erro,
    };
  }

  // Firewall: só olha. Criar a regra pede administrador e é uma ação à parte,
  // pedida pelo dono — nunca um UAC surpresa no fim da instalação.
  const firewall = await consultarFirewall();

  return {
    ok: true,
    jaEstava,
    atualizou,
    motivo,
    // Quando o processo em execução NÃO é a cópia instalada, quem está no ar
    // ainda é o arquivo solto (pen drive/Downloads) — ou, numa atualização, a
    // versão VELHA. O servidor usa este sinal para avisar: pode fechar esta
    // janela e abrir pelo atalho.
    reiniciar: !jaEstava,
    autoStart: tarefa.ok ? "tarefa" : "atalho",
    firewall: { liberado: firewall.ok ? firewall.liberado : null, erro: firewall.erro },
    caminho: destino,
    erro: null,
  };
}

/**
 * Tira os atalhos (Inicialização + Área de Trabalho, ou os que forem pedidos).
 *
 * NUNCA mexe na pasta de dados: token do estabelecimento, pedidos e comandas
 * ainda na fila de impressão moram lá. Tirar o atalho é decisão de conforto;
 * apagar comanda que não saiu seria prejuízo.
 *
 * @param {string[]} [alvos] caminhos a remover — em produção, quem chama sem
 *   argumento está pedindo "tire tudo".
 * @returns {Promise<{ok: boolean, removidos: number, erro: string|null}>}
 */
export async function removerAtalhos(alvos) {
  const lista = Array.isArray(alvos) && alvos.length
    ? alvos
    : Object.values(caminhosAtalhos());

  let removidos = 0;
  const falhas = [];

  for (const alvo of lista) {
    try {
      if (!existeCaminho(alvo)) continue; // já não estava lá — nada a fazer
      await fsp.rm(alvo, { force: true });
      removidos += 1;
    } catch (e) {
      falhas.push(e?.message ?? "falha desconhecida");
    }
  }

  return {
    ok: falhas.length === 0,
    removidos,
    erro: falhas.length ? `Não foi possível remover ${falhas.length} atalho(s): ${falhas[0]}` : null,
  };
}

/**
 * "Não suba mais junto com o Windows."
 *
 * Desliga o auto-start pelos DOIS caminhos que hoje existem: apaga a Tarefa
 * Agendada e o atalho da pasta Inicialização (quem instalou antes ainda tem
 * esse atalho). O ícone da Área de Trabalho FICA — o dono continua querendo
 * abrir a ponte quando precisar; ele só não quer que ela abra sozinha.
 *
 * Idempotente: clicar duas vezes não vira erro.
 *
 * @returns {Promise<{ok: boolean, tarefaRemovida: boolean, atalhosRemovidos: number, erro: string|null}>}
 */
export async function desativarAutoStart() {
  const tarefa = await removerTarefaAgendada();
  const atalhos = await removerAtalhos([caminhosAtalhos().startup]);
  const { log, ...resultado } = montarResultadoDesativacao({ tarefa, atalhos });
  await registrar(log);
  return resultado;
}

/**
 * Junta as duas remoções (tarefa e atalho) numa resposta só. Parte pura de
 * `desativarAutoStart`: o teste confere a decisão e a frase sem que ninguém
 * chame `schtasks` na máquina de verdade.
 *
 * @param {{tarefa: {ok: boolean, removida: boolean, erro: string|null}, atalhos: {ok: boolean, removidos: number, erro: string|null}}} r
 * @returns {{ok: boolean, tarefaRemovida: boolean, atalhosRemovidos: number, erro: string|null, log: string}}
 */
export function montarResultadoDesativacao({ tarefa, atalhos }) {
  const ok = !!tarefa.ok && !!atalhos.ok;
  const falha = tarefa.erro ?? atalhos.erro ?? "motivo desconhecido";
  return {
    ok,
    tarefaRemovida: !!tarefa.removida,
    atalhosRemovidos: atalhos.removidos,
    erro: ok ? null : `Não foi possível desligar a abertura automática (${falha}).`,
    log: ok
      ? `auto-start desligado (tarefa: ${tarefa.removida ? "removida" : "não havia"}, atalhos: ${atalhos.removidos})`
      : `auto-start não pôde ser desligado por completo: ${falha}`,
  };
}
