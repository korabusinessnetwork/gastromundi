// ──────────────────────────────────────────────────────────────────
// Nucleo do bot: arquivo de planilha -> validacao -> plano -> aplicacao.
//
// REUSO, sem copia: a validacao linha a linha, o dedupe, os limites, a
// protecao contra CSV injection e a idempotencia sao EXATAMENTE os mesmos
// do app web — importados de src/lib/importacao. O bot so troca o
// "transporte" (le do disco, grava com o SEU client autenticado). Assim
// bot e app nunca divergem de regra.
//
// O apply e reimplementado aqui (nao importado de produtos.js) de proposito:
// produtos.js usa o client do app (import.meta.env / Vite), que nao existe no
// Node. Mesma logica, client do bot. Idempotente: rodar o mesmo arquivo 2x
// nao duplica (UPDATE por id quando o nome ja existe no tenant).
// ──────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodificarArquivo, validarPlanilhaProdutos } from "../../../src/lib/importacao/planilha.js";
import { TAMANHO_LOTE, planejarImportacaoProdutos, paraPayloadProduto } from "../../../src/lib/importacao/plano.js";

const EXT_CSV = [".csv", ".txt"];
const EXT_XLSX = [".xlsx", ".xls"];

/**
 * Detecta o formato pela extensao. null = nao suportado (o watcher ignora).
 * @param {string} nome
 * @returns {"csv"|"xlsx"|null}
 */
export function formatoDoArquivo(nome) {
  const ext = path.extname(nome).toLowerCase();
  if (EXT_CSV.includes(ext)) return "csv";
  if (EXT_XLSX.includes(ext)) return "xlsx";
  return null;
}

/**
 * Le o arquivo e devolve o TEXTO CSV que o validador entende. XLSX e
 * convertido reusando a mesma conversao do app (import dinamico: so puxa a
 * lib `xlsx` quando realmente ha um xlsx, mantendo os helpers puros leves).
 * @param {string} caminho
 * @returns {Promise<string>}
 */
export async function lerComoCSV(caminho) {
  const buffer = await readFile(caminho);
  if (formatoDoArquivo(caminho) === "xlsx") {
    const { xlsxParaCSV } = await import("../../../src/lib/importacao/xlsxEntrada.js");
    return xlsxParaCSV(buffer);
  }
  return decodificarArquivo(buffer);
}

/**
 * Frase legivel do resultado, pro log. Pura (testavel sem I/O).
 * @param {{criados:number, atualizados:number, iguais:number, ignorados:number}} r
 * @returns {string}
 */
export function resumoImportacao(r) {
  const partes = [];
  if (r.criados) partes.push(`${r.criados} novo(s)`);
  if (r.atualizados) partes.push(`${r.atualizados} atualizado(s)`);
  if (r.iguais) partes.push(`${r.iguais} sem mudanca`);
  if (r.ignorados) partes.push(`${r.ignorados} linha(s) com erro ignorada(s)`);
  return partes.length ? partes.join(", ") : "nada a fazer";
}

// Le os produtos do tenant pro plano — campos nomeados (regra do repo:
// nunca select * em tabela sensivel). A RLS ja restringe ao tenant do JWT.
async function buscarProdutosExistentes(supabase) {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, category, emoji, active, unidade_estoque");
  if (error) throw new Error(`Falha ao ler produtos do tenant: ${error.message}`);
  return data ?? [];
}

// Aplica o plano em lotes. Para no primeiro erro (nada de meio-importado
// silencioso) — como e idempotente, reprocessar o arquivo retoma com seguranca.
async function aplicarPlano(plano, supabase) {
  let criados = 0;
  let atualizados = 0;

  for (let i = 0; i < plano.criar.length; i += TAMANHO_LOTE) {
    const lote = plano.criar.slice(i, i + TAMANHO_LOTE).map(paraPayloadProduto);
    const { error } = await supabase.from("products").insert(lote);
    if (error) throw new Error(`Falha ao inserir produtos: ${error.message}`);
    criados += lote.length;
  }

  for (const { id, changes } of plano.atualizar) {
    const { error } = await supabase.from("products").update(changes).eq("id", id);
    if (error) throw new Error(`Falha ao atualizar produto ${id}: ${error.message}`);
    atualizados += 1;
  }

  return { criados, atualizados };
}

/**
 * Orquestra a importacao de um arquivo de cardapio (produtos). So aplica as
 * linhas VALIDAS — linhas com erro sao reportadas (nao bloqueiam as boas),
 * igual ao wizard do app.
 * @param {string} caminho
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<{criados:number, atualizados:number, iguais:number, ignorados:number, erros:Array}>}
 */
export async function importarCardapio(caminho, supabase) {
  if (!formatoDoArquivo(caminho)) {
    throw new Error("Formato nao suportado (use .csv ou .xlsx).");
  }

  const csv = await lerComoCSV(caminho);
  const { produtos, erros } = validarPlanilhaProdutos(csv);

  if (produtos.length === 0) {
    return { criados: 0, atualizados: 0, iguais: 0, ignorados: erros.length, erros };
  }

  const existentes = await buscarProdutosExistentes(supabase);
  const plano = planejarImportacaoProdutos(produtos, existentes);
  const { criados, atualizados } = await aplicarPlano(plano, supabase);

  return {
    criados,
    atualizados,
    iguais: plano.iguais.length,
    ignorados: erros.length,
    erros,
  };
}
