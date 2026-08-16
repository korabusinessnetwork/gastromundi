/**
 * Combos flexíveis e produtos com seleção — grupos de escolha.
 *
 * Duas telas usam a MESMA abstração de "grupo de escolha":
 *
 *  • COMBO FLEXÍVEL — nome + preço + grupos (ex.: "Hambúrguer + Refri",
 *    onde o cliente escolhe qualquer hambúrguer e qualquer refri). Não
 *    tem produto principal: o item de carrinho nasce com `id = null` e
 *    preço fixo (`preco_total`); as escolhas só baixam estoque.
 *
 *  • PRODUTO COM SELEÇÃO — um "Refrigerante" que na venda pede qual
 *    (Coca, Fanta). O item de carrinho usa `id = produto.id` (o produto
 *    "casca"); estoque e eventual acréscimo de preço vêm das escolhas.
 *
 * Nos dois casos o item carrega `combo.escolhas` — a lista de produtos
 * REAIS escolhidos ({ produtoId, nome, qtd, preco }). Cada escolha baixa
 * o próprio estoque na finalização (calcularBaixasEscolhas). Estas
 * funções são puras — quem chama o Supabase é o AppContext.
 */

/**
 * Normaliza a lista de escolhas para o shape canônico do carrinho.
 * Descarta entradas sem produtoId. `preco` é o acréscimo daquela escolha
 * ao preço da linha (0 quando a escolha não altera o preço).
 *
 * @param {Array<object>} escolhas
 * @returns {Array<{produtoId: (number|string), nome: string, qtd: number, preco: number}>}
 */
function normalizarEscolhas(escolhas) {
  return (Array.isArray(escolhas) ? escolhas : [])
    .filter((e) => e && e.produtoId != null)
    .map((e) => ({
      produtoId: e.produtoId,
      nome: e.nome ?? "",
      qtd: Number(e.qtd ?? 1) || 1,
      preco: Number(e.preco ?? 0) || 0,
    }));
}

/**
 * Soma o acréscimo de preço das escolhas (preço × quantidade da escolha).
 * @param {Array<{qtd: number, preco: number}>} escolhas
 * @returns {number}
 */
function somaAcrescimos(escolhas) {
  return (escolhas ?? []).reduce(
    (s, e) => s + (Number(e?.preco ?? 0) || 0) * (Number(e?.qtd ?? 1) || 1),
    0,
  );
}

/**
 * Monta o item de carrinho de um COMBO flexível com as escolhas feitas.
 * `id = null` de propósito: o combo não é um produto de catálogo, então
 * não baixa estoque por si — quem baixa são as escolhas. O preço é o
 * `preco_total` do combo mais eventuais acréscimos das escolhas.
 *
 * @param {object} combo - linha de `combos` ({ id, nome, preco_total })
 * @param {Array<object>} escolhas - produtos escolhidos nos grupos
 * @returns {object|null} item pronto para o carrinho (sem qty/_key) ou null
 */
export function montarItemCombo(combo, escolhas = []) {
  if (!combo) return null;
  const escs = normalizarEscolhas(escolhas);
  return {
    id: null,
    name: combo.nome ?? "Combo",
    price: (Number(combo.preco_total ?? 0) || 0) + somaAcrescimos(escs),
    combo: { comboId: combo.id, escolhas: escs },
  };
}

/**
 * Monta o item de carrinho de um PRODUTO COM SELEÇÃO com as escolhas
 * feitas. `id = produto.id` (a "casca"): se a casca tiver estoque
 * próprio ela baixa pelo fluxo normal; as escolhas baixam seu próprio
 * estoque. O preço é o do produto mais os acréscimos das escolhas.
 *
 * @param {object} produto - produto de catálogo ({ id, name, price, ... })
 * @param {Array<object>} escolhas - produtos escolhidos nos grupos
 * @returns {object|null} item pronto para o carrinho (sem qty/_key) ou null
 */
export function montarItemProdutoEscolhas(produto, escolhas = []) {
  if (!produto || produto.id == null) return null;
  const escs = normalizarEscolhas(escolhas);
  return {
    id: produto.id,
    name: produto.name ?? produto.nome ?? "Produto",
    price: (Number(produto.price ?? 0) || 0) + somaAcrescimos(escs),
    emoji: produto.emoji,
    category: produto.category,
    combo: { escolhas: escs },
  };
}

/**
 * Agrega as baixas de estoque das escolhas de uma lista de itens
 * vendidos. Cada escolha é um produto REAL do catálogo e baixa seu
 * próprio estoque (quem decide se de fato controla estoque é a
 * finalização, com a guarda `prodId in estoque` e a conversão de
 * unidade). Itens cancelados ficam de fora; quantidades somam por
 * produto (quantidade da escolha × qty do item no carrinho).
 *
 * @param {Array<object>} itens - itens do carrinho/comanda ({qty, cancelado, combo:{escolhas:[{produtoId, nome, qtd}]}})
 * @returns {Array<{produtoId: (number|string), nome: string, qtd: number}>}
 */
export function calcularBaixasEscolhas(itens) {
  const porProduto = new Map();

  for (const item of itens ?? []) {
    if (!item || item.cancelado) continue;
    const escolhas = item.combo?.escolhas;
    if (!Array.isArray(escolhas) || escolhas.length === 0) continue;

    const qtyItem = Number(item.qty ?? 1) || 0;
    if (qtyItem <= 0) continue;

    for (const esc of escolhas) {
      if (!esc || esc.produtoId == null) continue;
      const qtdEsc = Number(esc.qtd ?? 1) || 0;
      if (qtdEsc <= 0) continue;

      const qtd = qtdEsc * qtyItem;
      const atual = porProduto.get(esc.produtoId);
      if (atual) atual.qtd += qtd;
      else porProduto.set(esc.produtoId, { produtoId: esc.produtoId, nome: esc.nome ?? "", qtd });
    }
  }

  return [...porProduto.values()];
}

/**
 * Assinatura estável das escolhas de um item (produtoId:qtd ordenados).
 * Dois itens com as mesmas escolhas empilham; escolhas diferentes viram
 * linhas separadas (a cozinha precisa saber qual hambúrguer sai).
 *
 * @param {object} combo - `item.combo`
 * @returns {string}
 */
function assinaturaEscolhas(combo) {
  const escs = combo?.escolhas;
  if (!Array.isArray(escs) || escs.length === 0) return "";
  return escs
    .map((e) => `${e.produtoId}:${Number(e.qtd ?? 1) || 1}`)
    .sort()
    .join("|");
}

/**
 * Compara a identidade de dois itens de carrinho: mesmo produto, mesmo
 * combo e mesmas escolhas. Um combo nunca se mistura com produto avulso
 * nem com outro combo; um produto com seleção só empilha com outro de
 * escolhas idênticas. Usado no dedupe de adicionar ao carrinho e na
 * transferência entre comandas.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function mesmoItemDeVenda(a, b) {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if ((a.combo?.comboId ?? null) !== (b.combo?.comboId ?? null)) return false;
  return assinaturaEscolhas(a.combo) === assinaturaEscolhas(b.combo);
}
