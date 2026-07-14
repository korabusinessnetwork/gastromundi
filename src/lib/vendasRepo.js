import { supabase } from "./supabase";
import { montarVendaLegada } from "./vendas";

/**
 * Leitura de uma venda COMPLETA (cabeçalho + itens + pagamentos) das tabelas
 * relacionais (TD009: vendas / venda_itens / venda_pagamentos).
 *
 * Motivo (Leva 12): a reimpressão do cupom precisa dos itens/pagamentos para
 * remontar a DANFE, mas o histórico de NFC-e lista só as notas (nfce_emitidas),
 * sem os itens da venda. Em vez de carregar a venda de CADA linha ao abrir a
 * tela (N+1), carregamos UMA venda SOB DEMANDA — só quando o operador clica em
 * "Reimprimir". Reusa `montarVendaLegada` (mesmo shape que <ModalCupomNfce>
 * já consome), sem duplicar mapeamento.
 *
 * A RLS já isola por tenant (multitenant fase 2) — não se filtra tenant aqui.
 * Nunca lança: erro/ausência vira `{ data: null, error }`.
 *
 * @param {string} vendaId  id da venda (text, mesmo id de sales)
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function buscarVendaCompleta(vendaId) {
  if (!vendaId) return { data: null, error: null };
  try {
    const [cab, itens, pagamentos] = await Promise.all([
      supabase
        .from("vendas")
        .select("id, comanda, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste, total, cashier, at")
        .eq("id", vendaId)
        .maybeSingle(),
      supabase
        .from("venda_itens")
        .select("venda_id, product_id, nome, preco, qtd, cancelado, motivo_cancelamento, cancelado_por")
        .eq("venda_id", vendaId),
      supabase
        .from("venda_pagamentos")
        .select("venda_id, metodo, valor")
        .eq("venda_id", vendaId),
    ]);

    const error = cab.error || itens.error || pagamentos.error || null;
    if (error) return { data: null, error };
    if (!cab.data) return { data: null, error: null };

    const venda = montarVendaLegada({
      venda: cab.data,
      itens: itens.data ?? [],
      pagamentos: pagamentos.data ?? [],
    });
    return { data: venda, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
