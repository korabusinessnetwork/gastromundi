// Ponte KORA — servidor local (Leva 13).
//
// Programa gratuito que roda no PC do caixa e faz a ponte entre o
// celular (Palm) e o caixa/impressora QUANDO A INTERNET CAI:
//
//   Palm (Wi-Fi) ──► ponte (este servidor) ◄── app do caixa (localhost)
//
// - Online, o app do caixa alimenta a ponte com o catálogo (POST /snapshot).
// - Sem internet, o Palm abre a página local (GET /palm, via QR/atalho),
//   monta o pedido e envia (POST /pedido) pela rede do estabelecimento.
// - O app do caixa, que enxerga http://localhost mesmo sendo HTTPS
//   (exceção de conteúdo misto), busca os pedidos (GET /pedidos),
//   grava/imprime e confirma (POST /pedidos/confirmar).
//
// Só Node puro — zero dependências, zero custo, sem certificado pago.
// Rodar: `node servidor.js` (ou `npm start`) na pasta ponte/.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  validarPedido, adicionarPedido, pedidosPendentes, confirmarPedidos, podarConfirmados,
} from "./lib/pedidos.js";
import {
  ehEnderecoLocal, hostEhLocal, normalizarOrigem, origemAceita, cabecalhosCors,
  tokenDaRequisicao, tokenValido, enderecosLan,
} from "./lib/http.js";
import {
  criarTrabalho, proximoTrabalho, marcarImprimindo, marcarConcluido, marcarFalha,
  destravarImprimindo, contarPendentes, podarFila, limparFinalizados,
} from "./lib/filaImpressao.js";
import { montarBytes } from "./lib/escpos.js";
import { listarImpressoras, enviarBytes } from "./lib/impressoras.js";
import {
  EMPACOTADO, ARG_AUTOSTART, VERSAO, dirDados, estadoInstalacao, instalar,
  atualizarInstalado, liberarNoFirewall, desativarAutoStart,
} from "./lib/instalacao.js";
import { validarVinculo, aplicarVinculo, resumoVinculo } from "./lib/vinculo.js";
import { configurarLog, caminhoLog, logar, logarErro } from "./lib/log.js";
import { lerJson, gravarJson } from "./lib/persistencia.js";
import { lerCorpoJson, MAX_CORPO } from "./lib/corpo.js";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
// Como .exe, a pasta ao lado do programa é somente leitura (e ele pode estar
// rodando de um pen drive) — os dados vão para a pasta do usuário. Rodando
// pelo código (node servidor.js), continua sendo ponte/dados, como sempre foi.
const DIR_DADOS = dirDados(RAIZ);
const ARQ_CONFIG = path.join(DIR_DADOS, "config.json");
const ARQ_SNAPSHOT = path.join(DIR_DADOS, "snapshot.json");
const ARQ_PEDIDOS = path.join(DIR_DADOS, "pedidos.json");
const ARQ_IMPRESSAO = path.join(DIR_DADOS, "impressao.json");
const ARQ_PALM = path.join(RAIZ, "palm.html");
const ARQ_PAINEL = path.join(RAIZ, "painel.html");
const ARQ_AVISO = path.join(DIR_DADOS, "ponte-nao-abriu.html");

// A ponte subiu junto com o Windows (atalho da Inicialização) ou alguém
// clicou nela agora? Só o clique merece abrir o navegador — ver ARG_AUTOSTART.
const AUTOSTART = process.argv.includes(ARG_AUTOSTART);

const PORTA = Number(process.env.KORA_PONTE_PORTA) || 8123;
const INTERVALO_IMPRESSAO_MS = 3000; // de quanto em quanto a fila é olhada
// Tamanho mínimo do `id` que o caixa manda em POST /imprimir — é contrato com
// o app (ID_MINIMO_CARACTERES, em src/lib/ponte.js). Id menor do que isso não
// é aceito calado: engolir o id e sortear outro desliga em silêncio a
// proteção que impede a mesma comanda de sair duas vezes.
const ID_IMPRESSAO_MINIMO = 8;
// Estado em que a fila DESISTIU do trabalho (ver lib/filaImpressao.js): tentou
// MAX_TENTATIVAS vezes e parou. O papel não saiu — mandar o mesmo id de novo é
// pedir reimpressão, não repetir o que já está saindo.
const IMPRESSAO_DESISTIU = "falhou";
// Os estados da fila em português de balcão. Quem lê o ponte.log é o dono ou o
// suporte tentando entender por que a comanda não saiu — "na_fila" não diz nada
// a eles.
const COMO_ESTA_A_COMANDA = {
  na_fila: "está na fila esperando a impressora",
  imprimindo: "está saindo na impressora agora",
  concluido: "já saiu na impressora",
};
// Quanto esperamos a resposta de quem está ocupando a porta. É uma pergunta
// para o próprio computador: ou volta na hora, ou não é a ponte que está lá.
const TIMEOUT_SONDA_MS = 1500;

// ── Persistência simples em disco (sobrevive a reiniciar o PC) ─────────
//
// A pasta de dados precisa existir ANTES do log, e é o único passo do arranque
// que roda sem rede de proteção. Se ela falhar (rodando de um pen drive sem
// permissão, disco cheio), morrer aqui seria morrer calado: não há janela e
// ainda não há arquivo de log. Então guardamos o motivo e contamos assim que o
// log estiver de pé.
let falhaNoArranque = null;
try {
  fs.mkdirSync(DIR_DADOS, { recursive: true });
} catch (e) {
  falhaNoArranque = e;
}

// Empacotada, a ponte roda SEM janela de console (ver lib/pe.js): não existe
// mais tela para onde mandar mensagem. Tudo que antes ia para o console passa
// a ir para <dados>/ponte.log, que é onde se descobre o que aconteceu.
configurarLog({ dir: DIR_DADOS });

// ── A ponte não morre calada ───────────────────────────────────────────
//
// Antes disto, UMA requisição estranha vinda do Wi-Fi (um scanner de rede, um
// celular com o link velho) bastava para o Node encerrar o programa inteiro:
// o erro ia para uma tela que não existe e o restaurante só descobria quando o
// garçom reclamava que o pedido não chegava. Daqui em diante toda falha solta
// vira uma linha no ponte.log e A PONTE CONTINUA DE PÉ — perder uma requisição
// é muito melhor do que ficar sem sistema no meio do serviço.
//
// Estes dois handlers precisam vir DEPOIS de configurarLog: registrados antes,
// o aviso não teria para onde ir. E eles nunca podem lançar por conta própria,
// senão o remédio vira a doença.
function registrarTropeco(mensagem, erro) {
  try {
    logarErro(mensagem, erro);
  } catch {
    // Nem o log respondeu. Não há mais canal nenhum, e insistir aqui só
    // derrubaria a ponte — que é justamente o que este trecho evita.
  }
}

process.on("uncaughtException", (e) => {
  registrarTropeco("erro inesperado na ponte — ela continua no ar", e);
});
process.on("unhandledRejection", (e) => {
  registrarTropeco("erro inesperado ao atender um pedido — a ponte continua no ar", e);
});

if (falhaNoArranque) {
  logarErro(`não consegui criar/usar a pasta de dados ${DIR_DADOS} — nada será guardado em disco`, falhaNoArranque);
}

// Token nasce no primeiro uso e fica no PC do caixa. É ele que separa
// "equipe do estabelecimento" de "qualquer aparelho no mesmo Wi-Fi".
let config = lerJson(ARQ_CONFIG, null, {
  oQuePerde: "Com ele, some o token do estabelecimento: a ponte cria um novo e o LINK/QR do Palm de TODOS os garçons para de funcionar — é preciso abrir o painel e passar o endereço novo para a equipe. O vínculo com o estabelecimento também precisa ser refeito abrindo o sistema KORA neste computador.",
});
if (!config?.token) {
  config = { token: crypto.randomBytes(16).toString("hex"), criadoEm: new Date().toISOString() };
  try {
    gravarJson(ARQ_CONFIG, config);
  } catch {
    // O motivo técnico já foi para o ponte.log. A ponte segue funcionando com
    // este token na memória, mas ele muda toda vez que ela for reaberta — o
    // que quebra o link do Palm da equipe. Por isso o aviso é em ATENÇÃO.
    logar("ATENÇÃO: não consegui guardar o token do estabelecimento no disco. A ponte funciona agora, mas ao ser reaberta o link/QR do Palm vai mudar e a equipe precisará pegar o novo no painel.");
  }
}

let filaPedidos = podarConfirmados(lerJson(ARQ_PEDIDOS, [], {
  oQuePerde: "Os pedidos que o caixa ainda não tinha puxado se perderam — confira com os garçons o que estava em aberto.",
}));
let snapshot = lerJson(ARQ_SNAPSHOT, null, {
  oQuePerde: "O Palm fica sem catálogo — abra o sistema KORA neste computador com internet uma vez para mandá-lo de novo.",
});

function salvarFila() {
  filaPedidos = podarConfirmados(filaPedidos);
  gravarJson(ARQ_PEDIDOS, filaPedidos);
}

// Fila de impressão: trabalho que estava "imprimindo" quando a ponte foi
// fechada (ou faltou luz) volta para a fila — aquela comanda não saiu.
let filaImpressao = podarFila(destravarImprimindo(lerJson(ARQ_IMPRESSAO, [], {
  oQuePerde: "As comandas que ainda não tinham saído se perderam — reimprima pelo caixa o que estiver faltando.",
})));

function salvarImpressao() {
  gravarJson(ARQ_IMPRESSAO, filaImpressao);
}

// Dentro do worker, gravar em disco é só a memória de longo prazo da fila: se
// o disco recusar, a comanda ainda assim sai na impressora. Então aqui a falha
// não pode parar nada — o motivo já ficou registrado no ponte.log.
function salvarImpressaoSemParar() {
  try {
    salvarImpressao();
  } catch {
    // Registrado em lib/persistencia.js. Seguir imprimindo é o certo.
  }
}

// ── Helpers de resposta ────────────────────────────────────────────────
//
// Os cabeçalhos CORS dependem da origem do pedido, então são calculados uma
// vez por requisição e pendurados no `res` (`res.corsKora`). Guardar isso em
// variável de módulo criaria corrida: há `await` no meio do tratamento e dois
// pedidos simultâneos trocariam de cabeçalho no meio do caminho.
function responderJson(res, status, corpo) {
  const dados = JSON.stringify(corpo);
  res.writeHead(status, {
    ...(res.corsKora ?? cabecalhosCors()),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(dados);
}

/**
 * Lê o corpo da requisição e já deixa combinado o desligamento da conexão.
 *
 * Quando o envio passa do teto, `lib/corpo.js` responde na hora mas não corta
 * a conexão: se cortasse, a rota logo abaixo escreveria o recado ("envio
 * grande demais") num socket já morto e quem mandou veria só "erro de rede".
 * Aqui a conexão é desligada quando a resposta TERMINOU de sair (`finish`), e
 * uma vez só — `close` cobre o caso de ela cair antes disso.
 *
 * Toda rota que lê corpo passa por aqui de propósito: assim não existe rota
 * que esquece de desligar e deixa a ponte lendo um envio gigante à toa.
 */
function lerCorpo(req, res) {
  return lerCorpoJson(req).then(({ dados, erro, encerrar }) => {
    if (typeof encerrar === "function") {
      let desligado = false;
      const desligar = () => {
        if (desligado) return;
        desligado = true;
        encerrar();
      };
      res.once("finish", desligar);
      res.once("close", desligar);
    }
    return { dados, erro };
  });
}

/**
 * Vira em frase o motivo que `lerCorpoJson` devolveu.
 *
 * As cinco rotas que leem corpo diziam todas a mesma coisa ("não deu para ler,
 * tente de novo") para três problemas diferentes. Para o envio que passou do
 * teto isso era conselho errado: mandar o MESMO arquivo de novo dá exatamente
 * o mesmo erro, e o caixa ficava tentando sem entender. Cada motivo tem agora
 * a sua saída, e a do teto diz qual é o limite.
 *
 * @param {string} motivo - o que `lib/corpo.js` devolveu: "muito grande",
 *   "json inválido" ou "conexão interrompida"
 * @param {string} oQue - o que estava sendo enviado, com artigo ("o pedido")
 */
function recadoDeCorpo(motivo, oQue) {
  if (motivo === "muito grande") {
    const teto = MAX_CORPO >= 1024 * 1024
      ? `${Math.round(MAX_CORPO / (1024 * 1024))} MB`
      : `${Math.round(MAX_CORPO / 1024)} KB`;
    return `Envio grande demais: ${oQue} passou do limite de ${teto}. Mande em partes menores.`;
  }
  if (motivo === "json inválido") {
    return `Não consegui entender ${oQue} — o formato chegou errado.`;
  }
  return `A conexão caiu no meio do envio — mande ${oQue} de novo.`;
}

/** Endereço que o garçom abre no celular (primeiro IP da rede local). */
function enderecoPalm() {
  const ip = enderecosLan(os.networkInterfaces())[0];
  return ip ? `http://${ip}:${PORTA}/palm?t=${config.token}` : null;
}

/**
 * Abre alguma coisa (URL ou arquivo) no programa padrão do Windows.
 * Argumentos vão como lista (nunca concatenados), e o "" é o título da
 * janela que o `start` exige antes do endereço.
 */
// `rundll32 url.dll,FileProtocolHandler` em vez de `cmd /c start`: abre URL
// e arquivo do mesmo jeito, mas sem passar por cmd.exe. O alvo do aviso de
// erro fatal é um caminho dentro da pasta do usuário do Windows — um nome de
// usuário com `&` ou `^` seria interpretado como comando pelo cmd. Aqui não
// há shell nenhum no meio: o argumento vai direto para o processo.
function abrirNoWindows(alvo) {
  if (process.platform !== "win32") return;
  execFile("rundll32", ["url.dll,FileProtocolHandler", alvo], { timeout: 5000, windowsHide: true }, () => {});
}

/**
 * Abre o painel no navegador do PC do caixa.
 *
 * Desde a Leva 15 a ponte roda SEM janela nenhuma. O painel abrindo virou o
 * ÚNICO sinal visível de que o programa subiu — por isso ele abre em todo
 * duplo clique (ou atalho da Área de Trabalho).
 *
 * Duas exceções, de propósito:
 * - `--autostart` (atalho da Inicialização): ninguém quer o navegador pulando
 *   na tela toda vez que liga o PC do caixa. Sobe calada.
 * - Fora do empacotado (`node servidor.js`): abrir o navegador a cada reinício
 *   durante o desenvolvimento só atrapalha.
 */
function abrirPainelNoNavegador() {
  if (!EMPACOTADO || AUTOSTART) return;
  abrirNoWindows(`http://localhost:${PORTA}/`);
}

/**
 * Último recurso quando a ponte NÃO conseguiu subir.
 *
 * Sem console e sem servidor no ar, não sobrou nenhum canal para falar com o
 * dono — ele daria dois cliques e não aconteceria absolutamente nada. Então
 * escrevemos um aviso em HTML na pasta de dados e mandamos o Windows abrir no
 * navegador padrão. Escolhemos essa via (em vez de `msg.exe`, que não existe
 * nas edições Home do Windows, ou de uma caixa de diálogo, que exigiria
 * dependência gráfica) porque usa exatamente o mesmo mecanismo do painel:
 * zero dependência nova e funciona em qualquer Windows.
 *
 * Nunca lança: se nem isso der, ainda fica o registro no ponte.log.
 */
function avisarErroFatal(titulo, detalhe) {
  const escapar = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>KORA Ponte não abriu</title>
<style>body{background:#0f0f10;color:#f2f2f2;font-family:system-ui,"Segoe UI",sans-serif;max-width:640px;margin:0 auto;padding:40px 20px;line-height:1.5}
h1{font-size:24px;margin:0 0 16px}p{font-size:17px;margin:0 0 14px}code{background:#1a1a1c;border:1px solid #2a2a2e;border-radius:8px;padding:10px 12px;display:block;word-break:break-all;font-size:14px}</style>
</head><body>
<h1>A KORA Ponte não conseguiu abrir</h1>
<p>${escapar(titulo)}</p>
<p><strong>O que aconteceu:</strong></p>
<code>${escapar(detalhe)}</code>
<p>Tente abrir de novo pelo atalho <strong>KORA Ponte</strong> da Área de Trabalho. Se continuar assim, mande esta tela e o arquivo abaixo para o suporte:</p>
<code>${escapar(caminhoLog() ?? "")}</code>
</body></html>`;

  try {
    fs.writeFileSync(ARQ_AVISO, html, "utf8");
    // O arquivo é sempre gravado (serve de prova para o suporte), mas só o
    // .exe abre a página: no desenvolvimento existe terminal, e o erro já
    // apareceu lá — abrir navegador a cada tentativa só atrapalharia.
    if (EMPACOTADO) abrirNoWindows(ARQ_AVISO);
  } catch (e) {
    logarErro("não deu nem para mostrar o aviso de erro na tela", e);
  }
}

// ── Worker da impressão ────────────────────────────────────────────────
//
// Um trabalho por vez, sempre: duas comandas saindo ao mesmo tempo na
// mesma bobina viram uma salada de texto. Se a impressora estiver ocupada
// ou desligada, a falha só agenda a próxima tentativa — o pedido fica
// guardado em disco e sai sozinho quando ela voltar.
let imprimindo = false;

async function ciclarImpressao() {
  if (imprimindo) return;

  const trabalho = proximoTrabalho(filaImpressao);
  if (!trabalho) return;

  imprimindo = true;
  filaImpressao = marcarImprimindo(filaImpressao, trabalho.id);
  salvarImpressaoSemParar();

  try {
    // Cópias viram um único envio: o spooler trata como um trabalho só e
    // não corre o risco de outra comanda entrar no meio das vias.
    const umaVia = montarBytes(trabalho.linhas, { cortaPapel: trabalho.cortaPapel, tamanhoFonte: trabalho.tamanhoFonte });
    const bytes = trabalho.copias > 1
      ? Buffer.concat(Array.from({ length: trabalho.copias }, () => umaVia))
      : umaVia;

    await enviarBytes(trabalho.destino, bytes);
    filaImpressao = marcarConcluido(filaImpressao, trabalho.id);
    logar(`impressão ${trabalho.id} concluída (${trabalho.linhas.length} linha(s))`);
  } catch (e) {
    filaImpressao = marcarFalha(filaImpressao, trabalho.id, e);
    const atual = filaImpressao.find((t) => t.id === trabalho.id);
    logarErro(`impressão ${trabalho.id} ${atual?.estado === "falhou" ? "DESISTIU" : "vai tentar de novo"}`, e);
  } finally {
    filaImpressao = podarFila(filaImpressao);
    salvarImpressaoSemParar();
    imprimindo = false;
  }
}

function agendarImpressao() {
  // Sem await de propósito: quem pediu a impressão recebe o 202 na hora,
  // a impressora leva o tempo que levar.
  ciclarImpressao().catch((e) => logarErro("erro inesperado na fila de impressão", e));
}

setInterval(agendarImpressao, INTERVALO_IMPRESSAO_MS);

// ── Servidor ───────────────────────────────────────────────────────────

/**
 * Lê o endereço pedido sem NUNCA lançar.
 *
 * A base é fixa de propósito. O `Host` chega pela rede, escrito por quem quer
 * que seja: um aparelho qualquer do Wi-Fi mandando `Host: :::` fazia a montagem
 * da URL estourar — e, como o tratamento é assíncrono, aquilo derrubava a ponte
 * inteira. A ponte só precisa do caminho e da query daqui; quem realmente
 * precisa do `Host` (o filtro que protege as rotas do caixa) continua lendo
 * `req.headers.host` direto, sem passar por esta função.
 *
 * @returns {URL|null} null quando o endereço veio impossível de entender
 */
function analisarUrl(bruto) {
  try {
    return new URL(bruto ?? "/", "http://localhost");
  } catch {
    return null;
  }
}

/**
 * Última resposta possível quando algo deu errado no meio do caminho.
 * Se a resposta já tinha começado a ser escrita, só fecha: escrever cabeçalho
 * duas vezes lançaria de novo, dentro do próprio tratamento do erro.
 */
function responderFalha(res, status, mensagem) {
  try {
    if (res.writableEnded) return;
    if (res.headersSent) return res.end();
    return responderJson(res, status, { erro: mensagem });
  } catch {
    try {
      res.destroy();
    } catch {
      // A conexão já tinha morrido — não há mais nada a fazer por ela.
    }
  }
}

const servidor = http.createServer((req, res) => {
  // Nenhuma exceção pode subir daqui. Sem este `catch`, uma promessa rejeitada
  // no tratamento encerra o processo do Node e o restaurante fica sem ponte.
  tratarRequisicao(req, res).catch((e) => {
    logarErro(`erro inesperado ao atender ${req.method ?? "?"} ${String(req.url ?? "").slice(0, 120)}`, e);
    responderFalha(res, 500, "Deu um problema aqui na ponte. Tente de novo.");
  });
});

async function tratarRequisicao(req, res) {
  const url = analisarUrl(req.url);
  if (!url) {
    logar(`pedido com endereço inválido recusado: ${String(req.url ?? "").slice(0, 120)}`);
    return responderFalha(res, 400, "Endereço inválido.");
  }
  const rota = `${req.method} ${url.pathname}`;
  const local = ehEnderecoLocal(req.socket.remoteAddress);
  const comToken = tokenValido(tokenDaRequisicao({ headers: req.headers, url }), config.token);

  // Origem do pedido, decidida uma vez e carregada no `res` para todas as
  // respostas desta requisição. `config.origemPermitida` é o endereço do app
  // do caixa, aprendido no primeiro vínculo — ver `origemAceita` em lib/http.
  const origem = normalizarOrigem(req.headers.origin);
  // Enquanto NENHUM endereço está fixado, só estas duas rotas atendem um
  // endereço desconhecido — são as que o primeiro vínculo precisa: /saude é
  // como o app do caixa descobre que a ponte existe neste PC, e /vincular é
  // onde ele diz de quem ela é (e o endereço fica fixado). Todo o resto
  // espera o vínculo: numa instalação nova, um site qualquer aberto no
  // navegador do caixa lia /info — que entrega o token — e podia parar ou
  // instalar a ponte sem ninguém ver.
  //
  // Atenção ao que esta passagem faz e ao que ela NÃO faz. Ela libera o
  // cabeçalho de CORS (sem ele o navegador nem deixa o app do caixa LER a
  // resposta de /saude, e a ponte ficaria invisível numa instalação nova) e
  // libera o POST /vincular. Ela não decide o CONTEÚDO de resposta nenhuma:
  // quem diz se o endereço de quem pediu já é conhecido é `origemConhecida`,
  // logo abaixo — e é ele que /saude consulta antes de contar algo da casa.
  const ehRotaDoPrimeiroVinculo = (url.pathname === "/vincular" && (req.method === "POST" || req.method === "OPTIONS"))
    || (url.pathname === "/saude" && (req.method === "GET" || req.method === "OPTIONS"));
  const daCasa = origemAceita({
    origem, host: req.headers.host, fixada: config.origemPermitida, primeiroVinculo: ehRotaDoPrimeiroVinculo,
  });
  // O mesmo julgamento SEM a passagem do primeiro vínculo: "este endereço já é
  // conhecido?" — sem `Origin` (não é um site do navegador falando), a própria
  // ponte, ou o endereço fixado no vínculo. Site desconhecido responde false,
  // tenha a ponte dono ou não.
  const origemConhecida = origemAceita({
    origem, host: req.headers.host, fixada: config.origemPermitida,
  });
  res.corsKora = cabecalhosCors({
    origem, host: req.headers.host, fixada: config.origemPermitida, primeiroVinculo: ehRotaDoPrimeiroVinculo,
  });

  // Preflight CORS (o app HTTPS do caixa chega aqui via localhost).
  if (req.method === "OPTIONS") {
    res.writeHead(204, res.corsKora);
    return res.end();
  }

  // ── Público na rede local ────────────────────────────────────────────
  //
  // Esta rota não pede token de propósito: é por ela que o app do caixa e o
  // Palm descobrem que a ponte existe neste computador. Mas quem está no Wi-Fi
  // do salão — inclusive o celular do cliente na mesa — também alcança este
  // endereço, então aqui só sai o mínimo para dizer "sou eu, estou no ar".
  //
  // O NOME e o código do estabelecimento, quantos pedidos estão esperando e
  // quantas comandas faltam sair são assunto da casa. Estar "no PC do caixa"
  // não basta para ouvir isso: um site qualquer aberto no navegador DAQUELE PC
  // também chega como local, e era assim que ele lia o nome do restaurante e o
  // código do estabelecimento sem ter vínculo nenhum — bastava a ponte ainda
  // não ter dono. Agora o extra pede as duas coisas: estar na máquina (ou
  // trazer o token) E vir de um endereço conhecido.
  if (rota === "GET /saude") {
    const saude = { ok: true, nome: "KORA Ponte", versao: VERSAO };
    if (origemConhecida && (local || comToken)) {
      saude.pendentes = pedidosPendentes(filaPedidos).length;
      saude.impressoesPendentes = contarPendentes(filaImpressao);
      saude.estabelecimento = resumoVinculo(config);
    }
    return responderJson(res, 200, saude);
  }

  if (rota === "GET /" || rota === "GET /painel") {
    // Painel do caixa — só no próprio PC. É a tela que o dono vê quando
    // dá duplo clique no programa: estado, estabelecimento e instalação.
    if (!local) return responderJson(res, 403, { erro: "Painel disponível apenas no PC do caixa." });
    try {
      const html = fs.readFileSync(ARQ_PAINEL);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    } catch {
      return responderJson(res, 500, { erro: "painel.html não encontrado ao lado do servidor." });
    }
  }

  if (rota === "GET /palm") {
    // Página do pedido no Palm — mesma origem dos endpoints /catalogo e
    // /pedido, então funciona sem HTTPS e sem CORS no celular.
    try {
      const html = fs.readFileSync(ARQ_PALM);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    } catch {
      return responderJson(res, 500, { erro: "palm.html não encontrado ao lado do servidor." });
    }
  }

  // ── Protegido por token (Palm na rede local) ─────────────────────────
  if (rota === "GET /catalogo") {
    if (!comToken) return responderJson(res, 401, { erro: "Acesso negado — abra pelo QR/atalho do estabelecimento." });
    if (!snapshot) return responderJson(res, 404, { erro: "Catálogo ainda não recebido do caixa. Abra o app do caixa com internet uma vez." });
    return responderJson(res, 200, snapshot);
  }

  if (rota === "POST /pedido") {
    if (!comToken) return responderJson(res, 401, { erro: "Acesso negado — abra pelo QR/atalho do estabelecimento." });
    const { dados, erro } = await lerCorpo(req, res);
    if (erro) return responderJson(res, 400, { erro: recadoDeCorpo(erro, "o pedido") });
    const validacao = validarPedido(dados);
    if (!validacao.ok) return responderJson(res, 422, { erro: validacao.erro });
    const resultado = adicionarPedido(filaPedidos, validacao.pedido, { gerarId: () => crypto.randomUUID() });
    const filaAntes = filaPedidos;
    filaPedidos = resultado.fila;
    if (!resultado.duplicado) {
      try {
        salvarFila();
      } catch {
        // Pedido que não chegou ao disco não sobrevive a uma queda de luz, e
        // aceitar pela metade é pior do que recusar: a fila volta como estava
        // e o garçom recebe um recado que ele entende, para reenviar. O motivo
        // técnico já foi para o ponte.log (ver lib/persistencia.js).
        filaPedidos = filaAntes;
        return responderJson(res, 503, { erro: "Não consegui salvar o pedido, tente de novo." });
      }
    }
    logar(`pedido ${resultado.duplicado ? "repetido (ignorado)" : "recebido"} — comanda ${validacao.pedido.comanda}, ${validacao.pedido.items.length} item(ns)`);
    return responderJson(res, resultado.duplicado ? 200 : 201, { ok: true, id: resultado.registro.id, duplicado: resultado.duplicado });
  }

  // ── Só o PC do caixa (localhost) ─────────────────────────────────────
  //
  // Dois filtros, não um: o IP de origem diz de qual MÁQUINA veio, o `Host`
  // diz por qual NOME a ponte foi chamada. Sem o segundo, um domínio de fora
  // apontado para 127.0.0.1 (DNS rebinding) entra por aqui como se fosse o
  // app do caixa.
  if (!local) return responderJson(res, 403, { erro: "Rota disponível apenas no PC do caixa." });
  if (!hostEhLocal(req.headers.host, PORTA)) {
    return responderJson(res, 403, { erro: "Rota disponível apenas no PC do caixa." });
  }
  // Terceiro filtro, e é o que fecha o ataque de verdade: o `Origin` diz de
  // qual SITE aberto no navegador partiu o pedido. Um site qualquer aberto no
  // navegador do caixa passa nos dois filtros acima (a conexão sai mesmo da
  // máquina, com Host localhost) — só a origem o denuncia. Não basta negar o
  // cabeçalho de CORS: sem esta linha o pedido ainda EXECUTA (a resposta é
  // que seria escondida), e /instalar ou /parar não precisam de resposta.
  if (!daCasa) {
    return responderJson(res, 403, {
      erro: config.origemPermitida
        ? "Este endereço não é o do estabelecimento vinculado a esta ponte."
        : "Esta ponte ainda não foi vinculada a um estabelecimento — abra o sistema KORA do estabelecimento neste computador.",
    });
  }

  if (rota === "GET /info") {
    return responderJson(res, 200, {
      nome: "KORA Ponte",
      versao: VERSAO,
      porta: PORTA,
      token: config.token,
      enderecos: enderecosLan(os.networkInterfaces()),
      snapshotEm: snapshot?.atualizadoEm ?? null,
      pendentes: pedidosPendentes(filaPedidos).length,
      estabelecimento: resumoVinculo(config),
      instalacao: estadoInstalacao(),
    });
  }

  // ── Vínculo com o estabelecimento ────────────────────────────────────
  //
  // O mesmo .exe serve qualquer cliente: ele nasce sem dono. Quem diz de
  // quem ele é é o app do caixa, que já procura a ponte no localhost — por
  // isso ninguém digita código, token nem IP. Só chega aqui o UUID e o nome
  // do estabelecimento; credencial de banco NUNCA passa por aqui.
  if (rota === "POST /vincular") {
    const { dados, erro } = await lerCorpo(req, res);
    if (erro) return responderJson(res, 400, { erro: recadoDeCorpo(erro, "o vínculo") });

    const validacao = validarVinculo(dados);
    if (!validacao.ok) return responderJson(res, 400, { erro: validacao.erro });

    const jaEra = config.estabelecimento?.tenantId;
    // Trocou de dono de verdade? Vincular pela primeira vez (nunca teve dono)
    // ou repetir o MESMO estabelecimento não é troca — e não pode apagar nada,
    // senão um clique repetido joga fora o serviço do dia.
    const trocouDeEstabelecimento = Boolean(jaEra) && jaEra !== validacao.vinculo.tenantId;
    const configAntes = config;
    config = aplicarVinculo(config, validacao.vinculo);
    // Aprende o endereço do app do caixa junto com o vínculo — daqui em
    // diante é o único site do navegador que esta ponte atende. Só grava
    // origem de fora: a própria ponte (painel/Palm) não é o app do caixa e
    // não pode virar dona do vínculo.
    const daPropriaPonte = origem === `http://${req.headers.host}` || origem === `https://${req.headers.host}`;
    const fixouOrigem = Boolean(origem) && !daPropriaPonte && normalizarOrigem(config.origemPermitida) !== origem;
    if (fixouOrigem) config.origemPermitida = origem;

    // O mesmo programa serve qualquer estabelecimento. Se ele passa a ser de
    // outro restaurante, tudo que ficou do anterior tem que sair: pedido que o
    // caixa não puxou, comanda que não saiu e o cardápio guardado. Sem isso, o
    // pedido do restaurante velho sai na impressora do novo, com os preços do
    // velho — e ninguém entende de onde veio aquele papel.
    //
    // A limpeza vai ANTES de gravar o vínculo de propósito: se o disco falhar
    // no meio, o pior caso é uma fila vazia com o estabelecimento antigo —
    // chato, mas o contrário (estabelecimento novo com os pedidos do anterior)
    // é justamente o que não pode acontecer.
    if (trocouDeEstabelecimento) {
      const pedidosAntes = filaPedidos;
      const impressaoAntes = filaImpressao;
      const snapshotAntes = snapshot;
      const descartados = {
        pedidos: pedidosPendentes(filaPedidos).length,
        impressoes: contarPendentes(filaImpressao),
        tinhaCatalogo: Boolean(snapshot),
      };

      filaPedidos = [];
      filaImpressao = [];
      snapshot = null;
      try {
        salvarFila();
        salvarImpressao();
        gravarJson(ARQ_SNAPSHOT, snapshot);
      } catch {
        // Nada foi trocado de dono: volta tudo como estava — na memória E no
        // disco. Só a memória não bastava: a limpeza são três gravações, e se
        // a primeira passou e a segunda falhou, o arquivo de pedidos ficou
        // zerado no disco. No próximo início a ponte leria esse arquivo e os
        // pedidos que o caixa ainda não puxou teriam sumido em silêncio.
        //
        // Desfazer é melhor-esforço, cada gravação na sua própria tentativa:
        // falhar ao desfazer não pode estourar de novo aqui dentro. O que não
        // voltar fica dito no ponte.log, em português, junto do motivo
        // técnico que lib/persistencia.js já escreve.
        filaPedidos = pedidosAntes;
        filaImpressao = impressaoAntes;
        snapshot = snapshotAntes;
        config = configAntes;
        try {
          salvarFila();
        } catch (e) {
          logarErro("não consegui devolver ao disco os pedidos do estabelecimento anterior — eles podem não estar lá no próximo início", e);
        }
        try {
          salvarImpressao();
        } catch (e) {
          logarErro("não consegui devolver ao disco a fila de impressão do estabelecimento anterior", e);
        }
        try {
          gravarJson(ARQ_SNAPSHOT, snapshot);
        } catch (e) {
          logarErro("não consegui devolver ao disco o cardápio do estabelecimento anterior", e);
        }
        return responderJson(res, 503, { erro: "Não consegui limpar o que era do estabelecimento anterior, tente de novo." });
      }

      logar(
        `troca de estabelecimento — descartei ${descartados.pedidos} pedido(s) esperando o caixa, `
        + `${descartados.impressoes} comanda(s) na fila de impressão e `
        + `${descartados.tinhaCatalogo ? "o cardápio guardado" : "nenhum cardápio (não havia)"}.`,
      );
    }

    try {
      gravarJson(ARQ_CONFIG, config);
    } catch {
      // Vínculo que não foi para o disco some no próximo início — melhor não
      // fingir que deu certo. Volta tudo como estava e o app do caixa tenta
      // de novo (o motivo técnico já está no ponte.log). Numa troca de
      // estabelecimento, a limpeza acima já aconteceu: o vínculo continua o
      // antigo, só que sem fila nenhuma — a próxima tentativa termina o
      // serviço, e nada do restaurante anterior vaza para o novo.
      config = configAntes;
      return responderJson(res, 503, { erro: "Não consegui salvar o vínculo neste computador, tente de novo." });
    }

    // Fixar endereço é a decisão mais pesada que a ponte toma sozinha: dali em
    // diante ela atende esse site e nenhum outro. Por isso a PRIMEIRA fixação
    // fica escrita por extenso no ponte.log — é o que permite ao dono (ou ao
    // suporte) descobrir depois que a ponte foi vinculada de um endereço que
    // não é o do estabelecimento. O painel mostra o mesmo endereço na tela.
    if (fixouOrigem) {
      const origemAntes = normalizarOrigem(configAntes.origemPermitida);
      logar(
        origemAntes
          ? `endereço do app TROCADO: era ${origemAntes}, agora é ${origem} — só ele é atendido a partir de agora`
          : `endereço do app fixado nesta ponte: ${origem} — só ele é atendido a partir de agora`,
      );
    }
    logar(
      jaEra && jaEra !== validacao.vinculo.tenantId
        ? `estabelecimento TROCADO para ${validacao.vinculo.nome}`
        : `vinculada ao estabelecimento ${validacao.vinculo.nome}`,
    );
    return responderJson(res, 200, { ok: true, estabelecimento: resumoVinculo(config) });
  }

  // Saída de emergência do modelo de origem fixada: o estabelecimento trocou
  // de domínio (white-label), ou alguém vinculou do endereço errado. Só o
  // painel alcança esta rota — ele é servido pela própria ponte, então passa
  // pelo filtro de origem mesmo quando o endereço fixado está errado.
  if (rota === "POST /origem/esquecer") {
    const anterior = config.origemPermitida ?? "";
    delete config.origemPermitida;
    try {
      gravarJson(ARQ_CONFIG, config);
    } catch {
      // Sem disco, a liberação valeria só até fechar a ponte — e o dono ficaria
      // achando que resolveu. Devolve o endereço fixado e avisa.
      if (anterior) config.origemPermitida = anterior;
      return responderJson(res, 503, { erro: "Não consegui salvar a mudança neste computador, tente de novo." });
    }
    logar(anterior ? `endereço do app liberado (era ${anterior})` : "endereço do app já estava livre");
    return responderJson(res, 200, { ok: true, origemPermitida: null });
  }

  // ── Painel e instalação (só o PC do caixa) ───────────────────────────
  if (rota === "GET /painel/estado") {
    return responderJson(res, 200, {
      versao: VERSAO,
      porta: PORTA,
      estabelecimento: resumoVinculo(config),
      origemPermitida: config.origemPermitida ?? null,
      enderecoPalm: enderecoPalm(),
      pendentes: pedidosPendentes(filaPedidos).length,
      impressoesPendentes: contarPendentes(filaImpressao),
      instalacao: estadoInstalacao(),
    });
  }

  if (rota === "POST /instalar") {
    // Instalação por usuário (sem admin, sem UAC): copia o programa para a
    // pasta do usuário e cria os atalhos. Nunca derruba a ponte se falhar.
    const resultado = await instalar();
    if (resultado.ok) logar(`instalada em ${resultado.caminho}`);
    else logar(`instalação não concluída: ${resultado.erro}`);
    return responderJson(res, 200, resultado);
  }

  // ── Liberar o celular no Wi-Fi (só o PC do caixa) ────────────────────
  //
  // Sem esta regra, o firewall do Windows barra o celular em SILÊNCIO: o
  // garçom abre o Palm, fica rodando e dá "sem conexão", enquanto no PC do
  // caixa tudo parece certo. Quem chama é o botão do painel, e o Windows
  // ainda pergunta ao dono se pode — por isso a resposta volta inteira, para
  // o painel dizer se deu certo ou o que o Windows respondeu.
  if (rota === "POST /firewall/liberar") {
    const resultado = await liberarNoFirewall({ porta: PORTA });
    if (resultado.ok) logar(`porta ${PORTA} liberada no firewall — o celular do garçom já alcança a ponte.`);
    else logar(`não consegui liberar a porta ${PORTA} no firewall: ${resultado.erro}`);
    return responderJson(res, 200, resultado);
  }

  // ── Desligar a abertura automática (só o PC do caixa) ────────────────
  //
  // É o desfazer da instalação: serve para quem vai mudar a ponte de
  // computador, emprestar a máquina ou parar de usar. Depois disto a ponte
  // NÃO sobe mais sozinha quando o Windows liga — alguém precisa abrir pelo
  // atalho antes do serviço, senão as comandas não saem. Por isso o painel
  // confirma com o dono antes de chegar aqui.
  if (rota === "POST /autostart/desligar") {
    const resultado = await desativarAutoStart();
    if (resultado.ok) {
      logar(
        "abertura automática desligada pelo painel — a ponte não abre mais sozinha "
        + `(tarefa: ${resultado.tarefaRemovida ? "removida" : "não havia"}, atalhos: ${resultado.atalhosRemovidos}).`,
      );
    } else {
      logar(`não consegui desligar a abertura automática: ${resultado.erro}`);
    }
    return responderJson(res, 200, resultado);
  }

  // ── Parar a ponte (só o PC do caixa) ─────────────────────────────────
  //
  // Sem janela de console não existe Ctrl+C: se não houvesse este botão, o
  // dono não teria nenhuma forma de fechar o programa. Responde ANTES de
  // encerrar — o painel precisa receber o 200 para mostrar "ponte parada"
  // em vez de um erro de rede sem explicação.
  if (rota === "POST /parar") {
    logar("parada pedida no painel — encerrando a ponte");
    res.once("finish", () => {
      // Fecha o servidor (para de aceitar conexão nova) e sai logo em
      // seguida: a fila de pedidos e a de impressão já estão em disco, e o
      // que estava imprimindo volta para a fila no próximo início.
      try {
        servidor.close();
      } catch {
        // Já estava fechando — o exit abaixo resolve de qualquer jeito.
      }
      setTimeout(() => process.exit(0), 100);
    });
    return responderJson(res, 200, { ok: true, mensagem: "A ponte está sendo parada." });
  }

  if (rota === "POST /snapshot") {
    const { dados, erro } = await lerCorpo(req, res);
    if (erro) return responderJson(res, 400, { erro: recadoDeCorpo(erro, "o catálogo") });
    if (!dados || typeof dados !== "object") return responderJson(res, 400, { erro: "snapshot inválido" });
    const snapshotAntes = snapshot;
    snapshot = { ...dados, atualizadoEm: new Date().toISOString() };
    try {
      gravarJson(ARQ_SNAPSHOT, snapshot);
    } catch {
      // Sem o catálogo no disco, o Palm ficaria sem cardápio no próximo início
      // sem ninguém saber. O app do caixa manda de novo mais tarde.
      snapshot = snapshotAntes;
      return responderJson(res, 503, { erro: "Não consegui salvar o catálogo neste computador, tente de novo." });
    }
    return responderJson(res, 200, { ok: true });
  }

  if (rota === "GET /pedidos") {
    return responderJson(res, 200, { pedidos: pedidosPendentes(filaPedidos) });
  }

  if (rota === "POST /pedidos/confirmar") {
    const { dados, erro } = await lerCorpo(req, res);
    if (erro) return responderJson(res, 400, { erro: recadoDeCorpo(erro, "a lista de pedidos confirmados") });
    if (!Array.isArray(dados?.ids)) return responderJson(res, 400, { erro: "envie { ids: [...] }" });
    const resultado = confirmarPedidos(filaPedidos, dados.ids);
    const filaAntes = filaPedidos;
    filaPedidos = resultado.fila;
    if (resultado.confirmados > 0) {
      try {
        salvarFila();
      } catch {
        // Confirmação que não foi para o disco ressuscita o pedido no próximo
        // início e a comanda sai duas vezes. Melhor devolver a fila como
        // estava e deixar o caixa confirmar de novo.
        filaPedidos = filaAntes;
        return responderJson(res, 503, { erro: "Não consegui registrar a confirmação, tente de novo." });
      }
    }
    return responderJson(res, 200, { ok: true, confirmados: resultado.confirmados });
  }

  // ── Impressão (só localhost, pelo gate acima) ────────────────────────
  //
  // Ficam DEPOIS do gate de propósito: quem está no Wi-Fi manda pedido,
  // nunca aciona a impressora. Quem imprime é o app do caixa, no PC.
  if (rota === "GET /impressoras") {
    // A versão vai junto porque é nesta chamada que a tela de Impressão
    // do app descobre com que Ponte está falando — Ponte velha não
    // entende o tamanho da letra (POST /imprimir → tamanhoFonte) e a
    // tela precisa avisar em vez de deixar o dono achar que escolheu.
    try {
      return responderJson(res, 200, { impressoras: await listarImpressoras(), versao: VERSAO });
    } catch (e) {
      // Sem lista o caixa ainda consegue digitar o nome ou usar impressora
      // de rede — por isso avisa em vez de derrubar a tela. O texto cru do
      // Windows (caminho do PowerShell, linha de comando) fica no log: não
      // diz nada a quem está no caixa e desenha a máquina para quem lê.
      logarErro("não consegui ler a lista de impressoras do Windows", e);
      return responderJson(res, 200, {
        impressoras: [],
        versao: VERSAO,
        aviso: "Não deu para ler a lista de impressoras do Windows. Digite o nome da impressora ou use uma impressora de rede.",
      });
    }
  }

  if (rota === "POST /imprimir") {
    const { dados, erro } = await lerCorpo(req, res);
    if (erro) return responderJson(res, 400, { erro: recadoDeCorpo(erro, "o pedido de impressão") });

    // Mesma proteção que o pedido do Palm já tem (`adicionarPedido`, em
    // lib/pedidos.js): quando o caixa manda um `id`, ele quer dizer "esta é a
    // MESMA comanda que eu já pedi". Sem isso, bastava a ponte demorar mais
    // que o prazo do app — o caixa via erro, clicava de novo e a cozinha
    // recebia a comanda duas vezes, com o prato saindo repetido. O `id` é
    // opcional: quem não manda (o painel, o Palm) segue exatamente como antes.
    //
    // Mas quem MANDA um id ruim tem que ouvir. Antes, id curto ou que não era
    // texto era descartado em silêncio e a ponte sorteava outro: a resposta
    // vinha 202, o caixa achava que estava protegido contra o clique repetido
    // e não estava — dois envios do mesmo id viravam duas comandas na cozinha.
    // Proteção que falha calada é pior do que proteção nenhuma.
    const idBruto = dados?.id;
    const mandouId = idBruto !== undefined && idBruto !== null;
    if (mandouId && typeof idBruto !== "string") {
      logar("impressão recusada — o identificador da comanda veio em formato inválido (não é texto)");
      return responderJson(res, 400, { erro: "O identificador da comanda precisa ser um texto." });
    }
    if (mandouId && idBruto.length < ID_IMPRESSAO_MINIMO) {
      logar(`impressão recusada — identificador da comanda com ${idBruto.length} caractere(s), o mínimo é ${ID_IMPRESSAO_MINIMO}`);
      return responderJson(res, 400, {
        erro: `O identificador da comanda é curto demais — use pelo menos ${ID_IMPRESSAO_MINIMO} caracteres.`,
      });
    }
    const idDoCaixa = mandouId ? idBruto.slice(0, 64) : "";

    // Repetir um id que ainda vai sair, que está saindo ou que já saiu é o
    // clique repetido do caixa: nada a fazer, a comanda já foi. Repetir um id que
    // DESISTIU é outra história — aquele papel nunca saiu, e responder
    // "duplicado" ali deixava a tela dizendo sucesso enquanto a cozinha
    // continuava sem a comanda. Esse caso é reimpressão e entra na fila.
    let reimpressaoDeFalha = false;
    if (idDoCaixa) {
      const jaEstava = filaImpressao.find((t) => t?.id === idDoCaixa);
      if (jaEstava && jaEstava.estado !== IMPRESSAO_DESISTIU) {
        logar(`impressão repetida (ignorada) — esta comanda ${COMO_ESTA_A_COMANDA[jaEstava.estado] ?? "já foi pedida antes"}`);
        return responderJson(res, 200, { ok: true, id: idDoCaixa, duplicado: true });
      }
      if (jaEstava) reimpressaoDeFalha = true;
    }

    const validacao = criarTrabalho(dados, { id: idDoCaixa || crypto.randomUUID() });
    if (!validacao.ok) return responderJson(res, 400, { erro: validacao.erro });

    const filaAntes = filaImpressao;
    // O registro que desistiu SAI antes de o novo entrar. Dois registros com o
    // mesmo id na fila corromperiam o andamento: `marcarImprimindo` e
    // `marcarConcluido` (lib/filaImpressao.js) mexem em TODOS os registros
    // daquele id, então a tentativa velha ressuscitaria como "imprimindo" e
    // entraria de novo na conta de comandas pendentes do caixa.
    const semATentativaQueDesistiu = reimpressaoDeFalha
      ? filaImpressao.filter((t) => t?.id !== idDoCaixa)
      : filaImpressao;
    filaImpressao = podarFila([...semATentativaQueDesistiu, validacao.trabalho]);
    try {
      salvarImpressao();
    } catch {
      // Aqui a comanda ainda NÃO foi mandada para a impressora — então tirar
      // o trabalho da fila é o certo: o caixa manda de novo e a comanda sai
      // uma vez só. Deixar na fila e responder erro faria sair duas.
      filaImpressao = filaAntes;
      return responderJson(res, 503, { erro: "Não consegui registrar a impressão, tente de novo." });
    }
    agendarImpressao(); // não espera a impressora para responder

    logar(`${reimpressaoDeFalha ? "reimpressão na fila (a tentativa anterior tinha desistido)" : "impressão na fila"} — ${validacao.trabalho.linhas.length} linha(s), destino ${validacao.trabalho.destino.tipo}`);
    return responderJson(res, 202, { ok: true, id: validacao.trabalho.id, estado: validacao.trabalho.estado });
  }

  if (rota === "GET /impressao") {
    return responderJson(res, 200, {
      trabalhos: filaImpressao,
      pendentes: contarPendentes(filaImpressao),
    });
  }

  if (rota === "POST /impressao/limpar") {
    const resultado = limparFinalizados(filaImpressao);
    const filaAntes = filaImpressao;
    filaImpressao = resultado.fila;
    if (resultado.removidos > 0) {
      try {
        salvarImpressao();
      } catch {
        // A lista voltaria cheia no próximo início; melhor não dizer "limpei".
        filaImpressao = filaAntes;
        return responderJson(res, 503, { erro: "Não consegui limpar a lista neste computador, tente de novo." });
      }
    }
    return responderJson(res, 200, { ok: true, removidos: resultado.removidos });
  }

  return responderJson(res, 404, { erro: "rota desconhecida" });
}

servidor.listen(PORTA, "0.0.0.0", () => {
  const ips = enderecosLan(os.networkInterfaces());
  const vinculo = resumoVinculo(config);
  const instalacao = estadoInstalacao();

  // O antigo banner na tela morreu junto com a janela de console. O mesmo
  // conteúdo agora fica no ponte.log — com o token do Palm MASCARADO, porque
  // arquivo de log qualquer um no PC lê (ver lib/log.js).
  logar(`KORA Ponte no ar — versão ${VERSAO}, porta ${PORTA}${AUTOSTART ? ", subiu junto com o Windows" : ""}`);
  logar(vinculo.vinculado
    ? `estabelecimento: ${vinculo.nome}`
    : "estabelecimento: aguardando — abra o sistema KORA neste computador.");
  logar(`painel: http://localhost:${PORTA}`);
  for (const ip of ips) logar(`no celular: http://${ip}:${PORTA}/palm?t=${config.token}`);
  if (instalacao.empacotado && !instalacao.instalado) {
    logar("ainda não instalada — use \"Instalar neste computador\" no painel para ela abrir sozinha com o Windows.");
  }
  logar("para parar, use o botão \"Parar a ponte\" no painel.");

  abrirPainelNoNavegador();
});

/**
 * Pergunta a quem está ocupando a porta se ele é a KORA Ponte.
 *
 * Só a ponte responde `{ nome: "KORA Ponte" }` em /saude. Qualquer outra
 * coisa — um servidor de desenvolvimento, o painel de outro programa, uma
 * porta presa por um processo travado — responde outra coisa, responde lixo
 * ou não responde nada.
 *
 * Nunca lança e sempre termina: na dúvida, responde "não é a ponte", que é o
 * lado seguro (o dono é avisado em vez de a ponte fingir que está no ar).
 *
 * @param {number} porta
 * @returns {Promise<boolean>}
 */
function ehAPonteQueEstaNaPorta(porta) {
  return new Promise((resolve) => {
    let respondido = false;
    const responder = (ehAPonte) => {
      if (respondido) return;
      respondido = true;
      resolve(ehAPonte);
    };

    let pedido;
    try {
      pedido = http.get(
        { host: "127.0.0.1", port: porta, path: "/saude", timeout: TIMEOUT_SONDA_MS },
        (resposta) => {
          if (resposta.statusCode !== 200) {
            resposta.resume();
            return responder(false);
          }

          const pedacos = [];
          let bytes = 0;
          resposta.on("data", (parte) => {
            bytes += parte.length;
            // Teto de bobagem: /saude cabe em pouquíssimos bytes. Se do outro
            // lado vier um arquivo enorme, já é resposta de outro programa.
            if (bytes > 64 * 1024) {
              resposta.destroy();
              return responder(false);
            }
            pedacos.push(parte);
          });
          resposta.on("end", () => {
            try {
              responder(JSON.parse(Buffer.concat(pedacos).toString("utf8"))?.nome === "KORA Ponte");
            } catch {
              responder(false);
            }
          });
          resposta.on("error", () => responder(false));
        },
      );
    } catch {
      return responder(false);
    }

    pedido.on("timeout", () => {
      // Quem está do outro lado é o próprio computador: ou responde na hora,
      // ou não é a ponte. Não dá para deixar o dono esperando na frente do
      // ícone que ele acabou de clicar.
      pedido.destroy();
      responder(false);
    });
    pedido.on("error", () => responder(false));
  });
}

servidor.on("error", async (err) => {
  if (err.code === "EADDRINUSE") {
    // Alguém já está usando a porta — mas QUEM? Antes a ponte simplesmente
    // supunha que era ela mesma e abria o painel: quando era outro programa,
    // o dono via uma página estranha (ou de erro) e nunca descobria por que
    // as comandas tinham parado de sair. Agora perguntamos primeiro.
    const ehAPonte = await ehAPonteQueEstaNaPorta(PORTA);

    if (!ehAPonte) {
      logar(`a porta ${PORTA} está ocupada por OUTRO programa — não é a KORA Ponte. Não subi.`);
      // O mesmo cuidado do erro fatal abaixo: com `--autostart` o Windows
      // tenta de novo de tempos em tempos, e abrir o aviso toda vez encheria
      // a tela do caixa de janelas.
      if (!AUTOSTART) {
        avisarErroFatal(
          `Outro programa deste computador está usando a porta ${PORTA}, que é a porta da KORA Ponte. `
          + "Feche esse programa e abra a ponte de novo — ou chame o suporte para mudar a porta da ponte.",
          err.message ?? String(err),
        );
      }
      setTimeout(() => process.exit(1), 1500);
      return;
    }

    // É a ponte mesmo que está na porta. Este segundo duplo clique é também a
    // ÚNICA rota de atualização que o dono conhece: ele baixa o programa novo
    // e clica nele com a ponte antiga no ar. Quem atende o restaurante segue
    // sendo a que já está rodando — o que este processo pode fazer é deixar a
    // CÓPIA INSTALADA atualizada, para o próximo início já subir na nova.
    try {
      const atualizacao = await atualizarInstalado();
      if (!atualizacao.ok) {
        logar(`não consegui atualizar a cópia instalada agora: ${atualizacao.erro ?? "motivo desconhecido"}`);
      } else if (atualizacao.atualizou) {
        logar(`versão nova copiada por cima da instalada em ${atualizacao.caminho} — passa a valer no próximo início da ponte.`);
      } else if (atualizacao.jaEraEste) {
        logar("nada a atualizar — este programa já é a própria cópia instalada.");
      } else {
        logar(`a cópia instalada continua como estava — ${atualizacao.motivo || "já era esta versão"}.`);
      }
    } catch (e) {
      // Atualizar é bônus; abrir o painel é o que o dono está esperando ver.
      logarErro("não consegui atualizar a cópia instalada", e);
    }

    // A ponte já está aberta neste computador (o dono clicou duas vezes no
    // ícone, ou o atalho da Inicialização já a subiu). Sem janela, o segundo
    // clique morreria calado e ele acharia que nada funciona — então abrimos
    // o painel da instância que JÁ está rodando, que é a resposta certa, e
    // saímos em paz (código 0: isso não é defeito).
    logar(`a porta ${PORTA} já está em uso — a ponte já estava aberta. Abrindo o painel dela.`);
    abrirPainelNoNavegador();
    // Um instante para o navegador ser lançado antes de o processo sumir.
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  logarErro("a ponte não conseguiu subir", err);
  if (!AUTOSTART) {
    avisarErroFatal(
      "O programa abriu, mas não conseguiu ficar no ar neste computador.",
      err.message ?? String(err),
    );
  }
  setTimeout(() => process.exit(1), 1500);
});
