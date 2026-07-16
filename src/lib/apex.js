// ──────────────────────────────────────────────────────────────────
// Detecção do APEX INSTITUCIONAL (vitrine da plataforma Kora)
//
// A rota raiz do app decide entre duas telas conforme o hostname:
// - subdomínio de tenant (casacoffee.kora.codes) → login do estabelecimento;
// - domínio nu / www (kora.codes, www.kora.codes) → página institucional
//   da plataforma Kora (vitrine, sem login).
//
// IMPORTANTE: isto NÃO decide RLS nem autenticação. O tenant efetivo
// continua vindo do JWT (app_metadata.tenant_id) após o login — aqui só
// escolhemos O QUE a rota raiz renderiza (institucional x login).
//
// INERTE POR DESIGN: sem VITE_ROOT_DOMAIN configurado (dev, preview
// Vercel, IP), sempre retorna false — comportamento idêntico ao de hoje
// (cai no login com fallback). Quando o domínio for comprado e apontado,
// configure VITE_ROOT_DOMAIN e o apex passa a resolver a institucional.
// ──────────────────────────────────────────────────────────────────

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

// Override de preview local: permite ver a página institucional em dev
// sem precisar apontar um domínio de verdade (VITE_APEX_PREVIEW=1).
const APEX_PREVIEW = import.meta.env.VITE_APEX_PREVIEW === "1";

/**
 * Verifica se o hostname atual corresponde ao apex institucional da Kora
 * (domínio nu ou www), e não a um subdomínio de tenant.
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [rootDomain] - default ROOT_DOMAIN (VITE_ROOT_DOMAIN)
 * @returns {boolean}
 */
export function ehApexInstitucional(hostname, rootDomain = ROOT_DOMAIN) {
  if (APEX_PREVIEW) return true;

  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase().trim();

  // Sem ROOT_DOMAIN configurado: inerte por design (dev, preview Vercel, IP).
  if (!rootDomain) return false;

  return host === rootDomain || host === "www." + rootDomain;
}
