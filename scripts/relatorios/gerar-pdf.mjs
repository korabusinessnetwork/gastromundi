#!/usr/bin/env node
// Gera o PDF de um relatório a partir do HTML dele, pelo Chromium do Playwright.
// Uso: node scripts/relatorios/gerar-pdf.mjs <entrada.html> <saida.pdf>
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error("Uso: node scripts/relatorios/gerar-pdf.mjs <entrada.html> <saida.pdf>");
  process.exit(1);
}
const { chromium } = createRequire(import.meta.url)("playwright");
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.goto(pathToFileURL(resolve(entrada)).href, { waitUntil: "load" });
await pagina.pdf({ path: resolve(saida), format: "A4", printBackground: true, preferCSSPageSize: true });
await navegador.close();
console.log(`PDF gerado em ${saida}`);
