// ── Pedidos em espera (Palm) ─────────────────────────────────────
// O garçom monta o pedido de uma comanda, põe "em espera" e segue
// atendendo outras mesas; no fim, envia todos de uma vez. A fila
// vive só na memória do aparelho (nada vai ao servidor até enviar).
//
// Funções puras — a tela (MobilePage) cuida de estado e persistência.

/** Cria uma entrada de espera a partir do carrinho atual. */
export const criarEspera = ({ comanda, mesa = "", items = [] }) => ({
  comanda: String(comanda ?? "").trim(),
  mesa:    String(mesa ?? "").trim(),
  items:   items.map(i => ({ ...i })),
});

/**
 * Adiciona uma espera à fila. Se já existe espera para a MESMA comanda,
 * funde os itens (mesmo produto soma quantidade) em vez de duplicar a
 * entrada — o garçom vê uma linha por comanda, como espera ver.
 */
export const adicionarEspera = (lista, nova) => {
  const fila = Array.isArray(lista) ? lista : [];
  if (!nova?.comanda) return fila;
  const idx = fila.findIndex(e => e.comanda === nova.comanda);
  if (idx < 0) return [...fila, nova];
  const existente = fila[idx];
  const itens = [...existente.items];
  for (const item of nova.items ?? []) {
    const j = itens.findIndex(i => i.id === item.id);
    if (j >= 0) itens[j] = { ...itens[j], qty: (itens[j].qty ?? 1) + (item.qty ?? 1) };
    else        itens.push({ ...item });
  }
  const fundida = { ...existente, mesa: existente.mesa || nova.mesa, items: itens };
  return fila.map((e, n) => (n === idx ? fundida : e));
};

/** Remove a espera de uma comanda da fila. */
export const removerEspera = (lista, comanda) =>
  (Array.isArray(lista) ? lista : []).filter(e => e.comanda !== String(comanda ?? "").trim());

/** Total em R$ de uma espera. */
export const totalEspera = (espera) =>
  (espera?.items ?? []).reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0);

/** Quantidade de itens (unidades) de uma espera. */
export const qtdItensEspera = (espera) =>
  (espera?.items ?? []).reduce((s, i) => s + (i.qty ?? 1), 0);

/** Resumo da fila inteira: nº de pedidos, unidades e total em R$. */
export const resumoEsperas = (lista) => {
  const fila = Array.isArray(lista) ? lista : [];
  return {
    pedidos: fila.length,
    itens:   fila.reduce((s, e) => s + qtdItensEspera(e), 0),
    total:   fila.reduce((s, e) => s + totalEspera(e), 0),
  };
};
