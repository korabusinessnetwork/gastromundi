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
import { fileURLToPath } from "node:url";
import {
  validarPedido, adicionarPedido, pedidosPendentes, confirmarPedidos, podarConfirmados,
} from "./lib/pedidos.js";
import {
  ehEnderecoLocal, cabecalhosCors, tokenDaRequisicao, tokenValido, enderecosLan,
} from "./lib/http.js";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const DIR_DADOS = path.join(RAIZ, "dados");
const ARQ_CONFIG = path.join(DIR_DADOS, "config.json");
const ARQ_SNAPSHOT = path.join(DIR_DADOS, "snapshot.json");
const ARQ_PEDIDOS = path.join(DIR_DADOS, "pedidos.json");
const ARQ_PALM = path.join(RAIZ, "palm.html");

const PORTA = Number(process.env.KORA_PONTE_PORTA) || 8123;
const VERSAO = "1.0.0";
const MAX_CORPO = 1024 * 1024; // 1 MiB — snapshot de catálogo cabe com folga

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
    return responderJson(res, 200, { ok: true, nome: "KORA Ponte", versao: VERSAO, pendentes: pedidosPendentes(filaPedidos).length });
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
    });
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

  return responderJson(res, 404, { erro: "rota desconhecida" });
});

servidor.listen(PORTA, "0.0.0.0", () => {
  const ips = enderecosLan(os.networkInterfaces());
  console.log("┌────────────────────────────────────────────────┐");
  console.log("│  KORA Ponte — pedidos sem internet             │");
  console.log("└────────────────────────────────────────────────┘");
  console.log(`  No PC do caixa:  http://localhost:${PORTA}`);
  for (const ip of ips) console.log(`  No celular:      http://${ip}:${PORTA}/palm?t=${config.token}`);
  console.log("  Deixe esta janela aberta. Para parar: Ctrl+C.");
});

servidor.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`A porta ${PORTA} já está em uso — a ponte já está rodando? (defina KORA_PONTE_PORTA para trocar)`);
  } else {
    console.error("Erro no servidor da ponte:", err.message);
  }
  process.exit(1);
});
