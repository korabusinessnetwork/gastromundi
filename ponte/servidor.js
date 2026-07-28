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
  ehEnderecoLocal, cabecalhosCors, tokenDaRequisicao, tokenValido, enderecosLan,
} from "./lib/http.js";
import {
  criarTrabalho, proximoTrabalho, marcarImprimindo, marcarConcluido, marcarFalha,
  destravarImprimindo, contarPendentes, podarFila, limparFinalizados,
} from "./lib/filaImpressao.js";
import { montarBytes } from "./lib/escpos.js";
import { listarImpressoras, enviarBytes } from "./lib/impressoras.js";
import { EMPACOTADO, dirDados, estadoInstalacao, instalar } from "./lib/instalacao.js";
import { validarVinculo, aplicarVinculo, resumoVinculo } from "./lib/vinculo.js";

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

const PORTA = Number(process.env.KORA_PONTE_PORTA) || 8123;
const VERSAO = "1.0.0";
const MAX_CORPO = 1024 * 1024; // 1 MiB — snapshot de catálogo cabe com folga
const INTERVALO_IMPRESSAO_MS = 3000; // de quanto em quanto a fila é olhada

// ── Persistência simples em disco (sobrevive a reiniciar o PC) ─────────
fs.mkdirSync(DIR_DADOS, { recursive: true });

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
function responderJson(res, status, corpo) {
  const dados = JSON.stringify(corpo);
  res.writeHead(status, {
    ...cabecalhosCors(),
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
 * Abre o painel no navegador do PC do caixa.
 *
 * Só no .exe: quem dá duplo clique no programa espera VER alguma coisa —
 * uma janela preta de console não diz se funcionou. Rodando pelo código,
 * abrir o navegador a cada reinício durante o desenvolvimento só atrapalha.
 */
function abrirPainelNoNavegador() {
  if (!EMPACOTADO || process.platform !== "win32") return;
  // Argumentos vão como lista (nunca concatenados), e o "" é o título da
  // janela que o `start` exige antes da URL.
  execFile("cmd", ["/c", "start", "", `http://localhost:${PORTA}/`], { timeout: 5000 }, () => {});
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
    console.log(`[ponte] impressão ${trabalho.id} concluída (${trabalho.linhas.length} linha(s))`);
  } catch (e) {
    filaImpressao = marcarFalha(filaImpressao, trabalho.id, e);
    const atual = filaImpressao.find((t) => t.id === trabalho.id);
    console.warn(`[ponte] impressão ${trabalho.id} ${atual?.estado === "falhou" ? "DESISTIU" : "vai tentar de novo"}: ${e.message}`);
  } finally {
    filaImpressao = podarFila(filaImpressao);
    salvarImpressao();
    imprimindo = false;
  }
}

function agendarImpressao() {
  // Sem await de propósito: quem pediu a impressão recebe o 202 na hora,
  // a impressora leva o tempo que levar.
  ciclarImpressao().catch((e) => console.error("[ponte] erro inesperado na fila de impressão:", e.message));
}

setInterval(agendarImpressao, INTERVALO_IMPRESSAO_MS);

// ── Servidor ───────────────────────────────────────────────────────────
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const rota = `${req.method} ${url.pathname}`;
  const local = ehEnderecoLocal(req.socket.remoteAddress);
  const comToken = tokenValido(tokenDaRequisicao({ headers: req.headers, url }), config.token);

  // Preflight CORS (o app HTTPS do caixa chega aqui via localhost).
  if (req.method === "OPTIONS") {
    res.writeHead(204, cabecalhosCors());
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
    console.log(`[ponte] pedido ${resultado.duplicado ? "repetido (ignorado)" : "recebido"} — comanda ${validacao.pedido.comanda}, ${validacao.pedido.items.length} item(ns)`);
    return responderJson(res, resultado.duplicado ? 200 : 201, { ok: true, id: resultado.registro.id, duplicado: resultado.duplicado });
  }

  // ── Só o PC do caixa (localhost) ─────────────────────────────────────
  if (!local) return responderJson(res, 403, { erro: "Rota disponível apenas no PC do caixa." });

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
    gravarJson(ARQ_CONFIG, config);
    console.log(
      jaEra && jaEra !== validacao.vinculo.tenantId
        ? `[ponte] estabelecimento TROCADO para ${validacao.vinculo.nome}`
        : `[ponte] vinculada ao estabelecimento ${validacao.vinculo.nome}`,
    );
    return responderJson(res, 200, { ok: true, estabelecimento: resumoVinculo(config) });
  }

  // ── Painel e instalação (só o PC do caixa) ───────────────────────────
  if (rota === "GET /painel/estado") {
    return responderJson(res, 200, {
      versao: VERSAO,
      porta: PORTA,
      estabelecimento: resumoVinculo(config),
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
    if (resultado.ok) console.log(`[ponte] instalada em ${resultado.caminho}`);
    else console.warn(`[ponte] instalação não concluída: ${resultado.erro}`);
    return responderJson(res, 200, resultado);
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
      // de rede — por isso avisa em vez de derrubar a tela.
      return responderJson(res, 200, { impressoras: [], aviso: e.message });
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

    console.log(`[ponte] impressão na fila — ${validacao.trabalho.linhas.length} linha(s), destino ${validacao.trabalho.destino.tipo}`);
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

  console.log("┌────────────────────────────────────────────────┐");
  console.log("│  KORA Ponte — pedidos sem internet e impressão │");
  console.log("└────────────────────────────────────────────────┘");
  console.log(vinculo.vinculado
    ? `  Estabelecimento: ${vinculo.nome}`
    : "  Estabelecimento: aguardando — abra o sistema KORA neste PC.");
  console.log(`  Painel:          http://localhost:${PORTA}`);
  for (const ip of ips) console.log(`  No celular:      http://${ip}:${PORTA}/palm?t=${config.token}`);
  if (instalacao.empacotado && !instalacao.instalado) {
    console.log("  → Clique em \"Instalar neste computador\" no painel para");
    console.log("    ela abrir sozinha junto com o Windows.");
  }
  console.log("  Deixe esta janela aberta (pode minimizar). Para parar: Ctrl+C.");

  abrirPainelNoNavegador();
});

servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`A porta ${PORTA} já está em uso — a ponte já está rodando? (defina KORA_PONTE_PORTA para trocar)`);
  } else {
    console.error("Erro no servidor da ponte:", err.message);
  }
  process.exit(1);
});
