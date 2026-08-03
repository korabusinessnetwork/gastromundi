#!/usr/bin/env node

/**
 * Smoke test do laboratório — levanta o dev server, abre a rota no navegador,
 * e falha se houver erro no console ou na página.
 *
 * Uso:
 *   node tools/smoke.mjs --rota=/ --rodada=1
 *
 * Flags:
 *   --rota=<caminho>    a rota a abrir (obrigatório)
 *   --rodada=<N>        número da rodada, para nomear a screenshot (opcional)
 *   --porta=<N>         porta do dev server (default: 5174)
 *   --timeout=<ms>      timeout em ms (default: 10000)
 *   --debug             mostra más de diagnóstico
 *
 * Saída: exit 0 se passou, exit 1 se falhou. Screenshot em
 * D:/Vault/kora/Screenshots/rodada-<N>.png (ou smoke-manual.png se sem --rodada).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    if (arg.startsWith("--")) {
      const [k, v] = arg.substring(2).split("=");
      return [k, v || true];
    }
    return [null, null];
  })
);

const rota = args.rota || "/";
const rodada = args.rodada || "manual";
const porta = parseInt(args.porta || "5174", 10);
const timeout = parseInt(args.timeout || "10000", 10);
const debug = args.debug === true;

const vaultScreenshots = process.env.KORA_VAULT
  ? path.join(process.env.KORA_VAULT, "Screenshots")
  : "D:/Vault/kora/Screenshots";

function log(msg) {
  console.error(`[smoke] ${msg}`);
}

async function rodarVite() {
  log(`iniciando vite dev server na porta ${porta}...`);
  return new Promise((resolve, reject) => {
    const vite = spawn("npx", ["vite", "--port", String(porta), "--strictPort"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let rodando = false;
    const timeout1 = setTimeout(() => {
      if (!rodando) {
        vite.kill();
        reject(new Error(`vite não respondeu em 5s`));
      }
    }, 5000);

    vite.stderr.on("data", (data) => {
      const str = data.toString();
      if (debug) console.error(`[vite stderr] ${str}`);
      if (str.includes("local:") || str.includes("VITE")) {
        rodando = true;
        clearTimeout(timeout1);
        resolve(vite);
      }
    });
    vite.stdout.on("data", (data) => {
      if (debug) console.log(`[vite stdout] ${data}`);
    });

    vite.on("error", reject);
  });
}

async function testarPagina(browser, rota, porta) {
  log(`abrindo http://localhost:${porta}${rota}...`);
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  let sucesso = true;
  let ultimoErro = null;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      log(`console.error: ${msg.text()}`);
      sucesso = false;
      ultimoErro = msg.text();
    }
  });

  page.on("pageerror", (err) => {
    log(`pageerror: ${err.message}`);
    sucesso = false;
    ultimoErro = err.message;
  });

  try {
    const res = await page.goto(`http://localhost:${porta}${rota}`, {
      timeout,
    });

    if (!res.ok()) {
      log(`HTTP ${res.status()} em ${rota}`);
      sucesso = false;
      ultimoErro = `HTTP ${res.status()}`;
    }

    // Aguarda um pouco para garantir que o React renderizou
    await page.waitForTimeout(1000);

    // Verifica se a página não ficou completamente vazia
    const body = await page.textContent("body");
    if (!body || body.trim().length === 0) {
      log("página ficou vazia");
      sucesso = false;
      ultimoErro = "página vazia";
    }

    // Screenshot
    if (!fs.existsSync(vaultScreenshots)) {
      fs.mkdirSync(vaultScreenshots, { recursive: true });
    }
    const nomeScreenshot =
      rodada === "manual" ? "smoke-manual.png" : `rodada-${rodada}.png`;
    const caminhoScreenshot = path.join(vaultScreenshots, nomeScreenshot);
    await page.screenshot({ path: caminhoScreenshot });
    log(`screenshot: ${caminhoScreenshot}`);
  } catch (err) {
    log(`erro ao carregar a página: ${err.message}`);
    sucesso = false;
    ultimoErro = err.message;
  } finally {
    await page.close();
    await context.close();
  }

  if (!sucesso) {
    throw new Error(`Smoke falhou na rota ${rota}: ${ultimoErro}`);
  }
}

(async () => {
  let vite;
  try {
    vite = await rodarVite();

    const browser = await chromium.launch();
    try {
      await testarPagina(browser, rota, porta);
      log(`✓ smoke passou na rota ${rota}`);
      process.exit(0);
    } finally {
      await browser.close();
    }
  } catch (err) {
    log(`✗ ${err.message}`);
    process.exit(1);
  } finally {
    if (vite) vite.kill();
  }
})();
