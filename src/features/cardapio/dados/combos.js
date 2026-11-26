// Camada de dados dos combos (ADR-015, tarefa 1.1 do plano de refatoração).
// Única porta da tela de combos para gravar no banco.

import { supabase } from "@/lib/supabase";

/**
 * Lê o preço customizado digitado na tela ("8,50", "8.5") como número, ou
 * `null` quando o item usa o preço de catálogo. Zero e texto inválido também
 * viram `null`, como a tela sempre gravou: preço customizado zerado volta a
 * valer o preço de catálogo.
 */
export function precoCustomizado(item) {
  if (!item.usarCustom) return null;
  return parseFloat(String(item.precoCustom).replace(",", ".")) || null;
}

/**
 * Monta os argumentos da RPC `salvar_combo` a partir do estado do modal.
 * Função pura: é o contrato entre a tela e a migration 20261123.
 */
export function argumentosSalvarCombo({ comboId, nome, principal, modo, precoTotal, itens, itensProd }) {
  return {
    p_combo_id: comboId ?? null,
    p_nome: nome.trim(),
    p_item_principal_id: Number(principal.id),
    p_modo: modo,
    p_preco_total: precoTotal,
    p_subprodutos: itens.map((it) => ({
      subproduto_id: it.subproduto.id,
      quantidade: it.quantidade,
      preco_customizado: precoCustomizado(it),
    })),
    p_produtos: itensProd.map((it) => ({
      produto_id: Number(it.produto.id),
      quantidade: it.quantidade,
      preco_customizado: precoCustomizado(it),
    })),
  };
}

/**
 * Grava o combo e a composição numa transação só: ou tudo, ou nada.
 * Lança erro com a mensagem do banco quando a gravação é recusada.
 *
 * @returns {Promise<string>} id do combo gravado
 */
export async function salvarCombo(dadosDoModal) {
  const { data, error } = await supabase.rpc("salvar_combo", argumentosSalvarCombo(dadosDoModal));
  if (error) throw new Error(mensagemDeRecusa(error));
  return data;
}

/**
 * Frase para a tela. As recusas da própria função (P0001, P0002) já chegam
 * escritas para o operador. A da RLS (42501) chega em inglês técnico e vira
 * uma frase que diz o que fazer.
 */
export function mensagemDeRecusa(error) {
  if (error?.code === "42501") return "Seu usuário não pode alterar combos. Peça a um gerente ou ao administrador.";
  return error?.message || "Não deu para salvar o combo. Tente de novo.";
}

// ── Leituras e escritas simples da tela de combos (tarefa 1.4) ─────────
// Devolvem o `{ data, error }` do Supabase sem interpretar: a frase de erro
// continua sendo decisão da tela.

/** Combos com a composição resumida, mais recentes primeiro. */
export function listarCombos() {
  return supabase
    .from("combos")
    .select("*, combo_subprodutos(quantidade, subprodutos(nome, preco)), combo_produtos(quantidade, products(name))")
    .order("created_at", { ascending: false });
}

/** Subprodutos que estão à venda, para montar a composição. */
export function listarSubprodutosAtivos() {
  return supabase.from("subprodutos").select("*").eq("ativo", true).order("nome");
}

export function carregarSubprodutosDoCombo(comboId) {
  return supabase.from("combo_subprodutos").select("*, subprodutos(*)").eq("combo_id", comboId);
}

export function carregarProdutosDoCombo(comboId) {
  return supabase.from("combo_produtos").select("*, products(id, name, price, category)").eq("combo_id", comboId);
}

export function alterarSituacaoCombo(comboId, ativo) {
  return supabase.from("combos").update({ ativo, updated_at: new Date().toISOString() }).eq("id", comboId);
}

/** A composição some em cascata (FK ON DELETE CASCADE); o catálogo não é tocado. */
export function excluirCombo(comboId) {
  return supabase.from("combos").delete().eq("id", comboId);
}

/** Combos à venda, com o que o PDV precisa para montar o item e baixar estoque. */
export function listarCombosParaVenda() {
  return supabase
    .from("combos")
    .select("id, nome, item_principal_id, modo, preco_total, combo_subprodutos(quantidade, subprodutos(id, nome, controla_estoque)), combo_produtos(quantidade, products(id, name))")
    .eq("ativo", true);
}
