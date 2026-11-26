// ──────────────────────────────────────────────────────────────────
// Detecção do HOST DAS PAUTAS (ferramenta interna dos sócios da Kora)
//
// As Pautas ganham um subdomínio PRÓPRIO (ex.: pautas.kora.codes), no
// mesmo desenho do Console (consoleHost.js). Duas garantias:
//   1. Superfície separada: no host das pautas não existe PDV, nem apex,
//      nem Console — e a porta de login das pautas não aparece em
//      nenhum subdomínio de estabelecimento.
//   2. Isolamento de credencial: o login monta o e-mail como
//      `${usuario}@${slug}.local` e aqui o slug é o rótulo das pautas
//      ("pautas") → namespace `@pautas.local`. A credencial de sócio NÃO
//      autentica em nenhum tenant, e credencial de tenant não entra aqui.
//
// IMPORTANTE: isto NÃO é a fronteira de segurança. A fronteira REAL é a
// RLS de `public.pautas`/`public.pautas_pessoas`, que exige um JWT do
// namespace @pautas.local (public.eh_socio_pautas(), 20260919). Mesmo
// que a UI fosse forçada em outro host, nada seria lido ou escrito.
//
// INERTE POR DESIGN: o master switch é VITE_PAUTAS_SUBDOMAIN (junto de
// VITE_ROOT_DOMAIN). Sem os dois, pautasAtivo() é false e o app se
// comporta exatamente como antes — nenhuma rota, nenhuma tela nova.
// ──────────────────────────────────────────────────────────────────

const ROOT_DOMAIN      = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();
const PAUTAS_SUBDOMAIN = (import.meta.env.VITE_PAUTAS_SUBDOMAIN || "").toLowerCase().trim();

/**
 * O recurso "Pautas em subdomínio próprio" está ligado?
 * Master switch: exige VITE_PAUTAS_SUBDOMAIN E VITE_ROOT_DOMAIN.
 * @returns {boolean}
 */
export function pautasAtivo() {
  return !!PAUTAS_SUBDOMAIN && !!ROOT_DOMAIN;
}

/**
 * O hostname atual é o host dedicado das Pautas (ex.: pautas.kora.codes)?
 * Inerte (false) enquanto o master switch estiver desligado.
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [subdominio] - default VITE_PAUTAS_SUBDOMAIN (testável)
 * @param {string} [rootDomain] - default VITE_ROOT_DOMAIN (testável)
 * @returns {boolean}
 */
export function ehPautasHost(hostname, subdominio = PAUTAS_SUBDOMAIN, rootDomain = ROOT_DOMAIN) {
  const sub  = String(subdominio || "").toLowerCase().trim();
  const root = String(rootDomain || "").toLowerCase().trim();
  if (!sub || !root) return false; // inerte sem master switch

  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase().trim();

  return host === `${sub}.${root}`;
}

/**
 * Namespace de e-mail das credenciais de sócio.
 *
 * Fixo em `pautas` em vez de derivado do hostname de propósito: as contas
 * do Supabase Auth já existem como `<slug>@pautas.local`, e a RLS
 * (`eh_socio_pautas()`) compara com esse sufixo literal. Se o rótulo do
 * subdomínio mudasse, o e-mail montado deixaria de casar com a conta
 * criada — o login falharia sem dizer por quê.
 */
export const SLUG_PAUTAS = "pautas";

/**
 * Monta o e-mail que o Supabase Auth espera para um sócio.
 * Devolve null quando o usuário não forma a parte local de um endereço
 * válido (a-z, 0-9, ponto, hífen e underline) — sem isso o servidor
 * responderia "invalid format" e a mensagem crua chegaria na tela.
 *
 * @param {string} usuario
 * @returns {string|null} `${usuario}@pautas.local`, ou null
 */
export function emailDoSocio(usuario) {
  const u = String(usuario ?? "").toLowerCase().trim();
  if (!/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(u)) return null;
  return `${u}@${SLUG_PAUTAS}.local`;
}

/**
 * Slug do sócio a partir do e-mail da sessão (`matheus@pautas.local` →
 * `matheus`). É por ele que a tela sabe quem está logado e carimba
 * `criada_por`/`atualizada_por`.
 *
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function slugDoSocio(email) {
  const e = String(email ?? "").toLowerCase().trim();
  if (!e.endsWith(`@${SLUG_PAUTAS}.local`)) return null;
  const local = e.slice(0, e.length - `@${SLUG_PAUTAS}.local`.length);
  return local || null;
}
