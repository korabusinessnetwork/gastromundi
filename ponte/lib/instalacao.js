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
//      copia para essa mesma pasta e cria dois atalhos: um na Inicialização
//      (sobe junto com o Windows) e um na Área de Trabalho.
// - Tudo por usuário, NADA em Program Files: instalar em Program Files pediria
//   UAC/administrador, e o caixa raramente é admin da máquina. Pasta do
//   usuário = zero pop-up de permissão, zero senha de TI. É de propósito.
// - Zero dependência npm: a cópia é `fs.copyFile` e o atalho (.lnk) sai do
//   WScript.Shell hospedado no PowerShell, que já vem no Windows.
// - Instalar sem saber desinstalar é armadilha: quem entra na pasta do
//   usuário tem que saber sair dela. `desinstalar()` desfaz exatamente o que
//   `instalar()` fez (atalhos + o .exe copiado) e, se o dono pedir, leva
//   junto a pasta de dados. Como o Windows não deixa apagar o .exe de um
//   programa em execução — e o programa em execução é justamente ele —, a
//   remoção do arquivo fica com um faxineiro: um PowerShell solto que espera
//   a ponte fechar e só então apaga.
// - Nada aqui lança para fora: toda função assíncrona resolve `{ok, ...}` /
//   `{ok:false, erro}`, no mesmo contrato do resto da ponte.

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

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
 * Argumento que só o atalho da INICIALIZAÇÃO do Windows carrega.
 *
 * A partir da Leva 15 a ponte roda sem janela, e o único sinal de que ela
 * subiu passou a ser o painel abrindo no navegador. Isso é ótimo no duplo
 * clique — e péssimo toda vez que o Windows liga: ninguém quer o navegador
 * pulando na cara ao ligar o PC do caixa. Com este argumento, a ponte sobe
 * calada; sem ele (Área de Trabalho, duplo clique), abre o painel.
 */
export const ARG_AUTOSTART = "--autostart";

export const TIMEOUT_ATALHOS_MS = 20000;

const POWERSHELL_BASE = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

// Nome da variável de ambiente que leva o caminho do JSON de configuração até
// o PowerShell. Ver o comentário de segurança em `SCRIPT_ATALHOS`.
const VAR_CONFIG = "KORA_PONTE_ATALHOS";

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

// ── Estado (o painel do caixa pergunta a cada 3s) ───────────────────────

/**
 * Monta o estado a partir dos caminhos já resolvidos. Versão pura de
 * `estadoInstalacao` — o teste injeta caminhos de `os.tmpdir()`.
 *
 * @returns {{empacotado: boolean, instalado: boolean, autoStart: boolean, caminhoAtual: string, caminhoInstalado: string}}
 */
export function montarEstado({ empacotado, execPath, caminhoInstalado, caminhoAutoStart, existe = existeCaminho }) {
  return {
    empacotado: !!empacotado,
    instalado: existe(caminhoInstalado),
    autoStart: existe(caminhoAutoStart),
    caminhoAtual: execPath ?? "",
    caminhoInstalado: caminhoInstalado ?? "",
  };
}

/**
 * Estado atual da instalação. Síncrona e barata de propósito: o painel do
 * caixa chama de poucos em poucos segundos, então aqui só entram dois
 * `existsSync` — nada de PowerShell, nada de rede.
 */
export function estadoInstalacao() {
  return montarEstado({
    empacotado: EMPACOTADO,
    execPath: process.execPath,
    caminhoInstalado: caminhoExeInstalado(),
    caminhoAutoStart: caminhosAtalhos().startup,
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
          return reject(new Error(causa));
        }
        resolve(String(stdout ?? ""));
      },
    );
  });
}

/**
 * Monta o que o PowerShell vai ler para criar os dois atalhos. Versão pura
 * (nada de disco, nada de ambiente) — é por aqui que o teste garante que o
 * `--autostart` fica SÓ na Inicialização.
 *
 * @param {{alvo: string, startup: string, areaTrabalho: string}} ctx
 * @returns {{atalhos: Array<{lnk: string, alvo: string, trabalho: string, argumentos: string, descricao: string}>}}
 */
export function montarConfigAtalhos({ alvo, startup, areaTrabalho }) {
  const trabalho = path.dirname(alvo);
  return {
    atalhos: [
      // Inicialização do Windows: sobe calada junto com o PC.
      { lnk: startup, alvo, trabalho, argumentos: ARG_AUTOSTART, descricao: DESCRICAO_ATALHO },
      // Área de Trabalho: é o dono clicando de propósito — abre o painel.
      { lnk: areaTrabalho, alvo, trabalho, argumentos: "", descricao: DESCRICAO_ATALHO },
    ],
  };
}

/**
 * Cria (ou refaz) os dois atalhos apontando para o exe instalado.
 * @returns {Promise<{ok: true} | {ok: false, erro: string}>}
 */
async function criarAtalhos(alvo) {
  const { startup, areaTrabalho } = caminhosAtalhos();
  const config = montarConfigAtalhos({ alvo, startup, areaTrabalho });

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

// ── Instalar / desinstalar ──────────────────────────────────────────────

function explicarCopia(e) {
  if (e?.code === "EBUSY" || e?.code === "EPERM" || e?.code === "ETXTBSY") {
    return "A ponte já instalada parece estar aberta. Feche a janela dela (ou o ícone perto do relógio) e tente de novo.";
  }
  if (e?.code === "ENOSPC") return "Não há espaço em disco para instalar a ponte.";
  return e?.message ?? "falha desconhecida";
}

/**
 * Instala a ponte no PC do caixa: copia o próprio executável para
 * %LOCALAPPDATA%\KORA\Ponte\KoraPonte.exe e cria os dois atalhos (Inicialização
 * do Windows + Área de Trabalho) apontando para a CÓPIA — nunca para o arquivo
 * de onde o usuário rodou, que pode estar no pen drive ou no Downloads.
 *
 * Nunca lança: erro vira `{ok:false, erro}` com texto que o caixa entende.
 *
 * @returns {Promise<{ok: boolean, jaEstava: boolean, reiniciar: boolean, caminho: string|null, erro: string|null}>}
 */
export async function instalar() {
  const recusa = (erro) => ({ ok: false, jaEstava: false, reiniciar: false, caminho: null, erro });

  if (!EMPACOTADO) {
    return recusa(
      "Instalar só faz sentido no programa pronto (KoraPonte.exe). Em modo de desenvolvimento a ponte roda pelo `node servidor.js`.",
    );
  }
  if (!EH_WINDOWS) {
    return recusa("A instalação automática só existe no Windows. Em outros sistemas, rode o executável direto.");
  }

  const destino = caminhoExeInstalado();
  const atual = process.execPath;
  // Rodando já a partir da cópia instalada (o caso normal do dia a dia, via
  // atalho): não faz sentido copiar em cima de si mesma — só garante que os
  // atalhos continuam lá (o usuário pode ter apagado um deles sem querer).
  const jaEstava = mesmoCaminho(atual, destino);

  try {
    if (!jaEstava) {
      await fsp.mkdir(path.dirname(destino), { recursive: true });
      await fsp.copyFile(atual, destino);
    }
  } catch (e) {
    return { ok: false, jaEstava, reiniciar: false, caminho: destino, erro: `Não foi possível copiar a ponte para a pasta do programa: ${explicarCopia(e)}` };
  }

  const atalhos = await criarAtalhos(destino);
  if (!atalhos.ok) {
    // O exe já está no lugar certo; só os atalhos falharam. Vale contar a
    // verdade: dá para abrir pela pasta enquanto isso.
    return { ok: false, jaEstava, reiniciar: false, caminho: destino, erro: atalhos.erro };
  }

  return {
    ok: true,
    jaEstava,
    // Quando o processo em execução NÃO é a cópia instalada, quem está no ar
    // ainda é o arquivo solto (pen drive/Downloads). O servidor usa este
    // sinal para avisar: pode fechar esta janela e abrir pelo atalho.
    reiniciar: !jaEstava,
    caminho: destino,
    erro: null,
  };
}

/**
 * Tira os dois atalhos (Inicialização + Área de Trabalho). É o "não suba mais
 * junto com o Windows" do painel.
 *
 * NUNCA mexe na pasta de dados: token do estabelecimento, pedidos e comandas
 * ainda na fila de impressão moram lá. Tirar o atalho é decisão de conforto;
 * apagar comanda que não saiu seria prejuízo.
 *
 * @param {string[]} [alvos] caminhos a remover — parâmetro só para teste; em
 *   produção o servidor chama sem argumento.
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

// ── Faxineiro: quem apaga o .exe depois que a ponte fecha ───────────────
//
// O Windows tranca o arquivo de um programa enquanto ele roda. Como quem
// pede a desinstalação É o programa instalado, ele não consegue apagar a si
// mesmo: nasce daqui um PowerShell SOLTO (detached), que sobrevive à morte da
// ponte, espera o processo dela sumir e só então apaga os alvos.
//
// MESMO CUIDADO DE SEGURANÇA DOS ATALHOS: nenhum caminho é interpolado no
// script. Ele é constante; os caminhos viajam como JSON numa variável de
// ambiente que o próprio script lê. Caminho hostil é sempre DADO, nunca
// comando. Aqui nem arquivo temporário existe — o script vai em
// `-EncodedCommand` (base64 de UTF-16LE), então não sobra lixo em %TEMP%
// num momento em que ninguém mais está de olho na máquina.
const VAR_FAXINA = "KORA_PONTE_FAXINA";

export const TIMEOUT_FAXINA_S = 60;
export const TENTATIVAS_FAXINA = 20;

const SCRIPT_FAXINA = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$bruto = $env:${VAR_FAXINA}
if ([string]::IsNullOrWhiteSpace($bruto)) { exit 1 }
try { $cfg = $bruto | ConvertFrom-Json } catch { exit 1 }

# Espera a ponte fechar. Se ela já fechou, Wait-Process reclama que não achou
# o processo — que é exatamente o que queremos, então o erro é ignorado.
try { Wait-Process -Id ([int]$cfg.processo) -Timeout ${TIMEOUT_FAXINA_S} } catch { }

# Cada alvo tenta várias vezes: entre o processo sair e o Windows soltar o
# arquivo passa um instante, e antivírus às vezes segura mais um pouco.
foreach ($alvo in @($cfg.alvos)) {
  for ($i = 0; $i -lt ${TENTATIVAS_FAXINA}; $i++) {
    try {
      if (-not (Test-Path -LiteralPath $alvo)) { break }
      Remove-Item -LiteralPath $alvo -Recurse -Force
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
}
`;

/**
 * O que o faxineiro vai apagar. Versão pura (nada de disco, nada de processo)
 * — é por aqui que o teste garante que a pasta de dados só some quando o dono
 * pediu, e que apagar tudo não deixa o .exe para trás.
 *
 * @param {{processo: number, dirInstalacao: string, caminhoExe: string, apagarDados?: boolean}} ctx
 * @returns {{processo: number, alvos: string[]}}
 */
export function montarConfigFaxina({ processo, dirInstalacao: dir, caminhoExe, apagarDados = false }) {
  return {
    processo,
    // Apagando os dados, a pasta inteira sai de uma vez — o .exe mora dentro
    // dela, então listar os dois seria apagar duas vezes o mesmo arquivo.
    alvos: apagarDados ? [dir] : [caminhoExe],
  };
}

/**
 * Solta o faxineiro. Não espera por ele de propósito: ele só começa a
 * trabalhar depois que esta ponte morrer.
 *
 * @returns {{ok: true} | {ok: false, erro: string}}
 */
function agendarFaxina(config) {
  try {
    const filho = spawn(
      "powershell.exe",
      [...POWERSHELL_BASE, "-EncodedCommand", Buffer.from(SCRIPT_FAXINA, "utf16le").toString("base64")],
      {
        detached: true, // sai do grupo de processos da ponte — sobrevive a ela
        stdio: "ignore", // sem canal aberto para um pai que vai fechar
        windowsHide: true,
        env: { ...process.env, [VAR_FAXINA]: JSON.stringify(config) },
      },
    );
    filho.unref(); // libera o Node para encerrar sem esperar o filho
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e?.message ?? "falha desconhecida" };
  }
}

/**
 * Desinstala a ponte deste computador: tira os dois atalhos (Inicialização e
 * Área de Trabalho) e agenda a remoção do programa copiado para a pasta do
 * usuário. Com `apagarDados`, a pasta inteira vai junto — token do
 * estabelecimento, pedidos, fila de impressão e log.
 *
 * Os dados NÃO somem por padrão: pode haver comanda na fila esperando a
 * impressora voltar, e desinstalar é decisão de conforto — perder comanda não
 * impressa seria prejuízo. Quem quer a máquina limpa (PC trocando de dono)
 * pede explicitamente.
 *
 * Depois desta chamada quem manda tem que ENCERRAR a ponte: enquanto ela
 * roda, o Windows não libera o .exe e o faxineiro fica esperando.
 *
 * Nunca lança: erro vira `{ok:false, erro}` com texto que o caixa entende.
 *
 * @param {{apagarDados?: boolean}} [opcoes]
 * @returns {Promise<{ok: boolean, atalhosRemovidos: number, apagouDados: boolean, erro: string|null}>}
 */
export async function desinstalar({ apagarDados = false } = {}) {
  const recusa = (erro) => ({ ok: false, atalhosRemovidos: 0, apagouDados: false, erro });

  if (!EMPACOTADO) {
    return recusa(
      "Desinstalar só faz sentido no programa pronto (KoraPonte.exe). Em modo de desenvolvimento, basta parar o `node servidor.js`.",
    );
  }
  if (!EH_WINDOWS) {
    return recusa("A desinstalação automática só existe no Windows. Em outros sistemas, apague a pasta do programa na mão.");
  }

  // Atalhos primeiro: é o que faz a ponte voltar sozinha no próximo boot. Se
  // o faxineiro falhar depois, pelo menos ela não ressuscita.
  const atalhos = await removerAtalhos();
  if (!atalhos.ok) {
    return { ok: false, atalhosRemovidos: atalhos.removidos, apagouDados: false, erro: atalhos.erro };
  }

  const config = montarConfigFaxina({
    processo: process.pid,
    dirInstalacao: dirInstalacao(),
    caminhoExe: caminhoExeInstalado(),
    apagarDados,
  });
  const faxina = agendarFaxina(config);
  if (!faxina.ok) {
    // Os atalhos já saíram: a ponte não abre mais sozinha, e é isso que o
    // dono sente. Só o arquivo ficou — e ele sabe onde, pela mensagem.
    return {
      ok: false,
      atalhosRemovidos: atalhos.removidos,
      apagouDados: false,
      erro: `Os atalhos foram removidos, mas o programa não pôde ser apagado automaticamente (${faxina.erro}). Apague a pasta ${dirInstalacao()} na mão.`,
    };
  }

  return { ok: true, atalhosRemovidos: atalhos.removidos, apagouDados: apagarDados, erro: null };
}
