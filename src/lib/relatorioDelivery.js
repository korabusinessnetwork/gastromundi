// ──────────────────────────────────────────────────────────────────
// relatorioDelivery — a comparação entre o que sai pelo delivery e o
// que sai pela frente de caixa, e o detalhe do delivery.
//
// A separação é honesta porque a venda de delivery JÁ nasce marcada:
// desde a migração 20261002 `registrarVendaDelivery` grava
// `vendas.origem = 'delivery'` e o vínculo com o pedido, e a RPC é
// idempotente por pedido (UNIQUE em vendas.delivery_pedido_id). Não há
// contagem dupla para desfazer aqui — só somar cada lado.
//
// Faturamento (dinheiro que entrou) sai de `vendas`; a operação da
// entrega (bairro, taxa, status, tempo) sai de `delivery_pedidos`, que
// é o histórico próprio do delivery. São perguntas diferentes, e cada
// uma é respondida pela tabela que sabe respondê-la.
//
// Tudo aqui é função pura — testada em relatorioDelivery.test.js.
// ──────────────────────────────────────────────────────────────────

/** Origem de uma venda: 'delivery' quando marcada assim, senão 'pdv'. */
export function origemDaVenda(venda) {
  return venda?.origem === "delivery" ? "delivery" : "pdv";
}

/**
 * Separa as vendas nos dois lados do balcão.
 *
 * @param {Array<object>} vendas
 * @returns {{pdv: Array<object>, delivery: Array<object>}}
 */
export function separarPorOrigem(vendas) {
  const pdv = [];
  const delivery = [];
  for (const v of Array.isArray(vendas) ? vendas : []) {
    (origemDaVenda(v) === "delivery" ? delivery : pdv).push(v);
  }
  return { pdv, delivery };
}

function somaLado(lista) {
  const total = lista.reduce((s, v) => s + (Number(v?.total) || 0), 0);
  const vendas = lista.length;
  return { total, vendas, ticket: vendas > 0 ? total / vendas : 0 };
}

/**
 * Os dois lados lado a lado, com a fatia de cada um no faturamento do
 * período. `participacao` é 0 quando não houve faturamento — dividir por
 * zero devolveria NaN e a tela mostraria "NaN%".
 *
 * @param {Array<object>} vendas
 * @returns {{pdv: object, delivery: object, total: number, vendas: number}}
 */
export function compararOrigens(vendas) {
  const { pdv, delivery } = separarPorOrigem(vendas);
  const a = somaLado(pdv);
  const b = somaLado(delivery);
  const total = a.total + b.total;
  const fatia = (v) => (total > 0 ? (v / total) * 100 : 0);
  return {
    pdv: { ...a, participacao: fatia(a.total) },
    delivery: { ...b, participacao: fatia(b.total) },
    total,
    vendas: a.vendas + b.vendas,
  };
}

// ── Operação do delivery (delivery_pedidos) ────────────────────────

/** Pedido cancelado não é venda perdida contabilizada como faturamento. */
const CANCELADO = "cancelado";

/**
 * Resumo operacional dos pedidos de delivery do período.
 *
 * `faturamento` soma só o que não foi cancelado — um pedido cancelado
 * continua na lista (para aparecer na contagem de cancelados), mas nunca
 * entra no dinheiro.
 *
 * @param {Array<object>} pedidos
 * @returns {{pedidos: number, entregues: number, cancelados: number, emAndamento: number, faturamento: number, taxaEntrega: number, ticket: number, retiradas: number}}
 */
export function resumoDelivery(pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const validos = lista.filter((p) => p?.status !== CANCELADO);
  const faturamento = validos.reduce((s, p) => s + (Number(p?.total) || 0), 0);
  const taxaEntrega = validos.reduce((s, p) => s + (Number(p?.taxa_entrega) || 0), 0);
  const entregues = lista.filter((p) => p?.status === "entregue").length;
  const cancelados = lista.length - validos.length;
  return {
    pedidos: lista.length,
    entregues,
    cancelados,
    emAndamento: validos.length - entregues,
    faturamento,
    taxaEntrega,
    ticket: validos.length > 0 ? faturamento / validos.length : 0,
    retiradas: validos.filter((p) => p?.tipo_entrega === "retirada").length,
  };
}

function agrupar(pedidos, chave, rotuloVazio) {
  const mapa = new Map();
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    if (p?.status === CANCELADO) continue;
    const bruto = String(p?.[chave] ?? "").trim();
    const nome = bruto || rotuloVazio;
    const atual = mapa.get(nome) ?? { nome, pedidos: 0, total: 0 };
    atual.pedidos += 1;
    atual.total += Number(p?.total) || 0;
    mapa.set(nome, atual);
  }
  // Maior faturamento primeiro; empate desempata pelo nome, para a ordem
  // não dançar entre dois carregamentos iguais.
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Faturamento por bairro — onde o delivery realmente vende. Pedido sem
 * bairro vira "Sem bairro" em vez de sumir da conta.
 *
 * @param {Array<object>} pedidos
 * @returns {Array<{nome: string, pedidos: number, total: number}>}
 */
export function agruparPorBairro(pedidos) {
  return agrupar(pedidos, "bairro", "Sem bairro");
}

/**
 * Faturamento por forma de pagamento do delivery.
 *
 * @param {Array<object>} pedidos
 * @returns {Array<{nome: string, pedidos: number, total: number}>}
 */
export function agruparPorFormaPagamento(pedidos) {
  return agrupar(pedidos, "forma_pagamento", "Não informado");
}

/**
 * Tempo médio, em minutos, entre o pedido chegar e ser marcado como
 * entregue. Usa `updated_at` do pedido entregue — é o instante em que
 * alguém tocou o pedido pela última vez, e no fluxo do delivery esse
 * toque é a confirmação da entrega.
 *
 * Devolve null quando não há nenhum pedido entregue com as duas datas:
 * é diferente de "zero minutos", e a tela precisa poder dizer "—".
 *
 * @param {Array<object>} pedidos
 * @returns {number|null}
 */
export function tempoMedioEntregaMin(pedidos) {
  const duracoes = [];
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    if (p?.status !== "entregue") continue;
    const inicio = new Date(p?.created_at ?? "").getTime();
    const fim = new Date(p?.updated_at ?? "").getTime();
    if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) continue;
    duracoes.push((fim - inicio) / 60000);
  }
  if (duracoes.length === 0) return null;
  return duracoes.reduce((s, d) => s + d, 0) / duracoes.length;
}
