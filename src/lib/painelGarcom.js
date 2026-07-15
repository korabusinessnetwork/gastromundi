// Painel do Garçom (Palm) — C3.
//
// Duas responsabilidades, ambas puras e testáveis isoladamente:
//   1. Total pessoal do garçom no caixa atual (Bloco 1) — soma dos itens
//      lançados por ele desde a abertura do caixa. Fonte: os lançamentos
//      (launched_at nos itens + garcom/created_by na comanda). A venda
//      finalizada NÃO guarda o garçom que lançou (só o cashier que cobrou),
//      então o total vem das comandas (abertas em `pending` e, quando o
//      registro carrega o garçom, também das vendas).
//   2. Radar de oportunidades por categoria (Bloco 2) — cards quando uma
//      comanda aberta tem um grupo mas falta outro esperado. As regras são
//      declarativas (REGRAS_OPORTUNIDADE) — dá pra adicionar regra nova sem
//      tocar na lógica.

/**
 * A comanda foi lançada por este garçom? Casa por nome (garcom) ou por
 * login (created_by) — o Palm grava os dois ao abrir a comanda.
 */
export function pertenceAoGarcom(comanda, { nome, username } = {}) {
  if (!comanda) return false;
  if (nome && comanda.garcom && comanda.garcom === nome) return true;
  if (username && comanda.created_by && comanda.created_by === username) return true;
  return false;
}

/**
 * Soma os itens lançados pelo garçom desde `desde` (abertura do caixa).
 * Cada item conta se seu launched_at (fallback: created_at da comanda) for
 * >= desde. Ignora itens cancelados. Filtrar por timestamp faz o "reset"
 * ao reabrir o caixa ser automático — sem contador armazenado.
 *
 * @param {Array<object>} comandas - comandas (pending e/ou vendas)
 * @param {{nome?:string, username?:string, desde?:string|number|Date}} ctx
 * @returns {{total:number, itens:number, comandas:number}}
 */
export function totalLancamentosGarcom(comandas, { nome, username, desde } = {}) {
  const desdeMs = desde ? new Date(desde).getTime() : 0;
  let total = 0, itens = 0, comandasContadas = 0;
  for (const c of Array.isArray(comandas) ? comandas : []) {
    if (!pertenceAoGarcom(c, { nome, username })) continue;
    let contou = false;
    for (const it of Array.isArray(c.items) ? c.items : []) {
      if (it?.cancelado) continue;
      const marco = it?.launched_at ?? c.created_at ?? c.at;
      const t = marco ? new Date(marco).getTime() : 0;
      if (t >= desdeMs) {
        const qtd = it.qty ?? 1;
        total += (Number(it.price) || 0) * qtd;
        itens += qtd;
        contou = true;
      }
    }
    if (contou) comandasContadas += 1;
  }
  return { total, itens, comandas: comandasContadas };
}

// ── Bloco 2 — Radar de oportunidades ────────────────────────────────

/**
 * Regras declarativas de lacuna de categoria. Uma regra dispara quando a
 * comanda tem TODOS os grupos de `seTem` e NÃO tem NENHUM de `seFaltamTodos`.
 * Adicionar uma regra nova é só acrescentar um objeto aqui.
 */
export const REGRAS_OPORTUNIDADE = [
  {
    id: "comida-sem-bebida",
    seTem: ["comida"],
    seFaltamTodos: ["bebida", "cafe"],
    rotulo: "pediu comida, sem bebida",
  },
];

/**
 * Grupos presentes numa comanda, a partir da categoria de cada item e do
 * mapa categoria→grupo. Lê item.category direto (o item carrega a categoria
 * do produto); cai para o lookup por id em `produtosPorId` quando ausente.
 *
 * @param {object} comanda
 * @param {Record<string,string>} categoriaGrupo - { [categoria]: grupo }
 * @param {Record<string|number,object>} [produtosPorId]
 * @returns {Set<string>}
 */
export function gruposDaComanda(comanda, categoriaGrupo = {}, produtosPorId = {}) {
  const grupos = new Set();
  for (const it of Array.isArray(comanda?.items) ? comanda.items : []) {
    if (it?.cancelado) continue;
    const categoria = it?.category ?? produtosPorId[it?.id]?.category;
    const grupo = categoria != null ? categoriaGrupo[categoria] : null;
    if (grupo) grupos.add(grupo);
  }
  return grupos;
}

/**
 * Cards de oportunidade de uma comanda aberta, aplicando REGRAS_OPORTUNIDADE.
 *
 * @returns {Array<{comandaId, comanda, mesa, regraId, rotulo}>}
 */
export function oportunidadesDaComanda(comanda, categoriaGrupo = {}, produtosPorId = {}, regras = REGRAS_OPORTUNIDADE) {
  const grupos = gruposDaComanda(comanda, categoriaGrupo, produtosPorId);
  if (grupos.size === 0) return [];
  const cards = [];
  for (const regra of regras) {
    const temTodos = regra.seTem.every((g) => grupos.has(g));
    const faltamTodos = regra.seFaltamTodos.every((g) => !grupos.has(g));
    if (temTodos && faltamTodos) {
      cards.push({
        comandaId: comanda.id,
        comanda: comanda.comanda,
        mesa: comanda.mesa ?? null,
        regraId: regra.id,
        rotulo: regra.rotulo,
      });
    }
  }
  return cards;
}

/**
 * Radar completo: percorre as comandas abertas (com itens) e devolve todos
 * os cards de oportunidade. Não faz I/O — recebe o pendingLocal já em memória
 * (item 6: usa o realtime existente, sem canal novo nem polling).
 *
 * @param {Array<object>} comandas - comandas abertas
 * @param {Record<string,string>} categoriaGrupo
 * @param {Array<object>} [products]
 * @returns {Array<object>} cards
 */
export function radarOportunidades(comandas, categoriaGrupo = {}, products = []) {
  const produtosPorId = {};
  for (const p of Array.isArray(products) ? products : []) produtosPorId[p.id] = p;
  const cards = [];
  for (const c of Array.isArray(comandas) ? comandas : []) {
    const temItens = Array.isArray(c?.items) && c.items.some((it) => !it?.cancelado);
    if (!temItens) continue;
    cards.push(...oportunidadesDaComanda(c, categoriaGrupo, produtosPorId));
  }
  return cards;
}
