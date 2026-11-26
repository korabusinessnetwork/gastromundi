import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";

/**
 * Cozinha / KDS (F007) — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md.
 *
 * O "pedido" nesta base é a própria comanda em `public.pending`
 * (JSONB items) — não existe tabela pedidos/pedido_itens separada
 * (docs/09_BACKLOG/mvp_operacional.md descreve o modelo-alvo, não o
 * estado atual; ver ADR-004). O avanço de preparo vive nas colunas
 * status_cozinha/em_preparo_em/pronto_em (migração
 * supabase/migrations/20260711_cozinha_kds.sql).
 */

export const SLA_MINUTOS_PADRAO = 15; // fallback fixo nesta fase — configurável em fase futura

/**
 * Inicia o preparo de um pedido: aguardando → em_preparo.
 * Guard otimista via .eq("status_cozinha", "aguardando") evita duas
 * estações avançarem a mesma comanda ao mesmo tempo.
 *
 * @param {string} pedidoId - id da linha em `pending`
 * @param {string} usuario - username de quem executou
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function iniciarPreparo(pedidoId, usuario) {
  const { data, error } = await supabase
    .from("pending")
    .update({ status_cozinha: "em_preparo", em_preparo_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status_cozinha", "aguardando")
    .select("id, comanda, status_cozinha, em_preparo_em")
    .single();

  if (!error) {
    logAction(usuario, "cozinha:iniciar_preparo", { msg: `Preparo iniciado, comanda ${data?.comanda ?? pedidoId}`, pedido_id: pedidoId });
    emitirEvento("pedido.em_preparo", "cozinha", { pedido_id: pedidoId }, usuario);
  }
  return { data, error };
}

/**
 * Marca o pedido como pronto: em_preparo → pronto.
 * Mesmo guard otimista de iniciarPreparo.
 *
 * @param {string} pedidoId
 * @param {string} usuario
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function marcarPronto(pedidoId, usuario) {
  const { data, error } = await supabase
    .from("pending")
    .update({ status_cozinha: "pronto", pronto_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq("status_cozinha", "em_preparo")
    .select("id, comanda, status_cozinha, pronto_em")
    .single();

  if (!error) {
    logAction(usuario, "cozinha:marcar_pronto", { msg: `Pedido pronto, comanda ${data?.comanda ?? pedidoId}`, pedido_id: pedidoId });
    emitirEvento("pedido.pronto", "cozinha", { pedido_id: pedidoId }, usuario);
  }
  return { data, error };
}

// ── Funções puras (testadas em cozinha.test.js) ────────────────────

/**
 * Minutos decorridos desde uma data até agora (nunca negativo).
 *
 * @param {string|Date|null|undefined} desde
 * @param {string|Date} [agora]
 * @returns {number}
 */
export function tempoDecorridoMin(desde, agora = new Date()) {
  if (!desde) return 0;
  const ms = new Date(agora).getTime() - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/**
 * Formata minutos decorridos em texto humano (prevenção de "8510 min"):
 * abaixo de 1h mostra minutos; de 1h a 1 dia mostra "Xh Ymin"; de 1 dia em
 * diante mostra "Xd Yh". Mantém o número curto e legível a distância no KDS
 * (Princípio nº1) — o operador entende "5d 21h" na hora, não "8510 min".
 *
 * @param {number} minutos
 * @returns {string}
 */
export function formatarTempoDecorrido(minutos) {
  const min = Math.max(0, Math.floor(Number(minutos) || 0));
  if (min < 60) return `${min} min`;
  if (min < 1440) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}min`;
  }
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/**
 * Um pedido está atrasado quando o tempo decorrido na etapa atual
 * (aguardando: desde a criação; em_preparo: desde o início do
 * preparo) ultrapassa o SLA. Pedidos prontos nunca são "atrasados".
 *
 * @param {{ status_cozinha: string, created_at?: string, em_preparo_em?: string }} pedido
 * @param {number} [slaMinutos]
 * @param {string|Date} [agora]
 * @returns {boolean}
 */
export function estaAtrasado(pedido, slaMinutos = SLA_MINUTOS_PADRAO, agora = new Date()) {
  if (!pedido || statusCozinha(pedido) === "pronto") return false;
  return tempoDecorridoMin(referenciaDaEtapa(pedido), agora) >= slaMinutos;
}

/**
 * Status de cozinha do pedido. Sem status gravado, o pedido está aguardando.
 * Refatoração 4.8: o computador usava o status cru no cartão, e o pedido sem
 * status aparecia na coluna "Aguardando" sem o botão de começar o preparo.
 */
export function statusCozinha(pedido) {
  return pedido?.status_cozinha ?? "aguardando";
}

/**
 * Desde quando conta o tempo da etapa atual: em preparo, desde o início do
 * preparo; aguardando, desde que o pedido chegou.
 */
export function referenciaDaEtapa(pedido) {
  return statusCozinha(pedido) === "em_preparo" ? pedido?.em_preparo_em : pedido?.created_at;
}
