// ──────────────────────────────────────────────────────────────────
// Resolução do slug do tenant a partir do SUBDOMÍNIO (login multi-tenant)
//
// O login monta o e-mail do Supabase Auth como `${username}@${slug}.local`.
// O slug vem do subdomínio (casacoffee.dominio.app → "casacoffee"), o que
// permite o MESMO username em tenants diferentes (admin, caixa, gerente).
//
// IMPORTANTE: isto NÃO decide RLS. O tenant efetivo continua vindo do JWT
// (app_metadata.tenant_id) após o login. Aqui só escolhemos QUAL namespace
// de e-mail usar no momento de autenticar.
//
// INERTE POR DESIGN: sem domínio/subdomínio (dev, preview Vercel, domínio
// nu), cai no fallback 'gastromundi' — comportamento idêntico ao de hoje.
// Quando o domínio for comprado e apontado (wildcard *.dominio), configure
// VITE_ROOT_DOMAIN e os subdomínios passam a resolver o tenant certo.
// ──────────────────────────────────────────────────────────────────

const SLUG_FALLBACK = (import.meta.env.VITE_TENANT_SLUG_FALLBACK || "gastromundi").toLowerCase();
const ROOT_DOMAIN   = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

// slug DNS-safe: a-z, 0-9 e hífen no meio (rótulo de subdomínio válido).
const slugValido = (s) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s || "");

/**
 * Resolve o slug do tenant a partir do hostname.
 * @param {string} [hostname] - default window.location.hostname
 * @returns {string} slug (sempre um valor válido; fallback se não resolver)
 */
export function resolverSlugTenant(hostname) {
  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase().trim();

  // Override explícito para dev/local: VITE_TENANT_SLUG simula um tenant
  // sem precisar de subdomínio (ex: testar o login do Casa Coffee local).
  const override = (import.meta.env.VITE_TENANT_SLUG || "").toLowerCase();
  if (slugValido(override)) return override;

  // Ambientes sem subdomínio de tenant → fallback.
  if (!host || host === "localhost") return SLUG_FALLBACK;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return SLUG_FALLBACK;         // IP
  if (host.endsWith(".vercel.app") || host.endsWith(".local")) return SLUG_FALLBACK;

  // Com ROOT_DOMAIN configurado (produção): extrai o rótulo antes dele.
  if (ROOT_DOMAIN) {
    if (host === ROOT_DOMAIN || host === "www." + ROOT_DOMAIN) return SLUG_FALLBACK;
    if (host.endsWith("." + ROOT_DOMAIN)) {
      const first = host.slice(0, host.length - ROOT_DOMAIN.length - 1).split(".")[0];
      if (first && first !== "www" && slugValido(first)) return first;
    }
    return SLUG_FALLBACK;
  }

  // Sem ROOT_DOMAIN: heurística — 3+ rótulos ⇒ o 1º é o slug (sub.dominio.tld).
  const labels = host.split(".");
  if (labels.length >= 3 && labels[0] !== "www" && slugValido(labels[0])) return labels[0];

  return SLUG_FALLBACK;
}

/**
 * Retorna o rótulo de subdomínio que o hostname REIVINDICA como tenant,
 * ou null quando não há reivindicação (dev, IP, preview Vercel, apex/www,
 * domínio nu). Diferente de `resolverSlugTenant`, NÃO aplica fallback:
 * um subdomínio digitado errado (ex.: gastrumundi.kora.codes) volta
 * "gastrumundi" — e cabe à tela validar se esse tenant existe (via
 * `branding_por_slug`) e mostrar erro claro quando não existir, em vez
 * de cair silenciosamente no login de outro estabelecimento.
 *
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [rootDomain] - default VITE_ROOT_DOMAIN (testável)
 * @returns {string|null}
 */
export function slugDoSubdominio(hostname, rootDomain = ROOT_DOMAIN) {
  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : "")
  ).toLowerCase().trim();

  if (!host || host === "localhost") return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;                 // IP
  if (host.endsWith(".vercel.app") || host.endsWith(".local")) return null;

  if (rootDomain) {
    if (host === rootDomain || host === "www." + rootDomain) return null;
    if (host.endsWith("." + rootDomain)) {
      const first = host.slice(0, host.length - rootDomain.length - 1).split(".")[0];
      return first && first !== "www" ? first : null;
    }
    return null; // outro domínio apontado pro app: sem reivindicação de tenant
  }

  // Sem ROOT_DOMAIN: mesma heurística do resolver (3+ rótulos ⇒ 1º é o slug).
  const labels = host.split(".");
  if (labels.length >= 3 && labels[0] !== "www") return labels[0];
  return null;
}

/**
 * Monta o e-mail namespaced que o Supabase Auth espera para este tenant.
 * Com subdomínio na URL, o namespace é SEMPRE o subdomínio digitado —
 * subdomínio errado autentica contra um namespace inexistente (login
 * falha), nunca contra o tenant do fallback.
 * @param {string} username
 * @param {string} [hostname]
 * @returns {string} `${username}@${slug}.local`
 */
export function emailDoLogin(username, hostname) {
  const slug = slugDoSubdominio(hostname) ?? resolverSlugTenant(hostname);
  return `${username}@${slug}.local`;
}
