// Observabilidade (Sentry) — a "luz do painel" do runtime.
//
// A auditoria estática não vê as ESCRITAS SILENCIOSAS da Kora: erro de
// RLS/constraint que o supabase-js engole (resolve { error }, não lança)
// e UPDATE que casa 0 linhas (sucesso falso sob RLS). Hoje esses erros só
// vão pro console; em produção, ninguém vê. Sentry captura crash de render
// sozinho, mas o valor real vem de INSTRUMENTAR MANUALMENTE os ramos de
// erro que já existem (ver reportarFalha/reportarInconsistencia).
//
// Regras (CLAUDE.md):
//   • env-gated e SÓ em produção — dev não polui a cota nem manda ruído;
//   • DSN vem de import.meta.env.VITE_SENTRY_DSN (público por design — a
//     proteção real é o scrub); NUNCA hardcodar segredo/DSN;
//   • fire-and-forget TOTAL — nenhuma falha do Sentry pode quebrar o PDV;
//   • scrubLGPD tira PII/segredo/valores antes de enviar (somos operador
//     de dados — LGPD);
//   • erro de rede/offline NÃO é enviado (isErroDeRede) — é fluxo esperado
//     num app offline-first, subir isso estoura a cota de 5k eventos.

import * as Sentry from "@sentry/react";
import { isErroDeRede } from "@/lib/offline/rede";

// ── Registro do tenant (multi-tenant) ────────────────────────────
// O tenant.id é assíncrono (buscarBootstrapTenant → estado do AppContext);
// não existe getter síncrono em tenant.js. Este register de módulo guarda
// só o UUID do tenant atual para taguear os eventos — NUNCA nome/marca/PII.
// O AppContext chama setTenantObservabilidade(id) quando o bootstrap resolve.
let _tenantId = null;

export function setTenantObservabilidade(tenantId) {
  // Só aceita string não-vazia (UUID). Qualquer outra coisa vira null —
  // defesa contra vazar objeto/nome de tenant no tag.
  _tenantId = typeof tenantId === "string" && tenantId ? tenantId : null;
}

export function tenantAtualObservabilidade() {
  return _tenantId;
}

// ── scrub (LGPD) ─────────────────────────────────────────────────
// Allowlist mental do que PODE subir: mensagem do erro (JÁ mascarada — ver
// mascararPII), código Postgres (error.code), nome da operação/rota,
// tenant_id (UUID). NUNCA sobe: token/refresh, senha/hash, CPF/telefone/
// endereço/e-mail, NOME de cliente, COORDENADAS (lat/lng), valores brutos.
//
// `nome`/`name`/`cliente`/`customer` fecham o vazamento do nome do cliente;
// `latitude|longitude` + `lat`/`lng`/`lon` (com fronteira _ - / início / fim
// pra NÃO raspar "plataforma", "latency" etc.) fecham as coordenadas.
export const CHAVES_PROIBIDAS =
  /senha|password|token|authorization|apikey|api_key|secret|hash|cpf|cnpj|telefone|celular|endereco|address|email|e_mail|nome|name|cliente|customer|latitude|longitude|(?:^|[_-])(?:lat|lng|lon)(?:$|[_-])|valor|total|preco|price|cookie/i;

/**
 * Mascara PII EMBUTIDA EM TEXTO LIVRE (o que o scrub de chaves não alcança).
 * O vetor real: a mensagem de erro do Postgres traz o dado da linha —
 * ex.: `Key (telefone)=(11999998888) already exists`. Aqui isso vira
 * `Key (telefone)=(...)`. Também mascara e-mail e sequências longas de
 * dígitos (CPF/CNPJ/telefone/cartão). Preserva o code do Postgres (5
 * dígitos) e UUID (quebrado por letras/hífens) — úteis pro diagnóstico.
 * Função pura, nunca lança.
 *
 * @param {any} texto
 * @returns {any} string mascarada (ou o próprio valor se não for string)
 */
export function mascararPII(texto) {
  if (typeof texto !== "string" || !texto) return texto;
  return texto
    // detalhe de constraint do Postgres: Key (col)=(valor) → Key (col)=(...)
    .replace(/=\([^)]*\)/g, "=(...)")
    // e-mail
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gi, "[email]")
    // sequência longa de dígitos (>= 7 chars, aceitando . - espaço ( ) no
    // meio): CPF, CNPJ, telefone, cartão. As fronteiras (?<![\w-]) / (?![\w-])
    // impedem casar segmento de UUID (colado a hex/hífen) e o code 23505
    // (5 dígitos < 7). Preserva diagnóstico.
    .replace(/(?<![\w-])\d[\d.\-\s()]{5,}\d(?![\w-])/g, "[num]");
}

/**
 * Varredura recursiva: apaga qualquer chave batendo no regex, em qualquer
 * profundidade (objetos e arrays). Função pura — não lança, tolera ciclos.
 *
 * @param {any} alvo
 * @param {RegExp} regex
 * @param {WeakSet} [vistos] - proteção contra referência circular
 * @returns {any} o próprio alvo (mutado in-place)
 */
export function scrubDeep(alvo, regex = CHAVES_PROIBIDAS, vistos = new WeakSet()) {
  if (!alvo || typeof alvo !== "object") return alvo;
  if (vistos.has(alvo)) return alvo;
  vistos.add(alvo);
  if (Array.isArray(alvo)) {
    for (const item of alvo) scrubDeep(item, regex, vistos);
    return alvo;
  }
  for (const chave of Object.keys(alvo)) {
    if (regex.test(chave)) {
      delete alvo[chave];
      continue;
    }
    const valor = alvo[chave];
    if (valor && typeof valor === "object") scrubDeep(valor, regex, vistos);
  }
  return alvo;
}

/**
 * beforeSend do Sentry: raspa o evento antes de sair. Remove cookies,
 * identidade do usuário e toda chave sensível (recursivo). NUNCA lança —
 * na dúvida, se algo der errado no scrub, descarta o evento (return null)
 * em vez de arriscar vazar PII.
 *
 * @param {object} evento
 * @returns {object|null}
 */
export function scrubLGPD(evento) {
  try {
    if (!evento || typeof evento !== "object") return evento ?? null;
    if (evento.request) delete evento.request.cookies;
    delete evento.user; // não enviar identidade
    // Chaves sensíveis (recursivo). Inclui breadcrumbs — o Sentry anexa
    // fetch/console/xhr por padrão, e um deles pode carregar PII na chave.
    scrubDeep(evento.request, CHAVES_PROIBIDAS);
    scrubDeep(evento.extra, CHAVES_PROIBIDAS);
    scrubDeep(evento.contexts, CHAVES_PROIBIDAS);
    scrubDeep(evento.tags, CHAVES_PROIBIDAS);
    scrubDeep(evento.breadcrumbs, CHAVES_PROIBIDAS);

    // TEXTO LIVRE: o scrub de chaves não alcança a mensagem da exceção nem
    // as mensagens de breadcrumb. É AQUI que o detalhe do Postgres (com
    // telefone/CPF) vazava. Mascara sem apagar o diagnóstico (code/UUID).
    if (Array.isArray(evento.exception?.values)) {
      for (const v of evento.exception.values) {
        if (v && typeof v.value === "string") v.value = mascararPII(v.value);
      }
    }
    if (typeof evento.message === "string") evento.message = mascararPII(evento.message);
    if (evento.logentry && typeof evento.logentry.message === "string") {
      evento.logentry.message = mascararPII(evento.logentry.message);
    }
    if (Array.isArray(evento.breadcrumbs)) {
      for (const b of evento.breadcrumbs) {
        if (!b) continue;
        if (typeof b.message === "string") b.message = mascararPII(b.message);
        // data do breadcrumb (ex.: url de fetch pode trazer PII no query).
        if (b.data && typeof b.data === "object") {
          for (const k of Object.keys(b.data)) {
            if (typeof b.data[k] === "string") b.data[k] = mascararPII(b.data[k]);
          }
        }
      }
    }
    return evento;
  } catch {
    return null; // fail-closed: melhor perder o evento do que vazar PII
  }
}

// ── init ─────────────────────────────────────────────────────────
/**
 * Único ponto de entrada. Env-gated e só em produção: sem DSN ou fora de
 * produção, retorna sem inicializar (fail-open silencioso — o app roda
 * normal). Chamado em main.jsx antes do createRoot.
 */
export function initObservabilidade() {
  try {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn || import.meta.env.MODE !== "production") return; // fail-open
    Sentry.init({
      dsn,
      release: import.meta.env.VITE_APP_VERSION,
      environment: "production",
      tracesSampleRate: 0, // sem tracing na Fase 1 (cota à parte)
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend(evento, hint) {
        // Defesa em profundidade: erro de rede/offline nunca sobe, mesmo
        // que algum ponto esqueça de filtrar antes de chamar reportarFalha.
        const original = hint?.originalException;
        if (isErroDeRede(original)) return null;
        return scrubLGPD(evento);
      },
    });
  } catch {
    /* observabilidade nunca pode quebrar o boot do app */
  }
}

// ── reportar (instrumentação manual dos ramos de erro) ───────────
/**
 * Reporta uma FALHA de escrita (exceção ou { error } do supabase-js) nos
 * ramos NÃO-rede. Fire-and-forget: NUNCA lança. Não envia erro de rede
 * (fluxo esperado offline-first). Usa o tenant_id (UUID) como tag.
 *
 * @param {any} error - o erro/objeto { message, code } do supabase-js
 * @param {object} [contexto] - ex.: { acao: "addSale", tabela: "sales" }
 */
export function reportarFalha(error, contexto = {}) {
  try {
    if (isErroDeRede(error)) return; // rede é fluxo esperado — não é bug
    Sentry.withScope((scope) => {
      scope.setTag("tenant_id", tenantAtualObservabilidade() ?? "desconhecido");
      scope.setContext("operacao", contexto);
      // supabase-js resolve { error } (não é Error). Envelopa em Error
      // preservando code/message para a stack/agrupamento fazer sentido.
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        const msg = error?.message ?? error?.code ?? "Falha desconhecida";
        const e = new Error(String(msg));
        if (error?.code) e.name = `SupabaseError(${error.code})`;
        Sentry.captureException(e);
      }
    });
  } catch {
    /* observabilidade nunca pode quebrar a operação */
  }
}

/**
 * Reporta uma INCONSISTÊNCIA que não é exceção: UPDATE/DELETE que casou 0
 * linhas (RLS negando em silêncio — sucesso falso). Nível warning.
 * Fire-and-forget: NUNCA lança.
 *
 * @param {string} msg
 * @param {object} [contexto] - ex.: { acao: "updateUser", id }
 */
export function reportarInconsistencia(msg, contexto = {}) {
  try {
    Sentry.withScope((scope) => {
      scope.setTag("tenant_id", tenantAtualObservabilidade() ?? "desconhecido");
      scope.setContext("operacao", contexto);
      scope.setLevel("warning");
      Sentry.captureMessage(String(msg ?? "inconsistência"));
    });
  } catch {
    /* idem */
  }
}
