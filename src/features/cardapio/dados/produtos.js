// Produtos do cardápio (ADR-015, tarefas 1.5 e 2.5 do plano de refatoração).
// Devolvem o `{ data, error }` do Supabase sem interpretar. Update e delete
// devolvem as linhas afetadas: zero linhas é a RLS recusando em silêncio.

import { supabase } from "@/lib/supabase";

/**
 * Todos os produtos, desabilitados inclusive: o desabilitado precisa continuar
 * chegando ao cadastro, senão some dele e não há como reativá-lo. Quem decide
 * o que não oferecer para venda são as telas de venda, filtrando
 * `active !== false`.
 */
export function listarProdutos() {
  return supabase.from("products").select("*").order("id");
}

export function criarProduto(campos) {
  return supabase.from("products").insert(campos).select().single();
}

export function atualizarProduto(id, campos) {
  return supabase.from("products").update(campos).eq("id", id).select("id");
}

export function excluirProduto(id) {
  return supabase.from("products").delete().eq("id", id).select("id");
}
