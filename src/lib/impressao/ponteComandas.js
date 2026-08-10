// Encaixe do pedido que veio do Palm OFFLINE numa comanda que já está
// aberta (decisão do dono 2026-07-29: "se lançar offline, quando a internet
// voltar, os pedidos devem sincronizar com o online e vice e versa").
//
// O PROBLEMA QUE ISSO RESOLVE: sem internet, o Palm servido pela Ponte não
// enxerga as comandas abertas — o garçom digita o número. Se a comanda 5 já
// existia (aberta antes, com internet), gravar o pedido como comanda nova
// criava uma SEGUNDA comanda 5. O caixa acabava com a conta partida em duas
// e o cliente pagava metade. Aqui o pedido é acumulado na comanda que já
// existe, exatamente como um lançamento normal do PDV.
//
// Módulo puro de propósito: a regra de "é a mesma comanda?" é a parte que
// não pode errar, então ela vive longe de rede, React e Supabase.

/**
 * Nome de comanda comparável. O garçom digita no celular, com pressa: "05",
 * "5 ", "Mesa 5" e "mesa 5" precisam bater com o que está no caixa. Zeros à
 * esquerda caem só quando o nome é todo numérico — "007" de nome próprio
 * continua sendo "007" se tiver letra junto.
 */
export function normalizarNomeComanda(nome) {
  const limpo = String(nome ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!limpo) return "";
  return /^\d+$/.test(limpo) ? String(Number(limpo)) : limpo;
}

/**
 * Comanda ABERTA com esse nome, ou null. Só `status === "open"`: comanda
 * fechada não recebe item novo — isso viraria cobrança em conta já paga.
 */
export function acharComandaAberta(pendentes, nome) {
  const alvo = normalizarNomeComanda(nome);
  if (!alvo) return null;
  const abertas = (pendentes ?? []).filter(
    (o) => o?.status !== "closed" && normalizarNomeComanda(o?.comanda) === alvo
  );
  if (abertas.length === 0) return null;
  // Mais de uma comanda com o mesmo nome já é sintoma do bug antigo. Escolhe
  // a mais recente: é a que o salão está usando agora.
  return abertas.reduce((maisNova, atual) =>
    String(atual?.created_at ?? "") > String(maisNova?.created_at ?? "") ? atual : maisNova
  );
}

/** Soma da comanda no mesmo formato do PDV (`handleLancar`). */
export function totalDosItens(itens) {
  return (itens ?? []).reduce((soma, item) => soma + (item?.price ?? 0) * (item?.qty ?? 1), 0);
}

/**
 * Se um pedido do Palm já foi gravado, ele deixou rastro nos itens
 * (`palm_pedido_id`). É assim que o caixa não grava duas vezes o mesmo
 * pedido depois de um F5 no meio do caminho — o id da comanda não serve
 * mais para isso quando o pedido foi acumulado numa comanda existente.
 */
export function pedidoJaGravado(pendentes, pedidoId) {
  if (!pedidoId) return false;
  return (pendentes ?? []).some(
    (o) => o?.id === pedidoId ||
      (Array.isArray(o?.items) && o.items.some((i) => i?.palm_pedido_id === pedidoId))
  );
}

/**
 * Lista das comandas ABERTAS para o Palm mostrar como sugestão (é a outra
 * metade do "vice e versa": o garçom vê no celular o que já está aberto no
 * caixa e escolhe em vez de digitar de cabeça). Só o mínimo — nome, mesa e
 * apelido — porque isso vai parar num arquivo do PC do balcão e não há por
 * que expor itens, valores ou cliente ali.
 */
export function resumirComandasAbertas(pendentes) {
  const vistas = new Set();
  const saida = [];
  for (const o of pendentes ?? []) {
    if (o?.status === "closed") continue;
    const nome = String(o?.comanda ?? "").trim();
    if (!nome) continue;
    const chave = normalizarNomeComanda(nome);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push({ comanda: nome, mesa: o?.mesa || null, apelido: o?.apelido || null });
  }
  return saida.sort((a, b) =>
    a.comanda.localeCompare(b.comanda, "pt-BR", { numeric: true, sensitivity: "base" })
  );
}

/** Assinatura da lista acima — muda só quando o salão abre/fecha comanda. */
export function assinaturaComandasAbertas(pendentes) {
  return resumirComandasAbertas(pendentes)
    .map((c) => `${c.comanda}${c.mesa ?? ""}${c.apelido ?? ""}`)
    .join("");
}

/**
 * Decide o que fazer com o pedido do Palm: acumular numa comanda aberta ou
 * abrir comanda nova.
 *
 * @param {object[]} pendentes - comandas do app (`pending`)
 * @param {object} order - pedido do Palm já no shape de `pending`
 * @returns {{tipo: "acumular", comandaId: string, itensNovos: object[], itensAnteriores: object[], items: object[], total: number}
 *          |{tipo: "nova", order: object}}
 */
export function encaixarPedidoDoPalm(pendentes, order) {
  const itensNovos = (order?.items ?? []).map((item) => ({ ...item, palm_pedido_id: order?.id }));
  const existente = acharComandaAberta(pendentes, order?.comanda);

  if (!existente) {
    return { tipo: "nova", order: { ...order, items: itensNovos } };
  }

  const itensAnteriores = Array.isArray(existente.items) ? existente.items : [];
  const items = [...itensAnteriores, ...itensNovos];
  return {
    tipo: "acumular",
    comandaId: existente.id,
    comanda: existente,
    itensAnteriores,
    itensNovos,
    items,
    total: totalDosItens(items),
  };
}
