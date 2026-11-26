/**
 * Fechamento do DELIVERY — quanto a entrega vendeu no período e, mais
 * importante, ONDE esse dinheiro está.
 *
 * Por que existe, e por que é diferente do fechamento de caixa:
 *
 * A venda de delivery entra no fechamento do caixa junto com a do balcão
 * (FechamentoModal → buildSistema filtra por data e cancelamento, não por
 * origem). Para Pix e cartão tudo bem: cada método tem a própria linha
 * para conferir contra o extrato. Para DINHEIRO cria uma armadilha real:
 *
 *   Pedido de R$ 50 em dinheiro. Você marca "Entregue" às 20h e a venda
 *   entra no caixa na hora. O entregador só volta às 21h com as notas.
 *   Fechando o caixa às 20h30, o sistema espera R$ 50 que NÃO estão na
 *   gaveta e acusa falta.
 *
 * Esta tela não muda o fechamento de caixa — ela mostra o número que
 * explica a diferença. O sistema não tem como saber se o entregador já
 * acertou as contas (não existe esse carimbo), então aqui não se inventa
 * um estado: diz-se quanto foi recebido em mãos e deixa-se a conferência
 * com quem tem os olhos na gaveta.
 *
 * Só pedido ENTREGUE conta como vendido: é o único que virou venda
 * (registrar_venda_delivery roda na transição para 'entregue'). Pedido em
 * rota é promessa, e dinheiro é conservador.
 *
 * Tudo aqui é função pura — testada em fechamentoDelivery.test.js.
 */

const ENTREGUE = "entregue";
const CANCELADO = "cancelado";

/** Formas que o delivery aceita hoje (CheckoutPagamento da vitrine). */
export const FORMAS_DELIVERY = ["dinheiro", "pix", "cartao"];

const num = (v) => Number(v) || 0;

/**
 * Recorta os pedidos por data de criação. Limites em horário LOCAL, para
 * "hoje" significar o dia do restaurante e não o dia UTC — às 21h de
 * Brasília o UTC já virou, e o movimento da noite cairia no dia seguinte.
 *
 * @param {Array<object>} pedidos
 * @param {Date|null} inicio
 * @param {Date|null} fim
 * @returns {Array<object>}
 */
export function pedidosNoPeriodo(pedidos, inicio, fim) {
  const ini = inicio ? inicio.getTime() : null;
  const f = fim ? fim.getTime() : null;
  return (Array.isArray(pedidos) ? pedidos : []).filter((p) => {
    const t = p?.created_at ? new Date(p.created_at).getTime() : NaN;
    if (!Number.isFinite(t)) return false;
    return (ini == null || t >= ini) && (f == null || t <= f);
  });
}

/**
 * O fechamento do período.
 *
 * `porForma` só conta ENTREGUE — é o que virou dinheiro. `emRota` fica à
 * parte porque ainda não é receita: mostrar junto inflaria o dia.
 *
 * @param {Array<object>} pedidos - já recortados pelo período
 * @returns {{
 *   entregues: number, cancelados: number, emRota: number,
 *   vendido: number, taxas: number, ticket: number,
 *   porForma: Array<{forma: string, pedidos: number, total: number}>,
 *   dinheiroEmMaos: number, valorEmRota: number
 * }}
 */
export function fecharDelivery(pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const entregues = lista.filter((p) => p?.status === ENTREGUE);
  const cancelados = lista.filter((p) => p?.status === CANCELADO);
  const emRota = lista.filter((p) => p?.status !== ENTREGUE && p?.status !== CANCELADO);

  const vendido = entregues.reduce((s, p) => s + num(p.total), 0);
  const taxas = entregues.reduce((s, p) => s + num(p.taxa_entrega), 0);

  const porForma = FORMAS_DELIVERY.map((forma) => {
    const daForma = entregues.filter((p) => p?.forma_pagamento === forma);
    return {
      forma,
      pedidos: daForma.length,
      total: daForma.reduce((s, p) => s + num(p.total), 0),
    };
  }).filter((l) => l.pedidos > 0);

  // Forma que não está na lista conhecida (dado antigo, ou forma nova que
  // a vitrine passou a aceitar) não pode sumir da conta: soma-se aparte
  // para o total por forma bater com o vendido.
  const somaConhecidas = porForma.reduce((s, l) => s + l.total, 0);
  const resto = vendido - somaConhecidas;
  if (Math.abs(resto) > 0.005) {
    porForma.push({
      forma: "outros",
      pedidos: entregues.length - porForma.reduce((s, l) => s + l.pedidos, 0),
      total: resto,
    });
  }

  return {
    entregues: entregues.length,
    cancelados: cancelados.length,
    emRota: emRota.length,
    vendido,
    taxas,
    ticket: entregues.length > 0 ? vendido / entregues.length : 0,
    porForma,
    // O número que explica a diferença no caixa: entrou em dinheiro, na
    // mão de quem entregou.
    dinheiroEmMaos: entregues
      .filter((p) => p?.forma_pagamento === "dinheiro")
      .reduce((s, p) => s + num(p.total), 0),
    // Ainda na rua: nem receita nem dinheiro em lugar nenhum.
    valorEmRota: emRota.reduce((s, p) => s + num(p.total), 0),
  };
}
