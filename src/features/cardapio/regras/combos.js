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
 * Descarta entradas sem produtoId.
 *
 * `preco` é o que aquela escolha vale — o que o grupo FAZ com esse número
 * depende de `regra` (ver precoDasEscolhas). `grupoId` e `regra` são um
 * retrato do grupo no momento da venda: o dono pode reconfigurar o grupo
 * amanhã, e a comanda de hoje tem de continuar somando o que foi cobrado.
 *
 * Escolha antiga, gravada antes desta versão, não tem nenhum dos dois —
 * cai em grupo único com regra 'soma', que é exatamente o que o sistema
 * fazia antes.
 *
 * @param {Array<object>} escolhas
 * @returns {Array<{produtoId: (number|string), nome: string, qtd: number, preco: number, grupoId: (string|null), regra: string}>}
 */
function normalizarEscolhas(escolhas) {
  return (Array.isArray(escolhas) ? escolhas : [])
    .filter((e) => e && e.produtoId != null)
    .map((e) => ({
      produtoId: e.produtoId,
      nome: e.nome ?? "",
      qtd: Number(e.qtd ?? 1) || 1,
      preco: Number(e.preco ?? 0) || 0,
      grupoId: e.grupoId ?? null,
      regra: REGRAS.has(e.regra) ? e.regra : "soma",
    }));
}

/** As três formas de um grupo virar dinheiro. Ver precoDoGrupo. */
const REGRAS = new Set(["soma", "maior", "media"]);

/**
 * Quanto UM grupo cobra, dadas as escolhas feitas nele.
 *
 * - `soma`  — cada escolha soma o próprio valor (extras: bacon +4, ovo +3).
 * - `maior` — o grupo cobra a escolha mais cara, não a conta de todas. É
 *   como pizzaria cobra meio a meio: metade calabresa (40) e metade
 *   portuguesa (60) é uma pizza de 60, nunca de 100. A quantidade NÃO
 *   multiplica aqui — 2/4 de calabresa continua sendo parte de uma pizza.
 * - `media` — a média ponderada pelas frações escolhidas. Mesma pizza pela
 *   outra convenção de mercado: (40+60)/2 = 50.
 *
 * @param {Array<{qtd: number, preco: number}>} itens
 * @param {'soma'|'maior'|'media'} regra
 * @returns {number}
 */
export function precoDoGrupo(itens, regra) {
  const lista = itens ?? [];
  if (lista.length === 0) return 0;
  const valor = (e) => Number(e?.preco ?? 0) || 0;
  const quantas = (e) => Number(e?.qtd ?? 1) || 1;

  if (regra === "maior") {
    return lista.reduce((maior, e) => Math.max(maior, valor(e)), 0);
  }
  if (regra === "media") {
    const fatias = lista.reduce((s, e) => s + quantas(e), 0);
    if (fatias <= 0) return 0;
    return lista.reduce((s, e) => s + valor(e) * quantas(e), 0) / fatias;
  }
  return lista.reduce((s, e) => s + valor(e) * quantas(e), 0);
}

/**
 * Quanto TODAS as escolhas de um item somam ao preço base, cada grupo
 * cobrando pela própria regra. Grupos diferentes sempre se somam entre si
 * — "cobra o mais caro" vale dentro do grupo de sabores, não entre os
 * sabores e a borda recheada.
 *
 * @param {Array<object>} escolhas
 * @returns {number}
 */
export function precoDasEscolhas(escolhas) {
  const porGrupo = new Map();
  for (const e of normalizarEscolhas(escolhas)) {
    // Escolha sem grupo é sempre 'soma' (dado antigo), e somar é
    // associativo — juntar todas num balde só dá o mesmo resultado.
    const chave = e.grupoId ?? "__sem_grupo__";
    if (!porGrupo.has(chave)) porGrupo.set(chave, { regra: e.regra, itens: [] });
    porGrupo.get(chave).itens.push(e);
  }
  let total = 0;
  for (const { regra, itens } of porGrupo.values()) total += precoDoGrupo(itens, regra);
  return total;
}

/**
 * Monta o item de carrinho de um combo. Os dois modelos convivem
 * (decisão do dono na integração do PR #32, 2026-11-26):
 *
 * - combo com produto principal (`item_principal_id`): o item usa
 *   `id = item_principal_id`, então o principal baixa pelo fluxo normal, e a
 *   receita viaja em `combo.subprodutos` e `combo.produtos` (ver
 *   calcularBaixasSubprodutos e calcularBaixasProdutosCombo);
 * - combo flexível, sem principal: `id = null`, e quem baixa estoque são as
 *   escolhas (ver calcularBaixasEscolhas);
 * - um combo pode ter as duas coisas, e as baixas somam.
 *
 * O preço é o `preco_total` mais os acréscimos das escolhas. `escolhasFixas`,
 * quando vier, entra antes do que o cliente escolheu. O PDV não manda: o que
 * já vem no combo é `combo_produtos`, que tem baixa própria.
 *
 * @param {object} combo - linha de `combos`, com `combo_subprodutos(quantidade, subprodutos(id, nome, controla_estoque))`, `combo_produtos(quantidade, products(id, name))` e `escolhasFixas` quando houver
 * @param {Array<object>} escolhas - produtos escolhidos nos grupos
 * @returns {object|null} item pronto para o carrinho (sem qty/_key) ou null
 */
export function montarItemCombo(combo, escolhas = []) {
  if (!combo) return null;
  const escs = normalizarEscolhas([...(combo.escolhasFixas ?? []), ...escolhas]);

  const subprodutos = (combo.combo_subprodutos ?? [])
    .filter((cs) => cs?.subprodutos?.id)
    .map((cs) => ({
      id: cs.subprodutos.id,
      nome: cs.subprodutos.nome ?? "",
      quantidade: Number(cs.quantidade ?? 1) || 1,
      controla_estoque: !!cs.subprodutos.controla_estoque,
    }));
  const produtos = (combo.combo_produtos ?? [])
    .filter((cp) => cp?.products?.id != null)
    .map((cp) => ({
      id: cp.products.id,
      nome: cp.products.name ?? "",
      quantidade: Number(cp.quantidade ?? 1) || 1,
    }));

  const receita = {};
  if (subprodutos.length) receita.subprodutos = subprodutos;
  if (produtos.length) receita.produtos = produtos;

  return {
    id: combo.item_principal_id ?? null,
    name: combo.nome ?? "Combo",
    price: (Number(combo.preco_total ?? 0) || 0) + precoDasEscolhas(escs),
    combo: { comboId: combo.id, ...receita, escolhas: escs },
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
    price: (Number(produto.price ?? 0) || 0) + precoDasEscolhas(escs),
    emoji: produto.emoji,
    category: produto.category,
    combo: { escolhas: escs },
  };
}

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
 * Agrega as baixas de estoque dos PRODUTOS adicionais dos combos (os que
 * não são o principal). Cada produto adicional baixa seu próprio estoque,
 * como um produto vendido — quem decide se de fato controla estoque é a
 * finalização (guarda `prodId in estoque` + conversão de unidade), igual
 * ao principal. Itens cancelados ficam de fora; quantidades somam por
 * produto (quantidade no combo × qty do item no carrinho).
 *
 * @param {Array<object>} itens - itens do carrinho/comanda ({qty, cancelado, combo:{produtos:[{id, nome, quantidade}]}})
 * @returns {Array<{produtoId: (number|string), nome: string, qtd: number}>}
 */
export function calcularBaixasProdutosCombo(itens) {
  const porProduto = new Map();

  for (const item of itens ?? []) {
    if (!item || item.cancelado) continue;
    const prods = item.combo?.produtos;
    if (!Array.isArray(prods) || prods.length === 0) continue;

    const qtyItem = Number(item.qty ?? 1) || 0;
    if (qtyItem <= 0) continue;

    for (const p of prods) {
      if (!p || p.id == null) continue;
      const qtdCombo = Number(p.quantidade ?? 1) || 0;
      if (qtdCombo <= 0) continue;

      const qtd = qtdCombo * qtyItem;
      const atual = porProduto.get(p.id);
      if (atual) atual.qtd += qtd;
      else porProduto.set(p.id, { produtoId: p.id, nome: p.nome ?? "", qtd });
    }
  }

  return [...porProduto.values()];
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

/**
 * Frase do que o combo já inclui, em português do balcão ("Hambúrguer,
 * Batata e Coca"). Só para mostrar no seletor do PDV: sabendo que a batata
 * já está no combo, o operador não oferece outra.
 *
 * @param {Array<{nome: string, qtd: number}>} itens
 * @returns {string}
 */
export function resumoDoQueVemNoCombo(itens) {
  const partes = (itens ?? [])
    .filter((e) => e?.nome)
    .map((e) => (Number(e.qtd) > 1 ? `${e.qtd}× ${e.nome}` : e.nome));
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** O que já vem no combo, para mostrar: principal, outros produtos e subprodutos. */
export function itensQueVemNoCombo(combo, principal) {
  return [
    ...(principal?.name ? [{ nome: principal.name, qtd: 1 }] : []),
    ...(combo?.combo_produtos ?? []).filter((cp) => cp?.products?.name).map((cp) => ({ nome: cp.products.name, qtd: Number(cp.quantidade ?? 1) })),
    ...(combo?.combo_subprodutos ?? []).filter((cs) => cs?.subprodutos?.nome).map((cs) => ({ nome: cs.subprodutos.nome, qtd: Number(cs.quantidade ?? 1) })),
  ];
}
