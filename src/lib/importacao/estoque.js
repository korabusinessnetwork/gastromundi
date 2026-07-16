// ──────────────────────────────────────────────────────────────────
// Migração de dados — ESTOQUE INICIAL (Fase 2): aplicação do plano no
// Supabase (client autenticado do app — RLS).
//
// O planejamento (puro) vive em plano.js — compartilhado com a Edge
// Function importar-dados. Upsert por produto_id (PK da tabela):
// rodar o mesmo arquivo duas vezes não duplica nem soma nada.
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { TAMANHO_LOTE, MINIMO_PADRAO, planejarImportacaoEstoque, paraLinhasExportEstoque } from "./plano";

export { MINIMO_PADRAO, planejarImportacaoEstoque, paraLinhasExportEstoque };

/**
 * Aplica o plano no banco em lotes (upsert por produto_id), reportando
 * progresso. Para no primeiro erro do Supabase.
 * @param {ReturnType<typeof planejarImportacaoEstoque>} plano
 * @param {(feitos:number, total:number) => void} [onProgresso]
 * @returns {Promise<{definidos:number, error:object|null}>}
 */
export async function aplicarImportacaoEstoque(plano, onProgresso) {
  const total = plano.definir.length;
  let definidos = 0;

  for (let i = 0; i < plano.definir.length; i += TAMANHO_LOTE) {
    const lote = plano.definir.slice(i, i + TAMANHO_LOTE).map(({ produto_id, quantidade, minimo }) => ({
      produto_id,
      quantidade,
      minimo,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("estoque").upsert(lote, { onConflict: "produto_id" });
    if (error) return { definidos, error };
    definidos += lote.length;
    onProgresso?.(definidos, total);
  }

  return { definidos, error: null };
}

/**
 * Busca o estoque do tenant com o nome do produto (pro export e pro
 * plano) — campos nomeados, join pela FK produto_id → products.
 */
export async function buscarEstoqueParaMigracao() {
  return supabase
    .from("estoque")
    .select("produto_id, quantidade, minimo, products(name)")
    .order("produto_id");
}
