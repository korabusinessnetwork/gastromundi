// Ponte KORA — lógica pura da fila de pedidos (Leva 13).
//
// O servidor (servidor.js) só faz I/O: recebe HTTP, lê/grava arquivo.
// Toda a regra — validar o pedido que chega do Palm, deduplicar por id,
// marcar como confirmado quando o caixa avisa que gravou/imprimiu,
// limpar confirmados antigos — vive aqui, sem I/O, para nascer com teste.

// Mantém confirmados por 24h no arquivo (auditoria rápida) e depois poda.
export const RETENCAO_CONFIRMADO_MS = 24 * 60 * 60 * 1000;

// Limites defensivos — a ponte roda aberta na rede local (com token),
// então nenhum payload pode crescer sem teto.
export const MAX_ITENS = 100;
export const MAX_TEXTO = 200;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function textoLimpo(valor, max = MAX_TEXTO) {
  if (typeof valor !== "string" && typeof valor !== "number") return "";
  return String(valor).replace(/[<>]/g, "").trim().slice(0, max);
}

/**
 * Valida e normaliza um pedido vindo do Palm (POST /pedido).
 * Nunca confia no total do cliente — recalcula de qty × price.
 *
 * @param {object} corpo - JSON recebido
 * @returns {{ok: true, pedido: object} | {ok: false, erro: string}}
 */
export function validarPedido(corpo) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const comanda = textoLimpo(corpo.comanda, 40);
  if (!comanda) return { ok: false, erro: "Informe o número ou nome da comanda." };

  const itensBrutos = Array.isArray(corpo.items) ? corpo.items : [];
  if (itensBrutos.length === 0) return { ok: false, erro: "O pedido está sem itens." };
  if (itensBrutos.length > MAX_ITENS) return { ok: false, erro: `Máximo de ${MAX_ITENS} itens por pedido.` };

  const items = [];
  for (const bruto of itensBrutos) {
    const nome = textoLimpo(bruto?.name, 120);
    const qty = Number(bruto?.qty);
    const price = Number(bruto?.price);
    if (!nome) return { ok: false, erro: "Item sem nome no pedido." };
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) return { ok: false, erro: `Quantidade inválida em "${nome}".` };
    if (!Number.isFinite(price) || price < 0) return { ok: false, erro: `Preço inválido em "${nome}".` };
    items.push({
      // id do produto no catálogo (quando veio do snapshot); pode faltar.
      id: bruto?.id ?? null,
      name: nome,
      qty: Math.round(qty),
      price: round2(price),
      emoji: textoLimpo(bruto?.emoji, 8),
      category: textoLimpo(bruto?.category, 60),
      obs: textoLimpo(bruto?.obs, MAX_TEXTO),
      produzivel: bruto?.produzivel === false ? false : true,
    });
  }

  return {
    ok: true,
    pedido: {
      id: typeof corpo.id === "string" && corpo.id.length >= 8 ? corpo.id.slice(0, 64) : null,
      comanda,
      mesa: textoLimpo(corpo.mesa, 40),
      apelido: textoLimpo(corpo.apelido, 60),
      garcom: textoLimpo(corpo.garcom, 60),
      note: textoLimpo(corpo.note, MAX_TEXTO),
      items,
      total: round2(items.reduce((s, i) => s + i.price * i.qty, 0)),
    },
  };
}

/**
 * Acrescenta um pedido validado à fila. Deduplica por id — se o Palm
 * reenviar (resposta perdida no Wi-Fi), o pedido não entra duas vezes.
 *
 * @param {Array} fila - lista atual (imutável — retorna nova lista)
 * @param {object} pedido - retorno de validarPedido().pedido
 * @param {{agora?: string, gerarId?: () => string}} [opts]
 * @returns {{fila: Array, registro: object, duplicado: boolean}}
 */
export function adicionarPedido(fila, pedido, { agora, gerarId } = {}) {
  const lista = Array.isArray(fila) ? fila : [];
  if (pedido.id) {
    const existente = lista.find((r) => r.id === pedido.id);
    if (existente) return { fila: lista, registro: existente, duplicado: true };
  }
  const registro = {
    id: pedido.id ?? (gerarId ? gerarId() : `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    recebidoEm: agora ?? new Date().toISOString(),
    confirmado: false,
    confirmadoEm: null,
    pedido: { ...pedido },
  };
  registro.pedido.id = registro.id;
  return { fila: [...lista, registro], registro, duplicado: false };
}

/**
 * Pedidos que o caixa ainda não confirmou (o que o polling entrega).
 */
export function pedidosPendentes(fila) {
  return (Array.isArray(fila) ? fila : []).filter((r) => !r.confirmado);
}

/**
 * Marca pedidos como confirmados (caixa gravou e imprimiu). Ids
 * desconhecidos são ignorados em silêncio — confirmação é idempotente.
 *
 * @returns {{fila: Array, confirmados: number}}
 */
export function confirmarPedidos(fila, ids, { agora } = {}) {
  const alvo = new Set(Array.isArray(ids) ? ids : []);
  let confirmados = 0;
  const nova = (Array.isArray(fila) ? fila : []).map((r) => {
    if (!alvo.has(r.id) || r.confirmado) return r;
    confirmados += 1;
    return { ...r, confirmado: true, confirmadoEm: agora ?? new Date().toISOString() };
  });
  return { fila: nova, confirmados };
}

/**
 * Remove confirmados mais velhos que a retenção — o arquivo da fila
 * não cresce para sempre. Pendentes nunca são podados.
 */
export function podarConfirmados(fila, { agoraMs = Date.now(), retencaoMs = RETENCAO_CONFIRMADO_MS } = {}) {
  return (Array.isArray(fila) ? fila : []).filter((r) => {
    if (!r.confirmado) return true;
    const em = Date.parse(r.confirmadoEm ?? r.recebidoEm ?? "");
    if (!Number.isFinite(em)) return false;
    return agoraMs - em < retencaoMs;
  });
}
