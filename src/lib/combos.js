/**
 * Combos — decomposição para baixa de estoque (B4).
 *
 * Um item de combo no carrinho carrega `combo.subprodutos` (a receita
 * do combo). Na finalização, o produto principal baixa pelo fluxo
 * normal (o item usa `id = item_principal_id`); os subprodutos que
 * controlam estoque baixam via RPC própria (baixar_estoque_subproduto).
 * Estas funções são puras — quem chama o Supabase é o AppContext.
 */

/**
 * Agrega as baixas de estoque de subprodutos de uma lista de itens
 * vendidos. Só entram subprodutos com `controla_estoque`; itens
 * cancelados ficam de fora; quantidades somam por subproduto
 * (quantidade na receita × qty do item no carrinho).
 *
 * @param {Array<object>} itens - itens do carrinho/comanda ({qty, cancelado, combo:{subprodutos:[{id, nome, quantidade, controla_estoque}]}})
 * @returns {Array<{subprodutoId: string, nome: string, qtd: number}>}
 */
export function calcularBaixasSubprodutos(itens) {
  const porSubproduto = new Map();

  for (const item of itens ?? []) {
    if (!item || item.cancelado) continue;
    const subs = item.combo?.subprodutos;
    if (!Array.isArray(subs) || subs.length === 0) continue;

    const qtyItem = Number(item.qty ?? 1) || 0;
    if (qtyItem <= 0) continue;

    for (const sub of subs) {
      if (!sub || !sub.id || !sub.controla_estoque) continue;
      const qtdReceita = Number(sub.quantidade ?? 1) || 0;
      if (qtdReceita <= 0) continue;

      const qtd = qtdReceita * qtyItem;
      const atual = porSubproduto.get(sub.id);
      if (atual) atual.qtd += qtd;
      else porSubproduto.set(sub.id, { subprodutoId: sub.id, nome: sub.nome ?? "", qtd });
    }
  }

  return [...porSubproduto.values()];
}

/**
 * Monta o item de carrinho de um combo carregado do banco (shape da
 * query do PDV: combos + combo_subprodutos + subprodutos aninhados).
 * O item usa `id = item_principal_id` de propósito: assim a baixa do
 * produto principal, o dual-write relacional (product_id) e a
 * transferência entre comandas continuam funcionando sem mudança.
 *
 * @param {object} combo - linha de `combos` com `combo_subprodutos(quantidade, subprodutos(id, nome, controla_estoque))`
 * @returns {object|null} item pronto para o carrinho (sem qty/_key) ou null se inválido
 */
export function montarItemCombo(combo) {
  if (!combo || combo.item_principal_id == null) return null;

  const subprodutos = (combo.combo_subprodutos ?? [])
    .filter((cs) => cs?.subprodutos?.id)
    .map((cs) => ({
      id: cs.subprodutos.id,
      nome: cs.subprodutos.nome ?? "",
      quantidade: Number(cs.quantidade ?? 1) || 1,
      controla_estoque: !!cs.subprodutos.controla_estoque,
    }));

  return {
    id: combo.item_principal_id,
    name: combo.nome ?? "Combo",
    price: Number(combo.preco_total ?? 0) || 0,
    combo: { comboId: combo.id, subprodutos },
  };
}

/**
 * Compara a identidade de dois itens de carrinho considerando o combo:
 * um combo nunca se mistura com o produto principal avulso (mesmo id)
 * nem com outro combo. Usado no dedupe de adicionar ao carrinho e na
 * transferência entre comandas.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function mesmoItemDeVenda(a, b) {
  if (!a || !b) return false;
  return a.id === b.id && (a.combo?.comboId ?? null) === (b.combo?.comboId ?? null);
}
