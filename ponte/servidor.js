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
import { EMPACOTADO, ARG_AUTOSTART, dirDados, estadoInstalacao, instalar } from "./lib/instalacao.js";
import { validarVinculo, aplicarVinculo, resumoVinculo } from "./lib/vinculo.js";
import { configurarLog, caminhoLog, logar, logarErro } from "./lib/log.js";

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
const VERSAO = "1.0.0";
const MAX_CORPO = 1024 * 1024; // 1 MiB — snapshot de catálogo cabe com folga
const INTERVALO_IMPRESSAO_MS = 3000; // de quanto em quanto a fila é olhada

// ── Persistência simples em disco (sobrevive a reiniciar o PC) ─────────
fs.mkdirSync(DIR_DADOS, { recursive: true });

// Empacotada, a ponte roda SEM janela de console (ver lib/pe.js): não existe
// mais tela para onde mandar mensagem. Tudo que antes ia para o console passa
// a ir para <dados>/ponte.log, que é onde se descobre o que aconteceu.
configurarLog({ dir: DIR_DADOS });

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return padrao;
  }
}

function gravarJson(arquivo, dados) {
  const tmp = `${arquivo}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados));
  fs.renameSync(tmp, arquivo); // troca atômica — queda de luz não corrompe
}

// Token nasce no primeiro uso e fica no PC do caixa. É ele que separa
// "equipe do estabelecimento" de "qualquer aparelho no mesmo Wi-Fi".
let config = lerJson(ARQ_CONFIG, null);
if (!config?.token) {
  config = { token: crypto.randomBytes(16).toString("hex"), criadoEm: new Date().toISOString() };
  gravarJson(ARQ_CONFIG, config);
}

let filaPedidos = podarConfirmados(lerJson(ARQ_PEDIDOS, []));
let snapshot = lerJson(ARQ_SNAPSHOT, null);

function salvarFila() {
  filaPedidos = podarConfirmados(filaPedidos);
  gravarJson(ARQ_PEDIDOS, filaPedidos);
}

// Fila de impressão: trabalho que estava "imprimindo" quando a ponte foi
// fechada (ou faltou luz) volta para a fila — aquela comanda não saiu.
let filaImpressao = podarFila(destravarImprimindo(lerJson(ARQ_IMPRESSAO, [])));

function salvarImpressao() {
  gravarJson(ARQ_IMPRESSAO, filaImpressao);
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

function lerCorpoJson(req) {
  return new Promise((resolve) => {
    let corpo = "";
    let excedeu = false;
    req.on("data", (parte) => {
      corpo += parte;
      if (corpo.length > MAX_CORPO) {
        excedeu = true;
        req.destroy();
      }
    });
    req.on("end", () => {
      if (excedeu) return resolve({ erro: "muito grande" });
      try {
        resolve({ dados: JSON.parse(corpo || "null") });
      } catch {
        resolve({ erro: "json inválido" });
      }
    });
    req.on("error", () => resolve({ erro: "conexão interrompida" }));
  });
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
  salvarImpressao();

  try {
    // Cópias viram um único envio: o spooler trata como um trabalho só e
    // não corre o risco de outra comanda entrar no meio das vias.
    const umaVia = montarBytes(trabalho.linhas, { cortaPapel: trabalho.cortaPapel });
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
    salvarImpressao();
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
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const rota = `${req.method} ${url.pathname}`;
  const local = ehEnderecoLocal(req.socket.remoteAddress);
  const comToken = tokenValido(tokenDaRequisicao({ headers: req.headers, url }), config.token);

  // Origem do pedido, decidida uma vez e carregada no `res` para todas as
  // respostas desta requisição. `config.origemPermitida` é o endereço do app
  // do caixa, aprendido no primeiro vínculo — ver `origemAceita` em lib/http.
  const origem = normalizarOrigem(req.headers.origin);
  const daCasa = origemAceita({ origem, host: req.headers.host, fixada: config.origemPermitida });
  res.corsKora = cabecalhosCors({ origem, host: req.headers.host, fixada: config.origemPermitida });

  // Preflight CORS (o app HTTPS do caixa chega aqui via localhost).
  if (req.method === "OPTIONS") {
    res.writeHead(204, res.corsKora);
    return res.end();
  }

  // ── Público na rede local ────────────────────────────────────────────
  if (rota === "GET /saude") {
    return responderJson(res, 200, {
      ok: true,
      nome: "KORA Ponte",
      versao: VERSAO,
      pendentes: pedidosPendentes(filaPedidos).length,
      impressoesPendentes: contarPendentes(filaImpressao),
      estabelecimento: resumoVinculo(config),
    });
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
    const { dados, erro } = await lerCorpoJson(req);
    if (erro) return responderJson(res, 400, { erro: "Não deu para ler o pedido. Tente de novo." });
    const validacao = validarPedido(dados);
    if (!validacao.ok) return responderJson(res, 422, { erro: validacao.erro });
    const resultado = adicionarPedido(filaPedidos, validacao.pedido, { gerarId: () => crypto.randomUUID() });
    filaPedidos = resultado.fila;
    if (!resultado.duplicado) salvarFila();
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
    return responderJson(res, 403, { erro: "Este endereço não é o do estabelecimento vinculado a esta ponte." });
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
    const { dados, erro } = await lerCorpoJson(req);
    if (erro) return responderJson(res, 400, { erro: "Não deu para ler o vínculo. Tente de novo." });

    const validacao = validarVinculo(dados);
    if (!validacao.ok) return responderJson(res, 400, { erro: validacao.erro });

    const jaEra = config.estabelecimento?.tenantId;
    config = aplicarVinculo(config, validacao.vinculo);
    // Aprende o endereço do app do caixa junto com o vínculo — daqui em
    // diante é o único site do navegador que esta ponte atende. Só grava
    // origem de fora: a própria ponte (painel/Palm) não é o app do caixa e
    // não pode virar dona do vínculo.
    const daPropriaPonte = origem === `http://${req.headers.host}` || origem === `https://${req.headers.host}`;
    if (origem && !daPropriaPonte && normalizarOrigem(config.origemPermitida) !== origem) {
      config.origemPermitida = origem;
      logar(`endereço do app fixado: ${origem}`);
    }
    gravarJson(ARQ_CONFIG, config);
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
    gravarJson(ARQ_CONFIG, config);
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
    const { dados, erro } = await lerCorpoJson(req);
    if (erro || !dados || typeof dados !== "object") return responderJson(res, 400, { erro: "snapshot inválido" });
    snapshot = { ...dados, atualizadoEm: new Date().toISOString() };
    gravarJson(ARQ_SNAPSHOT, snapshot);
    return responderJson(res, 200, { ok: true });
  }

  if (rota === "GET /pedidos") {
    return responderJson(res, 200, { pedidos: pedidosPendentes(filaPedidos) });
  }

  if (rota === "POST /pedidos/confirmar") {
    const { dados, erro } = await lerCorpoJson(req);
    if (erro || !Array.isArray(dados?.ids)) return responderJson(res, 400, { erro: "envie { ids: [...] }" });
    const resultado = confirmarPedidos(filaPedidos, dados.ids);
    filaPedidos = resultado.fila;
    if (resultado.confirmados > 0) salvarFila();
    return responderJson(res, 200, { ok: true, confirmados: resultado.confirmados });
  }

  // ── Impressão (só localhost, pelo gate acima) ────────────────────────
  //
  // Ficam DEPOIS do gate de propósito: quem está no Wi-Fi manda pedido,
  // nunca aciona a impressora. Quem imprime é o app do caixa, no PC.
  if (rota === "GET /impressoras") {
    try {
      return responderJson(res, 200, { impressoras: await listarImpressoras() });
    } catch (e) {
      // Sem lista o caixa ainda consegue digitar o nome ou usar impressora
      // de rede — por isso avisa em vez de derrubar a tela. O texto cru do
      // Windows (caminho do PowerShell, linha de comando) fica no log: não
      // diz nada a quem está no caixa e desenha a máquina para quem lê.
      console.error("[ponte] falha ao listar impressoras:", e);
      return responderJson(res, 200, {
        impressoras: [],
        aviso: "Não deu para ler a lista de impressoras do Windows. Digite o nome da impressora ou use uma impressora de rede.",
      });
    }
  }

  if (rota === "POST /imprimir") {
    const { dados, erro } = await lerCorpoJson(req);
    if (erro) return responderJson(res, 400, { erro: "Não deu para ler o pedido de impressão. Tente de novo." });

    const validacao = criarTrabalho(dados, { id: crypto.randomUUID() });
    if (!validacao.ok) return responderJson(res, 400, { erro: validacao.erro });

    filaImpressao = podarFila([...filaImpressao, validacao.trabalho]);
    salvarImpressao();
    agendarImpressao(); // não espera a impressora para responder

    logar(`impressão na fila — ${validacao.trabalho.linhas.length} linha(s), destino ${validacao.trabalho.destino.tipo}`);
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
    filaImpressao = resultado.fila;
    if (resultado.removidos > 0) salvarImpressao();
    return responderJson(res, 200, { ok: true, removidos: resultado.removidos });
  }

  return responderJson(res, 404, { erro: "rota desconhecida" });
});

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

servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
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
