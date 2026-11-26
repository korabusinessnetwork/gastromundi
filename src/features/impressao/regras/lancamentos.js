// Rastreio de LANÇAMENTOS para a impressão automática (decisão do dono
// 2026-07-29 — "o Palm tem que imprimir com e sem internet").
//
// Um "lançamento" é o conjunto de itens que entrou na comanda no mesmo
// instante — é exatamente o que vira uma via de produção. O carimbo é o
// `launched_at`, gravado item a item pelo PDV (`handleLancar`), pelo Palm
// (`MobilePage.persistirLancamento`) e pela Ponte (`pedidoPonteParaComanda`).
//
// POR QUE ISSO EXISTE: o Palm no celular não alcança a Ponte KORA — um app
// servido por HTTPS só pode falar `http://` com o próprio `localhost`, e o
// `localhost` do celular é o celular. Logo o celular nunca imprime sozinho.
// Quem imprime é o computador do caixa, reagindo ao pedido que chega pelo
// realtime do Supabase. Este módulo diz ao caixa QUAIS lançamentos ele ainda
// não imprimiu, sem depender de coluna nova no banco.
//
// O registro é por aparelho e por sessão: ao abrir o sistema, tudo que já
// está na tela nasce marcado como visto — senão a primeira carga do dia
// cuspiria de novo toda comanda aberta desde ontem.

/**
 * Chave estável de um lançamento. Comanda + instante do lançamento é
 * suficiente: dois lançamentos na mesma comanda no mesmo milissegundo
 * seriam, na prática, o mesmo lançamento.
 *
 * @returns {string|null} null quando o item não tem carimbo rastreável
 */
export function chaveLancamento(pedidoId, launchedAt) {
  if (!pedidoId || !launchedAt) return null;
  return `${pedidoId}|${launchedAt}`;
}

/**
 * Agrupa os itens de uma comanda pelos lançamentos que ela contém.
 * Item sem `launched_at` fica de fora de propósito: é item de comanda
 * antiga (ou do caminho `handleFinalizar`, que não carimba) e imprimi-lo
 * seria mandar pra cozinha algo que ninguém acabou de pedir.
 *
 * @param {object} pedido - shape de `pending`
 * @returns {Array<{chave: string, launchedAt: string, itens: object[]}>}
 */
export function lancamentosDoPedido(pedido) {
  const itens = Array.isArray(pedido?.items) ? pedido.items : [];
  const grupos = new Map();
  for (const item of itens) {
    const chave = chaveLancamento(pedido?.id, item?.launched_at);
    if (!chave) continue;
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, launchedAt: item.launched_at, itens: [] });
    }
    grupos.get(chave).itens.push(item);
  }
  return [...grupos.values()];
}

/**
 * Cria um registro de lançamentos já vistos. Fábrica (e não um Set solto)
 * para os testes rodarem isolados uns dos outros.
 */
export function criarRegistroLancamentos() {
  const vistos = new Set();

  const marcar = (chave) => {
    if (chave) vistos.add(chave);
  };

  const marcarPedido = (pedido) => {
    for (const grupo of lancamentosDoPedido(pedido)) marcar(grupo.chave);
  };

  const marcarPedidos = (pedidos) => {
    for (const pedido of pedidos ?? []) marcarPedido(pedido);
  };

  /**
   * Lançamentos presentes nos pedidos que ainda não foram marcados.
   * NÃO marca — quem chama decide a hora (o caixa marca antes de mandar
   * pra impressora, para o eco do realtime não gerar papel dobrado).
   *
   * @returns {Array<{pedido: object, chave: string, launchedAt: string, itens: object[]}>}
   */
  const novos = (pedidos) => {
    const saida = [];
    for (const pedido of pedidos ?? []) {
      for (const grupo of lancamentosDoPedido(pedido)) {
        if (vistos.has(grupo.chave)) continue;
        saida.push({ pedido, ...grupo });
      }
    }
    // Mais antigo primeiro: se dois garçons lançaram quase juntos, os
    // papéis saem na bancada na ordem em que os pedidos foram feitos.
    return saida.sort((a, b) => String(a.launchedAt).localeCompare(String(b.launchedAt)));
  };

  return { marcar, marcarPedido, marcarPedidos, novos, viu: (chave) => vistos.has(chave) };
}

/**
 * Registro compartilhado do aparelho. Precisa ser um só para o PDV e a
 * Ponte marcarem o que imprimiram na mão e o vigia do realtime não
 * reimprimir o mesmo lançamento.
 */
export const registroLancamentos = criarRegistroLancamentos();
