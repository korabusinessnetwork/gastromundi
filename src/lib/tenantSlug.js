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

import { ehConsoleHost } from "./consoleHost";

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
 * De propósito NÃO valida o formato do rótulo: um rótulo estranho ainda é
 * uma reivindicação, e devolvê-la é o que mantém a tela em "endereço não
 * encontrado" em vez de deixar a pessoa entrar no tenant do fallback.
 * Rótulo VAZIO (`.kora.codes`, `..kora.codes`) é o único caso que não é
 * reivindicação nenhuma — e voltava "" em vez de null, o que furava o `??`
 * de quem consome (string vazia não é nullish): o e-mail de login saía
 * `usuario@.local`, malformado, enquanto a tela pintava a marca do
 * fallback. Ou seja, a URL dizia um estabelecimento e a tela mostrava
 * outro, exatamente o que esta função existe para evitar.
 *
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [rootDomain] - default VITE_ROOT_DOMAIN (testável)
 * @returns {string|null} rótulo reivindicado (nunca string vazia) ou null
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
  if (labels.length >= 3 && labels[0] && labels[0] !== "www") return labels[0];
  return null;
}

/**
 * Slug pedido na QUERY (`?loja=casacoffee`) — o caminho de endereçamento que
 * funciona enquanto não existe subdomínio comprado/apontado. É o que a prévia
 * "Ver cardápio do cliente" usa para abrir a loja de QUEM ESTÁ LOGADO: sem
 * isto, a vitrine cai no fallback e o dono de um estabelecimento vê a loja de
 * outro (violação de white-label, decisão 017).
 *
 * Diferente de `slugDoSubdominio`, aqui o formato É validado: query string é
 * entrada do usuário e vira parâmetro de RPC. O que não é slug volta null e o
 * chamador segue para o fallback, como se a query não existisse.
 *
 * @param {string} [search] - default window.location.search
 * @returns {string|null} slug válido em minúsculas, ou null
 */
export function slugDaQuery(search) {
  try {
    const bruto = search ?? (typeof window !== "undefined" ? window.location.search : "");
    const valor = new URLSearchParams(String(bruto)).get("loja");
    const slug = String(valor ?? "").toLowerCase().trim();
    return slugValido(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Qual estabelecimento a VITRINE pública deve mostrar, e de onde essa
 * resposta veio. Precedência: **subdomínio > query > fallback**.
 *
 * O endereço publicado sempre ganha da query — num domínio de loja real,
 * acrescentar `?loja=outro` não troca a loja. A query só decide onde não há
 * reivindicação de subdomínio nenhuma (dev, preview Vercel, domínio nu), que
 * é exatamente o cenário de hoje em produção.
 *
 * `origem` importa para além do diagnóstico: com `"query"` a página está numa
 * PRÉVIA e não pode gravar o cache de marca da origem (o cache é carimbado
 * com `resolverSlugTenant()`, que no domínio compartilhado é sempre o mesmo —
 * gravar ali faria a marca de um estabelecimento aparecer no login do outro).
 *
 * @param {string} [hostname] - default window.location.hostname
 * @param {string} [search] - default window.location.search
 * @returns {{ slug: string, origem: "subdominio"|"query"|"fallback" }}
 */
export function slugDaVitrine(hostname, search) {
  const doSubdominio = slugDoSubdominio(hostname);
  if (doSubdominio) return { slug: doSubdominio, origem: "subdominio" };

  const daQuery = slugDaQuery(search);
  if (daQuery) return { slug: daQuery, origem: "query" };

  return { slug: resolverSlugTenant(hostname), origem: "fallback" };
}

/**
 * Endereço da VITRINE PÚBLICA de um estabelecimento qualquer, para quem está
 * OLHANDO DE FORA (o Console da plataforma). Diferente da prévia que o
 * estabelecimento tem dentro do próprio app, aqui o slug não é o do host: é o
 * do tenant que está no card.
 *
 * Duas formas, pela mesma precedência de `slugDaVitrine` (subdomínio > query):
 *
 *   - No host dedicado do Console (`console.dominio`), o rótulo "console" É uma
 *     reivindicação de subdomínio e VENCERIA o `?loja=` — o link abriria a loja
 *     errada (ou nenhuma). Lá se usa o endereço publicado do estabelecimento,
 *     `https://<slug>.<root>/cardapio`, que é o que o cliente final digita.
 *   - Fora dele (domínio compartilhado, dev, preview), caminho relativo com
 *     `?loja=` — o que funciona hoje em produção.
 *
 * Devolve `null` quando o slug não forma um rótulo DNS válido (tenant anterior à
 * 20260740, campo vazio, lixo no banco). Quem chama não renderiza o link: link
 * quebrado na tela é pior do que atalho ausente.
 *
 * @param {string|null|undefined} slug - slug do tenant a ser aberto
 * @param {string} [hostname] - default window.location.hostname
 * @param {{subdominioConsole?: string, rootDomain?: string}} [opcoes] - overrides testáveis
 * @returns {string|null} endereço da vitrine, ou null se o slug não serve
 */
export function urlDoCardapioPublico(slug, hostname, opcoes = {}) {
  const { subdominioConsole, rootDomain = ROOT_DOMAIN } = opcoes;
  const s = String(slug ?? "").toLowerCase().trim();
  if (!slugValido(s)) return null;
  if (ehConsoleHost(hostname, subdominioConsole, rootDomain)) {
    return `https://${s}.${rootDomain}/cardapio`;
  }
  return `/cardapio?loja=${encodeURIComponent(s)}`;
}

/**
 * Monta o e-mail namespaced que o Supabase Auth espera para este tenant.
 * Com subdomínio na URL, o namespace é SEMPRE o subdomínio digitado —
 * subdomínio errado autentica contra um namespace inexistente (login
 * falha), nunca contra o tenant do fallback.
 *
 * Devolve `null` quando o slug não forma um endereço válido (rótulo com
 * caractere fora de a-z/0-9/hífen, hífen na ponta, ou `VITE_TENANT_SLUG_FALLBACK`
 * mal configurado). Antes montava o e-mail de qualquer jeito e o servidor
 * respondia "Unable to validate email address: invalid format", que ia crua
 * para a tela de login como se fosse problema da senha. Com null, quem chama
 * nem faz a requisição e diz o que realmente aconteceu: o endereço de acesso
 * está errado.
 *
 * @param {string} username
 * @param {string} [hostname]
 * @returns {string|null} `${username}@${slug}.local`, ou null se o slug não serve
 */
export function emailDoLogin(username, hostname) {
  const slug = slugDoSubdominio(hostname) ?? resolverSlugTenant(hostname);
  if (!slugValido(slug)) return null;
  return `${username}@${slug}.local`;
}
