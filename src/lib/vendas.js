import { normalizarPagamentos } from "@/utils/pagamentos";

/**
 * TD009 (etapa 1) — mapeia uma venda no formato antigo (blob de
 * sales.data) para as linhas das tabelas relacionais novas
 * (vendas, venda_itens, venda_pagamentos). Função pura — não faz
 * I/O; quem chama decide como/quando persistir.
 *
 * Não ignora nenhum item: itens cancelados também viram linha em
 * venda_itens (com cancelado=true), para manter o histórico completo.
 *
 * @param {object} sale - mesmo shape gravado em sales.data (ver PDVView.handleConfirmPayment)
 * @returns {{ venda: object, itens: object[], pagamentos: object[] }}
 */
export function mapearVendaParaLinhas(sale) {
  const venda = {
    id: sale.id,
    comanda: sale.comanda ?? null,
    mesa: sale.mesa ?? null,
    subtotal: sale.subtotal ?? null,
    taxa_servico: !!sale.taxaServico,
    valor_taxa: sale.valorTaxa ?? 0,
    valor_ajuste: sale.valorAjuste ?? 0,
    total: sale.total ?? 0,
    cashier: sale.cashier ?? null,
    cliente_id: sale.clienteId ?? null, // F010 — vínculo opcional ao cliente
    ...(sale.at ? { at: sale.at } : {}),
  };

  const itens = (Array.isArray(sale.items) ? sale.items : []).map((item) => ({
    venda_id: sale.id,
    product_id: item.id ?? null,
    nome: item.name ?? "",
    preco: Number(item.price) || 0,
    qtd: item.qty ?? 1,
    cancelado: !!item.cancelado,
    motivo_cancelamento: item.motivoCancelamento ?? null,
    cancelado_por: item.canceladoPor ?? null,
  }));

  const pagamentos = normalizarPagamentos(sale)
    .filter((p) => p?.metodo != null)
    .map((p) => ({
      venda_id: sale.id,
      metodo: p.metodo,
      valor: Number(p.valor) || 0,
    }));

  return { venda, itens, pagamentos };
}

/**
 * TD009 (etapa 2) — inversa de mapearVendaParaLinhas: remonta o shape
 * legado (camelCase, mesmo formato de sales.data) a partir das linhas
 * das tabelas relacionais. Função pura — não faz I/O.
 *
 * Só reconstrói os campos que sobrevivem no schema novo: `ajuste`
 * (o descritor bruto de desconto/acréscimo usado só durante o
 * checkout) e `recebido`/`troco` por pagamento não são persistidos
 * nas tabelas novas — nenhum consumidor de `sales` os lê depois de
 * finalizada a venda (confirmado por grep antes de escrever isto).
 *
 * @param {{ venda: object, itens: object[], pagamentos: object[] }} linhas
 * @returns {object} venda no shape legado de sales.data
 */
export function montarVendaLegada({ venda, itens, pagamentos }) {
  return {
    id: venda.id,
    comanda: venda.comanda ?? null,
    mesa: venda.mesa ?? null,
    subtotal: venda.subtotal ?? null,
    taxaServico: !!venda.taxa_servico,
    valorTaxa: venda.valor_taxa ?? 0,
    valorAjuste: venda.valor_ajuste ?? 0,
    total: venda.total ?? 0,
    cashier: venda.cashier ?? null,
    clienteId: venda.cliente_id ?? null,
    at: venda.at,
    items: (itens ?? []).map((item) => ({
      id: item.product_id ?? null,
      name: item.nome,
      price: item.preco,
      qty: item.qtd,
      cancelado: !!item.cancelado,
      motivoCancelamento: item.motivo_cancelamento ?? null,
      canceladoPor: item.cancelado_por ?? null,
    })),
    pagamentos: (pagamentos ?? []).map((p) => ({
      metodo: p.metodo,
      valor: p.valor,
    })),
  };
}
