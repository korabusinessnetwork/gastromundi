// Vendas fechadas (ADR-015, tarefas 1.5 e 2.7 do plano de refatoração).
// Devolvem o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";
import { persistirVendaNormalizada } from "@/lib/vendas";

/** Cabeçalho das vendas desde `desdeIso`, mais recentes primeiro. */
export function listarVendasDesde(colunas, desdeIso) {
  return supabase.from("vendas").select(colunas).gte("at", desdeIso).order("at", { ascending: false });
}

export function listarItensDasVendas(vendaIds) {
  return supabase
    .from("venda_itens")
    .select("venda_id,product_id,nome,preco,qtd,cancelado,motivo_cancelamento,cancelado_por")
    .in("venda_id", vendaIds);
}

export function listarPagamentosDasVendas(vendaIds) {
  return supabase.from("venda_pagamentos").select("venda_id,metodo,valor").in("venda_id", vendaIds);
}

/** Leitura de resiliência na tabela antiga `sales`, que não recebe mais escrita. */
export function listarVendasLegadasDesde(desdeIso) {
  return supabase.from("sales").select("id,data,at").gte("at", desdeIso).order("at", { ascending: false });
}

/** Grava venda, itens e pagamentos nas tabelas normalizadas (ver `src/lib/vendas.js`). */
export function gravarVendaNormalizada(venda, opcoes) {
  return persistirVendaNormalizada(supabase, venda, opcoes);
}

/** Devolve as linhas marcadas: zero linhas é a RLS recusando em silêncio. */
export function marcarVendaCancelada(vendaId, { motivo, canceladaPor, canceladaEm }) {
  return supabase
    .from("vendas")
    .update({ cancelada: true, motivo_cancelamento: motivo, cancelada_por: canceladaPor, cancelada_em: canceladaEm })
    .eq("id", vendaId)
    .select("id");
}

/**
 * Tempo real das vendas entre caixas (tabela `sales`, como sempre foi).
 * Devolve a função que cancela a assinatura.
 */
export function assinarVendas(aoMudar) {
  const canal = supabase
    .channel("sales-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, aoMudar)
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}
