// Fechamentos, sangrias e suprimentos do caixa (ADR-015, tarefas 1.5 e 2.7).
// Devolvem o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

export function listarFechamentos() {
  return supabase.from("fechamentos").select("id,data,created_at").order("created_at", { ascending: false });
}

export function gravarFechamento(fechamento) {
  return supabase.from("fechamentos").insert({ data: fechamento });
}

/** Só a janela recente: a conta do caixa é sempre da sessão aberta. */
export function listarMovimentosRecentes(limite = 200) {
  // Colunas por extenso, nunca `*`: tabela de caixa é sensível, e o guard
  // caixaMovimentosSqlGuard.test.js confere este trecho.
  return supabase.from("caixa_movimentos").select("id,tipo,valor,motivo,autor,autorizado_por,created_at").order("created_at", { ascending: false }).limit(limite);
}

export function registrarMovimento(linha) {
  return supabase.from("caixa_movimentos").insert(linha).select("id,tipo,valor,motivo,autor,autorizado_por,created_at").single();
}

/**
 * Lançamentos financeiros gerados por uma venda cancelada viram cancelados em
 * vez de sumir (migration 20261009): um fiado desfeito continua aparecendo no
 * Financeiro como desfeito, sem buraco sem nome no histórico do cliente.
 */
export function cancelarLancamentosDaVenda(vendaId, { canceladoPor, canceladoEm, motivo }) {
  return supabase
    .from("lancamentos")
    .update({
      status: "cancelado",
      cancelado_por: canceladoPor,
      cancelado_em: canceladoEm,
      motivo_cancelamento: motivo,
    })
    .eq("venda_id", vendaId);
}
