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

/**
 * Grava o subproduto e, se ele controla estoque, o saldo, numa transação só:
 * ou tudo, ou nada (tarefa 1.6 do plano). Antes eram duas chamadas, e uma
 * falha na segunda deixava o subproduto criado: o "tentar de novo" duplicava.
 *
 * @returns {Promise<string>} id do subproduto
 */
export async function salvarSubproduto({ id, nome, categoria, preco, unidadeMedida, controlaEstoque, ativo, quantidade, minimo }) {
  const { data, error } = await supabase.rpc("salvar_subproduto", {
    p_id: id ?? null,
    p_nome: nome,
    p_categoria: categoria,
    p_preco: preco,
    p_unidade_medida: unidadeMedida,
    p_controla_estoque: controlaEstoque,
    p_ativo: ativo,
    p_quantidade: controlaEstoque ? quantidade : null,
    p_minimo: controlaEstoque ? minimo : null,
  });
  if (error) throw new Error(mensagemDeRecusaSubproduto(error));
  return data;
}

/** A recusa da RLS chega em inglês técnico; as da própria função já vêm escritas. */
export function mensagemDeRecusaSubproduto(error) {
  if (error?.code === "42501") return "Seu usuário não pode alterar subprodutos. Peça a um gerente ou ao administrador.";
  return error?.message || "Não deu para salvar o subproduto. Nada foi gravado, tente de novo.";
}

export function alterarSituacaoSubproduto(id, ativo) {
  return supabase.from("subprodutos").update({ ativo, updated_at: new Date().toISOString() }).eq("id", id);
}

/** O saldo some em cascata (FK ON DELETE CASCADE). */
export function excluirSubproduto(id) {
  return supabase.from("subprodutos").delete().eq("id", id);
}
