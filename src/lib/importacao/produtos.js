// ──────────────────────────────────────────────────────────────────
// Migração de dados — PRODUTOS: aplicação do plano no Supabase
// (client autenticado do app — a RLS isola o tenant e o tenant_id
// nasce do DEFAULT tenant_atual_id(); NUNCA vem do arquivo).
//
// O planejamento (puro) vive em plano.js — compartilhado com a Edge
// Function importar-dados. Rodar o mesmo arquivo duas vezes não
// duplica nada (UPDATE por id quando o nome já existe no tenant).
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { TAMANHO_LOTE, planejarImportacaoProdutos, paraPayloadProduto } from "./plano";

export { TAMANHO_LOTE, planejarImportacaoProdutos, paraPayloadProduto };

/**
 * Aplica o plano no banco, em lotes, reportando progresso. Para no
 * primeiro erro do Supabase (nada de meio-importado silencioso).
 * @param {ReturnType<typeof planejarImportacaoProdutos>} plano
 * @param {(feitos:number, total:number) => void} [onProgresso]
 * @returns {Promise<{criados:number, atualizados:number, error:object|null}>}
 */
export async function aplicarImportacaoProdutos(plano, onProgresso) {
  const total = plano.criar.length + plano.atualizar.length;
  let feitos = 0;
  let criados = 0;
  let atualizados = 0;

  for (let i = 0; i < plano.criar.length; i += TAMANHO_LOTE) {
    const lote = plano.criar.slice(i, i + TAMANHO_LOTE).map(paraPayloadProduto);
    const { error } = await supabase.from("products").insert(lote);
    if (error) return { criados, atualizados, error };
    criados += lote.length;
    feitos += lote.length;
    onProgresso?.(feitos, total);
  }

  // UPDATE é por id (sem unique em name não há upsert confiável)
  for (const { id, changes } of plano.atualizar) {
    const { error } = await supabase.from("products").update(changes).eq("id", id);
    if (error) return { criados, atualizados, error };
    atualizados += 1;
    feitos += 1;
    if (feitos % 20 === 0 || feitos === total) onProgresso?.(feitos, total);
  }

  return { criados, atualizados, error: null };
}

/**
 * Busca os produtos do tenant pro plano/preview e pro export — campos
 * nomeados (regra do repo: nunca select * fora do bootstrap).
 */
export async function buscarProdutosParaMigracao() {
  return supabase
    .from("products")
    .select("id, name, price, category, emoji, active, unidade_estoque")
    .order("category")
    .order("name");
}
