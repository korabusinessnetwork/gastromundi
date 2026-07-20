// ──────────────────────────────────────────────────────────────────
// deliveryAlertas — aviso de PEDIDO NOVO pro merchant (Fase 5, Nível 1).
//
// Spec: docs/03_REGRAS_DE_NEGOCIO/DELIVERY.md §"Notificação de pedido novo".
// Nível 1 (MVP) = app aberto/segundo plano: Realtime (já existe) + SOM +
// Notification API. Zero infra nova, ZERO custo (regra de bootstrap):
//   • Som via Web Audio API (oscilador) — sem arquivo de áudio no bundle/git.
//   • Aviso via Notification API do próprio navegador — sem serviço pago.
// Nível 2 (navegador fechado, Web Push/VAPID/Edge Function) fica p/ a fase
// seguinte.
//
// As funções de navegador são TODAS guardadas: se a API não existir (SSR,
// ambiente de teste, navegador antigo) elas viram no-op e retornam false,
// NUNCA lançam — um aviso é acessório e jamais pode quebrar o painel.
//
// As puras (detectar/montar texto) nascem com teste — deliveryAlertas.test.js.
// ──────────────────────────────────────────────────────────────────
import { formatarReais } from "./deliveryPedidos";

// ── Puras ───────────────────────────────────────────────────────────

/**
 * Dado o conjunto de ids já vistos e a lista atual, devolve só os pedidos
 * REALMENTE novos a alertar: id inédito E status 'recebido' (pedido que
 * acabou de chegar — não alertamos por mudança de status de um já conhecido).
 * Safe com entradas nulas/estranhas.
 *
 * @param {Set<string>|Array} idsConhecidos
 * @param {Array} pedidos
 * @returns {Array}
 */
export function detectarNovosPedidos(idsConhecidos, pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const vistos =
    idsConhecidos instanceof Set
      ? idsConhecidos
      : new Set(Array.isArray(idsConhecidos) ? idsConhecidos.map(String) : []);
  return lista.filter(
    (p) => p && (p.status ?? "recebido") === "recebido" && !vistos.has(String(p.id)),
  );
}

/**
 * Texto do aviso pronto pra Notification: título curto + corpo com cliente e
 * total (e bairro quando houver). Linguagem do dia a dia (Princípio nº 1).
 * @returns {{ titulo: string, corpo: string }}
 */
export function montarTextoNotificacao(pedido) {
  if (!pedido) return { titulo: "Novo pedido de delivery", corpo: "" };
  const numero = pedido.numero ? `Novo pedido • ${pedido.numero}` : "Novo pedido de delivery";
  const partes = [];
  if (pedido.cliente_nome) partes.push(String(pedido.cliente_nome).trim());
  partes.push(formatarReais(pedido.total));
  if (pedido.bairro) partes.push(String(pedido.bairro).trim());
  return { titulo: numero, corpo: partes.filter(Boolean).join(" · ") };
}

// ── Navegador (guardadas) ────────────────────────────────────────────

/** Notification API disponível neste ambiente? */
export function notificacoesSuportadas() {
  return typeof window !== "undefined" && typeof window.Notification !== "undefined";
}

/** Estado da permissão de notificação (ou 'indisponivel' se não houver API). */
export function permissaoNotificacao() {
  if (!notificacoesSuportadas()) return "indisponivel";
  return window.Notification.permission; // 'granted' | 'denied' | 'default'
}

/**
 * Pede permissão de notificação (deve partir de um gesto do usuário — o
 * clique no sino). Resolve com o estado final; nunca lança.
 */
export async function pedirPermissaoNotificacao() {
  if (!notificacoesSuportadas()) return "indisponivel";
  try {
    const r = await window.Notification.requestPermission();
    return r || window.Notification.permission;
  } catch {
    return window.Notification.permission || "default";
  }
}

/**
 * Toca 2 bipes curtos via Web Audio (sem arquivo). Retorna true se tocou.
 * Guardado: sem AudioContext (teste/SSR) vira no-op silencioso.
 */
export function tocarBipPedido() {
  if (typeof window === "undefined") return false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  try {
    const ctx = new AudioCtx();
    const agora = ctx.currentTime;
    // Dois "blips" ascendentes, curtos e discretos (não assusta o operador).
    [0, 0.18].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1175; // A5 → D6
      gain.gain.setValueAtTime(0.0001, agora + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, agora + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, agora + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(agora + offset);
      osc.stop(agora + offset + 0.15);
    });
    // Libera o contexto depois do som (evita vazar AudioContext).
    setTimeout(() => { try { ctx.close(); } catch { /* ok */ } }, 600);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dispara uma notificação do navegador para um pedido. Só quando a permissão
 * já foi concedida. Retorna true se disparou. Nunca lança.
 */
export function dispararNotificacaoPedido(pedido) {
  if (permissaoNotificacao() !== "granted") return false;
  try {
    const { titulo, corpo } = montarTextoNotificacao(pedido);
    // tag evita empilhar notificações duplicadas do mesmo pedido.
    new window.Notification(titulo, {
      body: corpo,
      tag: `delivery-${pedido?.id ?? "novo"}`,
      icon: "/icone-kora.svg",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Alerta um LOTE de pedidos novos: 1 bipe (não N) + notificação. Se vier mais
 * de um de uma vez, notifica o primeiro e resume o resto. Nunca lança.
 * @param {Array} novos
 * @param {{ som?: boolean, notificar?: boolean }} [opcoes]
 */
export function alertarPedidosNovos(novos, { som = true, notificar = true } = {}) {
  const lista = Array.isArray(novos) ? novos.filter(Boolean) : [];
  if (lista.length === 0) return;
  if (som) tocarBipPedido();
  if (!notificar) return;
  if (lista.length === 1) {
    dispararNotificacaoPedido(lista[0]);
    return;
  }
  // Vários de uma vez: um aviso-resumo (menos ruído que N notificações).
  if (permissaoNotificacao() !== "granted") return;
  try {
    new window.Notification(`${lista.length} novos pedidos de delivery`, {
      body: "Toque para ver os pedidos que acabaram de chegar.",
      tag: "delivery-lote",
      icon: "/icone-kora.svg",
    });
  } catch {
    /* aviso é acessório — silencioso */
  }
}
