/**
 * Cache local de marca do tenant (anti-flash de troca de estabelecimento).
 *
 * Problema: ao abrir casacoffee.kora.codes, o app pintava a marca/tema
 * padrão (GastroMundi) por alguns instantes até a RPC `branding_por_slug`
 * ou o bootstrap responder. Solução: depois de conhecer o tenant, gravamos
 * nome/logo/variáveis de tema no localStorage — que é POR ORIGEM, então o
 * cache do casacoffee nunca vaza pro gastromundi e vice-versa — e um
 * script inline no index.html aplica esse cache ANTES da primeira pintura.
 *
 * O cache é só estética de primeira pintura: a fonte de verdade continua
 * sendo a RPC/bootstrap, que revalida e regrava o cache a cada visita.
 * Só entram variáveis `--gm-*` (mesma lista fechada de src/lib/tema.js,
 * já filtrada por gerarVariaveisTema antes de chegar aqui).
 */

export const BRANDING_CACHE_KEY = "kora_branding_v1";

// Mesmo formato de token aceito pelo script inline do index.html —
// qualquer chave fora do padrão --gm-* é descartada (nunca CSS arbitrário).
// O hífen entra por causa dos tokens de fonte (--gm-font-titulo/-texto).
const TOKEN_VALIDO = /^--gm-[a-z_-]+$/;

/**
 * Normaliza um objeto de branding vindo do storage ou do chamador.
 * Retorna null quando não há nada utilizável — função pura.
 *
 * @param {any} bruto
 * @returns {{ nome: string|null, logo: string|null, variaveis: Record<string,string> }|null}
 */
export function normalizarBranding(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const nome = typeof bruto.nome === "string" && bruto.nome.trim() ? bruto.nome.trim() : null;
  const logo = typeof bruto.logo === "string" && bruto.logo.trim() ? bruto.logo.trim() : null;
  const variaveis = {};
  for (const [token, valor] of Object.entries(bruto.variaveis ?? {})) {
    if (TOKEN_VALIDO.test(token) && typeof valor === "string" && valor.trim()) {
      variaveis[token] = valor.trim();
    }
  }
  if (!nome && !logo && Object.keys(variaveis).length === 0) return null;
  return { nome, logo, variaveis };
}

/**
 * Lê o cache de marca desta origem. Nunca lança: storage indisponível
 * (Safari privado, testes) ou JSON corrompido viram null.
 *
 * @param {Storage} [storage] - default window.localStorage (testável)
 * @returns {{ nome: string|null, logo: string|null, variaveis: Record<string,string> }|null}
 */
export function lerBrandingCache(storage) {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return null;
    return normalizarBranding(JSON.parse(s.getItem(BRANDING_CACHE_KEY)));
  } catch {
    return null;
  }
}

/**
 * Grava o cache de marca desta origem (fire-and-forget: falha de storage
 * é silenciosa — o cache é otimização, nunca requisito).
 *
 * @param {{ nome?: string|null, logo?: string|null, variaveis?: Record<string,string> }} branding
 * @param {Storage} [storage] - default window.localStorage (testável)
 */
export function salvarBrandingCache(branding, storage) {
  try {
    const s = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return;
    const limpo = normalizarBranding(branding);
    if (!limpo) { s.removeItem(BRANDING_CACHE_KEY); return; }
    s.setItem(BRANDING_CACHE_KEY, JSON.stringify(limpo));
  } catch {
    /* storage cheio/indisponível: segue sem cache */
  }
}
