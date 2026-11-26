// ──────────────────────────────────────────────────────────────────
// Detecção do HOST DO CONSOLE (painel de desenvolvedor/plataforma)
//
// O Console da Plataforma (ADR-008 §7) ganha um subdomínio PRÓPRIO
// (ex.: console.kora.codes), separado dos subdomínios de estabelecimento.
// Duas garantias:
//   1. O login de plataforma SOME da porta dos estabelecimentos: no host
//      do console mora um login de desenvolvedor próprio; nos hosts de
//      tenant, o papel `plataforma` não é mais encaminhado ao Console.
//   2. Isolamento de credencial: o login monta o e-mail como
//      `${username}@${slug}.local` (tenantSlug.js); no host do console o
//      slug é o rótulo do console (ex.: "console") → namespace
//      `@console.local`. A credencial do super-admin, criada nesse
//      namespace, NÃO autentica em nenhum subdomínio de tenant; e as
//      credenciais de tenant não autenticam no console.
//
// IMPORTANTE: isto NÃO é a fronteira de segurança. A fronteira REAL é o
// banco — RLS `is_super_admin()` + RPCs SECURITY DEFINER + REVOKE FROM
// PUBLIC (Levas 4/16). Mesmo que a UI do console fosse forçada num host
// de tenant, nenhuma leitura/escrita de plataforma passa sem o claim
// `gastro_role='plataforma'` no JWT. Esta separação de host é
// defesa-em-profundidade + isolamento de UX + remoção da porta de login
// da plataforma dos subdomínios de tenant.
//
// INERTE POR DESIGN: o master switch é VITE_CONSOLE_SUBDOMAIN (junto de
// VITE_ROOT_DOMAIN). Sem ele, consoleAtivo() é false e TUDO se comporta
// como hoje (o super-admin entra pelo login comum e é levado ao /console).
// Ao ligar — definir a variável, apontar o DNS do subdomínio e renomear o
// e-mail do super-admin para o namespace do console — o isolamento entra
// em vigor.
// ──────────────────────────────────────────────────────────────────

const ROOT_DOMAIN       = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();
const CONSOLE_SUBDOMAIN = (import.meta.env.VITE_CONSOLE_SUBDOMAIN || "").toLowerCase().trim();

/**
 * O recurso "Console em subdomínio próprio" está ligado?
 * Master switch: exige VITE_CONSOLE_SUBDOMAIN E VITE_ROOT_DOMAIN. Sem os
 * dois, inerte — comportamento de hoje (plataforma → /console no login
 * comum, sem host dedicado).
 * @returns {boolean}
 */
export function consoleAtivo() {
  return !!CONSOLE_SUBDOMAIN && !!ROOT_DOMAIN;
}

/**
 * O hostname atual é o host dedicado do Console (ex.: console.kora.codes)?
 * Inerte (false) enquanto o master switch estiver desligado.
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [subdominio] - default VITE_CONSOLE_SUBDOMAIN (testável)
 * @param {string} [rootDomain] - default VITE_ROOT_DOMAIN (testável)
 * @returns {boolean}
 */
export function ehConsoleHost(hostname, subdominio = CONSOLE_SUBDOMAIN, rootDomain = ROOT_DOMAIN) {
  const sub  = String(subdominio || "").toLowerCase().trim();
  const root = String(rootDomain || "").toLowerCase().trim();
  if (!sub || !root) return false; // inerte sem master switch

  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase().trim();

  return host === `${sub}.${root}`;
}
