#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────────
// Ponto de entrada do bot importador de cardapio.
//
//   node src/index.js                -> vigia a pasta (modo padrao)
//   node src/index.js --once <arq>   -> importa UM arquivo e sai
//
// Empacotavel como .exe (npm run build:exe) para rodar sem instalar Node.
// ──────────────────────────────────────────────────────────────────

import { carregarConfig } from "./config.js";
import { conectar } from "./supabase.js";
import { importarCardapio, resumoImportacao } from "./core.js";
import { vigiar } from "./watcher.js";

async function main() {
  const config = carregarConfig();
  const { supabase, usuario } = await conectar(config);
  console.log(`Conectado como ${usuario?.email}.`);

  const [modo, alvo] = process.argv.slice(2);

  if (modo === "--once") {
    if (!alvo) throw new Error("Uso: node src/index.js --once <arquivo.csv|.xlsx>");
    const r = await importarCardapio(alvo, supabase);
    console.log(resumoImportacao(r));
    for (const e of r.erros ?? []) console.log(`   - linha ${e.linha}: ${e.mensagem}`);
    await supabase.auth.signOut();
    return;
  }

  // Modo padrao: vigiar a pasta continuamente (o processo fica vivo).
  const observador = await vigiar(config.pastaEntrada, supabase);

  const encerrar = async () => {
    await observador.close();
    await supabase.auth.signOut();
    process.exit(0);
  };
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
}

main().catch((err) => {
  console.error(`Falha: ${err.message}`);
  process.exitCode = 1;
});
