/**
 * Tema/white-label — Fase 6 da camada de comercialização
 * (docs/08_DECISOES/adr-007.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md).
 *
 * `tenants.tema` (jsonb, desde a Fase 1) guarda só os campos que o
 * tenant SOBRESCREVE — nunca a paleta inteira. Campos aceitos nesta
 * fase: `accent`, `nome_exibicao`, `logo_url` (ADR-007 §2). Qualquer
 * chave desconhecida em `tema` é ignorada (nunca aplicada como CSS
 * arbitrário) — a lista de tokens permitidos é fechada de propósito.
 *
 * Sem tema custom (tenant atual, GastroMundi): `gerarVariaveisTema`
 * retorna `{}`, nada é sobrescrito, e os defaults de `src/styles/tema.css`
 * continuam valendo — aparência idêntica a antes desta fase.
 */

// Mapeia campo do tema (jsonb) → token CSS. Lista fechada: só estes
// campos podem virar custom property, nunca uma chave arbitrária do tenant.
const TOKENS_PERMITIDOS = {
  accent: "--gm-accent",
  bg: "--gm-bg",
  card: "--gm-card",
  surface: "--gm-surface",
  border: "--gm-border",
  green: "--gm-green",
  red: "--gm-red",
  blue: "--gm-blue",
  text: "--gm-text",
  muted: "--gm-muted",
  faint: "--gm-faint",
};

/**
 * Converte `tenants.tema` num mapa { "--gm-token": valor }, pronto
 * para aplicar via CSSOM (`element.style.setProperty`). Só inclui
 * chaves conhecidas e com valor de string não vazia — função pura,
 * sem tocar o DOM.
 *
 * @param {object|null|undefined} tema
 * @returns {Record<string, string>}
 */
export function gerarVariaveisTema(tema) {
  if (!tema || typeof tema !== "object") return {};
  const variaveis = {};
  for (const [campo, token] of Object.entries(TOKENS_PERMITIDOS)) {
    const valor = tema[campo];
    if (typeof valor === "string" && valor.trim()) {
      variaveis[token] = valor.trim();
    }
  }
  return variaveis;
}

/**
 * Nome de exibição do estabelecimento — usado no lugar de "GastroMundi"
 * onde fizer sentido (ex.: cabeçalho da Sidebar). Fallback explícito
 * quando o tenant não definiu `nome_exibicao`.
 *
 * @param {object|null|undefined} tema
 * @param {string} [fallback]
 * @returns {string}
 */
export function nomeExibicaoTenant(tema, fallback = "GastroMundi") {
  const nome = tema?.nome_exibicao;
  return typeof nome === "string" && nome.trim() ? nome.trim() : fallback;
}

/**
 * URL do logo do estabelecimento, ou `null` quando não definido (o
 * chamador decide o fallback visual — ex.: exibir só o nome em texto).
 *
 * @param {object|null|undefined} tema
 * @returns {string|null}
 */
export function logoUrlTenant(tema) {
  const url = tema?.logo_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/**
 * Aplica as variáveis de tema no elemento raiz (via CSSOM, nunca
 * concatenando texto CSS bruto — `style.setProperty` já valida o
 * valor, evitando injeção). Chamado depois do bootstrap, quando
 * `tenant.tema` é conhecido; sem chaves para aplicar (tenant sem tema
 * custom), é uma chamada vazia — os defaults do `:root` continuam valendo.
 *
 * @param {Record<string, string>} variaveis
 * @param {HTMLElement} [root]
 */
export function aplicarVariaveisTema(variaveis, root = document.documentElement) {
  if (!root) return;
  for (const [token, valor] of Object.entries(variaveis ?? {})) {
    root.style.setProperty(token, valor);
  }
}
