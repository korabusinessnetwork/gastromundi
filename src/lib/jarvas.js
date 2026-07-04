import { supabase } from "./supabase";

/**
 * Jarvas — camada transversal de IA (fase 1: infraestrutura).
 * Spec: docs/03_REGRAS_DE_NEGOCIO/JARVAS.md (decisão 010).
 *
 * Princípios (obrigatórios):
 * - Módulos EMITEM eventos; o Jarvas OBSERVA e devolve insight | alerta | sugestao.
 * - Toda saída é acionável e rastreável aos eventos-fonte (campo `origem`).
 * - Jarvas nunca executa ações sozinho — apenas sugere.
 * - Falha do Jarvas nunca bloqueia a operação (emissão é fire-and-forget).
 *
 * Requer a migração supabase/migrations/20260703_jarvas.sql aplicada.
 */

/**
 * Emite um evento para o Jarvas. Fire-and-forget — nunca awaitar,
 * nunca bloqueia nem quebra a ação principal (mesmo padrão de logger.js).
 *
 * @param {string} tipo       - verbo com namespace: "venda.finalizada", "caixa.fechado", "estoque.baixa"…
 * @param {string} modulo     - "pdv" | "caixa" | "pedidos" | "cozinha" | "estoque" | "financeiro" | "clientes"
 * @param {object} [payload]  - dados do evento (jsonb)
 * @param {string} [operatorId] - username de quem originou a ação
 */
export function emitirEvento(tipo, modulo, payload, operatorId) {
  void (async () => {
    try {
      await supabase.from("jarvas_eventos").insert({
        tipo: String(tipo),
        modulo: String(modulo),
        payload: payload ?? {},
        operator_id: operatorId ? String(operatorId) : null,
      });
    } catch {
      // intencionalmente silencioso — Jarvas nunca bloqueia a operação
    }
  })();
}

/**
 * Registra uma saída do Jarvas (usado pelo motor de análise).
 * Sugestão sem ação clara não deve ser registrada (spec).
 *
 * @param {object} insight
 * @param {"insight"|"alerta"|"sugestao"} insight.tipo
 * @param {"info"|"warning"|"danger"} [insight.severidade]
 * @param {"operacional"|"estrategico"} [insight.visibilidade]
 * @param {string} insight.modulo
 * @param {string} insight.titulo
 * @param {string} insight.descricao
 * @param {{label: string, tipo: string, params?: object}} [insight.acao]
 * @param {{evento_ids?: number[], dados?: object}} [insight.origem] - rastreabilidade (obrigatória na prática)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function registrarInsight(insight) {
  const { data, error } = await supabase
    .from("jarvas_insights")
    .insert({
      tipo: insight.tipo,
      severidade: insight.severidade ?? "info",
      visibilidade: insight.visibilidade ?? "operacional",
      modulo: insight.modulo,
      titulo: insight.titulo,
      descricao: insight.descricao,
      acao: insight.acao ?? null,
      origem: insight.origem ?? {},
    })
    .select("id, tipo, severidade, titulo, status, created_at")
    .single();
  return { data, error };
}

/**
 * Busca insights para exibição (mais recentes primeiro).
 * RLS já filtra visibilidade estratégica por role.
 *
 * @param {object} [opts]
 * @param {string|string[]} [opts.status] - default: ["novo", "lido"]
 * @param {string} [opts.modulo]
 * @param {number} [opts.limite] - default 50
 * @returns {Promise<{data: object[]|null, error: object|null}>}
 */
export async function buscarInsights({ status = ["novo", "lido"], modulo, limite = 50 } = {}) {
  let query = supabase
    .from("jarvas_insights")
    .select(
      "id, tipo, severidade, visibilidade, modulo, titulo, descricao, acao, origem, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limite);

  query = Array.isArray(status) ? query.in("status", status) : query.eq("status", status);
  if (modulo) query = query.eq("modulo", modulo);

  const { data, error } = await query;
  return { data, error };
}

/**
 * Atualiza o status de um insight (lido | descartado | executado),
 * registrando quem e quando (auditoria da spec).
 *
 * @param {string} id
 * @param {"lido"|"descartado"|"executado"} status
 * @param {string} operatorId - username de quem agiu
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function atualizarStatusInsight(id, status, operatorId) {
  const { data, error } = await supabase
    .from("jarvas_insights")
    .update({
      status,
      status_por: operatorId ? String(operatorId) : null,
      status_em: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status")
    .single();
  return { data, error };
}
