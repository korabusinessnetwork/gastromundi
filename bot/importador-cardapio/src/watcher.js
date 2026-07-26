// ──────────────────────────────────────────────────────────────────
// Vigia uma pasta e importa cada planilha que aparece. Depois de
// processar, MOVE o arquivo pra "processados/" (sucesso) ou "erros/"
// (falha) — assim o mesmo arquivo nao e reprocessado em loop e o dono ve
// de relance o que entrou e o que travou.
// ──────────────────────────────────────────────────────────────────

import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";

import { importarCardapio, resumoImportacao, formatoDoArquivo } from "./core.js";

const carimbo = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg) => console.log(`[${carimbo()}] ${msg}`);

// Move o arquivo pra subpasta (processados/erros), criando-a se preciso.
async function moverPara(subpasta, arquivo, base) {
  const destinoDir = path.join(base, subpasta);
  await mkdir(destinoDir, { recursive: true });
  const destino = path.join(destinoDir, path.basename(arquivo));
  await rename(arquivo, destino);
}

async function processar(arquivo, supabase, base) {
  const nome = path.basename(arquivo);
  try {
    log(`Importando "${nome}"...`);
    const r = await importarCardapio(arquivo, supabase);
    log(`OK "${nome}": ${resumoImportacao(r)}.`);
    for (const e of r.erros ?? []) log(`   - linha ${e.linha}: ${e.mensagem}`);
    await moverPara("processados", arquivo, base);
  } catch (err) {
    log(`ERRO "${nome}": ${err.message}`);
    // Best-effort: se nao der pra mover, o arquivo fica e sera reprocessado —
    // seguro, porque a importacao e idempotente.
    await moverPara("erros", arquivo, base).catch(() => {});
  }
}

/**
 * Comeca a vigiar `pasta`. Retorna o observador (chame .close() pra parar).
 * @param {string} pasta
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<import("chokidar").FSWatcher>}
 */
export async function vigiar(pasta, supabase) {
  const base = path.resolve(pasta);
  await mkdir(base, { recursive: true });
  log(`Vigiando "${base}" — solte planilhas .csv ou .xlsx aqui. Ctrl+C para sair.`);

  const observador = chokidar.watch(base, {
    depth: 0, // so a raiz da pasta; ignora processados/ e erros/
    ignoreInitial: false, // processa o que ja estiver la ao iniciar
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 }, // espera a copia terminar
  });

  observador.on("add", (arquivo) => {
    // Ignora qualquer coisa fora da raiz (as subpastas de destino) e nao-planilhas.
    if (path.dirname(path.resolve(arquivo)) !== base) return;
    if (!formatoDoArquivo(arquivo)) return;
    processar(arquivo, supabase, base);
  });

  return observador;
}
