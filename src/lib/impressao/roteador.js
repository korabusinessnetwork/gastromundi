import { montarViaProducao } from "../impressao";

/**
 * Roteamento de comandas por LOCAL de impressão — Fase 1 do plano de
 * impressão de comandas (via de produção por local, não mais uma via
 * única global).
 *
 * Regra: cada item do pedido tem uma `category` (texto livre de
 * products.category); o roteamento do estabelecimento mapeia
 * categoria → local de impressão (`categorias_roteamento`). Itens sem
 * rota (categoria não mapeada ou mapeada para "" = "— Não imprimir —")
 * simplesmente não entram em nenhuma via. Cada local com ≥1 item
 * produzível vira UMA via de produção (reusa `montarViaProducao`, que
 * ainda filtra cancelados/`produzivel: false`).
 *
 * Pura (sem I/O): recebe `roteamento` e `locais` já carregados. Quem
 * busca no banco é o orquestrador (`despacho.js`), pra esta função
 * continuar testável e reaproveitável.
 *
 * @param {object} pedido - shape do `pending` (com `items[].category`)
 * @param {{ roteamento?: Record<string, string>, locais?: Array<{id: string, nome: string}> }} [ctx]
 * @returns {Array<{ local_impressao_id: string, local_nome: string|null, documento: object }>}
 */
export function rotearPedidoPorLocal(pedido, { roteamento = {}, locais = [] } = {}) {
  const itens = Array.isArray(pedido?.items) ? pedido.items : [];
  const nomePorLocal = new Map((locais ?? []).map((l) => [String(l?.id), l?.nome ?? null]));

  // Agrupa itens por local de destino, preservando a ordem em que os
  // locais aparecem (Map mantém ordem de inserção → saída determinística).
  const grupos = new Map(); // local_impressao_id -> itens[]
  for (const item of itens) {
    const categoria = item?.category;
    const localId = categoria != null ? roteamento?.[categoria] : undefined;
    if (!localId) continue; // sem rota → não imprime
    if (!grupos.has(localId)) grupos.set(localId, []);
    grupos.get(localId).push(item);
  }

  const rotas = [];
  for (const [localId, grupoItens] of grupos) {
    const documento = montarViaProducao({ pedido: { ...pedido, items: grupoItens } });
    // Só emite via se sobrar item produzível depois do filtro do template
    // (todos os itens do grupo podem ter sido cancelados/não-produzíveis).
    if (!Array.isArray(documento.itens) || documento.itens.length === 0) continue;
    rotas.push({
      local_impressao_id: localId,
      local_nome: nomePorLocal.get(String(localId)) ?? null,
      documento,
    });
  }
  return rotas;
}
