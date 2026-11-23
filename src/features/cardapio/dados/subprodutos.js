// Camada de dados dos subprodutos (ADR-015, tarefa 1.4 do plano de
// refatoração). Devolve o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

/** Subprodutos com o saldo de estoque, em ordem alfabética. */
export function listarSubprodutos() {
  return supabase.from("subprodutos").select("*, estoque_subprodutos(quantidade, minimo)").order("nome");
}

/** Uma linha por uso de subproduto em combo, para travar a exclusão. */
export function listarUsosEmCombos() {
  return supabase.from("combo_subprodutos").select("subproduto_id");
}

export function atualizarSubproduto(id, campos) {
  return supabase.from("subprodutos").update(campos).eq("id", id);
}

export function criarSubproduto(campos) {
  return supabase.from("subprodutos").insert(campos).select("id").single();
}

/**
 * Saldo do subproduto. Gravado DEPOIS do subproduto, numa chamada separada:
 * as duas ainda não são atômicas (tarefa 1.6 do plano).
 */
export function gravarSaldoSubproduto(subprodutoId, { quantidade, minimo }) {
  return supabase
    .from("estoque_subprodutos")
    .upsert(
      { subproduto_id: subprodutoId, quantidade, minimo, updated_at: new Date().toISOString() },
      { onConflict: "subproduto_id" },
    );
}

export function alterarSituacaoSubproduto(id, ativo) {
  return supabase.from("subprodutos").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
}

/** O saldo some em cascata (FK ON DELETE CASCADE). */
export function excluirSubproduto(id) {
  return supabase.from("subprodutos").delete().eq("id", id);
}
