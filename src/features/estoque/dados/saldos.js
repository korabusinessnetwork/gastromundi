// Saldo de estoque por produto e por subproduto (ADR-015, tarefas 1.5 e 2.5
// do plano de refatoração). Devolvem o `{ data, error }` do Supabase sem
// interpretar. Baixa e entrada passam sempre pelas RPCs atômicas e
// idempotentes (`opId`), nunca por conta feita no navegador.

import { supabase } from "@/lib/supabase";

export function listarSaldos() {
  return supabase.from("estoque").select("produto_id,quantidade,minimo");
}

/** Cria a linha de saldo do produto, se ainda não existir. Não mexe em linha existente. */
export function garantirLinhaDeSaldo(produtoId) {
  return supabase.from("estoque").upsert({ produto_id: produtoId }, { onConflict: "produto_id", ignoreDuplicates: true });
}

/** Ajuste manual do saldo (contagem). Venda e recebimento usam as RPCs abaixo. */
export function gravarSaldo(produtoId, quantidade) {
  return supabase.from("estoque").upsert(
    { produto_id: produtoId, quantidade, updated_at: new Date().toISOString() },
    { onConflict: "produto_id" },
  );
}

export function gravarMinimo(produtoId, minimo) {
  return supabase.from("estoque").upsert(
    { produto_id: produtoId, minimo, updated_at: new Date().toISOString() },
    { onConflict: "produto_id" },
  );
}

export function baixarEstoqueNoBanco(produtoId, qtd, opId) {
  return supabase.rpc("baixar_estoque", { p_produto_id: produtoId, p_qtd: qtd, p_op_id: opId });
}

export function entradaEstoqueNoBanco(produtoId, delta, opId) {
  return supabase.rpc("entrada_estoque", { p_produto_id: produtoId, p_delta: delta, p_op_id: opId });
}

export function baixarEstoqueSubprodutoNoBanco(subprodutoId, qtd, opId) {
  return supabase.rpc("baixar_estoque_subproduto", { p_subproduto_id: subprodutoId, p_qtd: qtd, p_op_id: opId });
}

/**
 * Tempo real do saldo entre aparelhos. `aoMudar` recebe o payload do
 * postgres_changes. Devolve a função que cancela a assinatura.
 * Requer Realtime habilitado na tabela `estoque` (Database, Replication).
 */
export function assinarSaldos(aoMudar) {
  const canal = supabase
    .channel("estoque-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "estoque" }, aoMudar)
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}
