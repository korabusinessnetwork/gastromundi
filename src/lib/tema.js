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
 *
 * NOTA (Ajuste 2 — F018): `useCor()` é um hook reativo que resolve
 * CSS Custom Properties para seus valores hex em runtime. Usado por
 * props que precisam de valor real (ícones lucide-react, libs de
 * gráfico, canvas). Resolve DEPOIS de `aplicarVariaveisTema()` e
 * re-resolve quando `tenant.tema` muda — nunca chame `resolverCor()`
 * direto no corpo do componente (pega cor default no 1º paint,
 * não segue troca de tenant).
 */

// Mapeia campo do tema (jsonb) → token CSS. Lista fechada: só estes
// campos podem virar custom property, nunca uma chave arbitrária do tenant.
const TOKENS_PERMITIDOS = {
  accent: "--gm-accent",
  alow: "--gm-alow",
  bg: "--gm-bg",
  card: "--gm-card",
  surface: "--gm-surface",
  border: "--gm-border",
  green: "--gm-green",
  red: "--gm-red",
  blue: "--gm-blue",
  warn: "--gm-warn",
  text: "--gm-text",
  muted: "--gm-muted",
  faint: "--gm-faint",
  // Campos de formulário — por padrão derivam por color-mix da marca
  // (src/styles/tema.css); um tenant pode afinar o contraste sobrescrevendo
  // aqui, como qualquer outro token.
  input_bg: "--gm-input-bg",
  input_border: "--gm-input-border",
  input_ring: "--gm-input-ring",
  // Fontes de marca (ADR-007). Valor = font-family stack; só renderiza se
  // a família estiver carregada (index.html). setProperty já sanitiza o
  // valor — nunca vira regra CSS arbitrária.
  font_titulo: "--gm-font-titulo",
  font_texto: "--gm-font-texto",
};

// Fallback: valores default quando uma CSS var não está definida ou
// getComputedStyle falha. Derivado de tema.css defaults, mínimo e
// documentado — NUNCA reintroduz a tabela hex inteira do colors.js antigo.
const FALLBACK_DEFAULTS = {
  "--gm-bg": "#070b14",
  "--gm-card": "#0e1220",
  "--gm-surface": "#161b2c",
  "--gm-border": "#28324d",
  "--gm-accent": "#7c3aed",
  "--gm-alow": "rgba(124, 58, 237, 0.13)",
  "--gm-green": "#10b981",
  "--gm-red": "#ef4444",
  "--gm-blue": "#3b82f6",
  "--gm-warn": "#f59e0b",
  "--gm-text": "#eef2f7",
  "--gm-muted": "#9aa8c4",
  "--gm-faint": "#323d58",
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
 * Marca da PLATAFORMA (o SaaS), não de nenhum cliente. É o único nome que
 * pode ser hardcodado: decisão 017 proíbe a marca de um estabelecimento no
 * código, e é justamente ela que precisa de um substituto neutro para
 * quando o nome do tenant ainda não é conhecido.
 */
export const MARCA_PLATAFORMA = "Kora";

/**
 * Nome de exibição do estabelecimento (ex.: cabeçalho da Sidebar, do
 * relatório exportado, do cupom impresso). Ordem: `tema.nome_exibicao` →
 * `fallback` (normalmente `tenant.nome`, o nome cadastrado) → marca da
 * plataforma.
 *
 * O último degrau era a marca de UM cliente ("GastroMundi"), então todo
 * tenant sem `nome_exibicao` — o padrão de quem acabou de ser cadastrado —
 * via a marca alheia na própria sidebar, no PDF que exportava e no cupom
 * que entregava ao cliente. Agora o pior caso é a marca da plataforma.
 *
 * `fallback` nulo/ausente ou não-string também cai na plataforma, para o
 * chamador poder passar `tenant?.nome` cru sem tratar o caso. String vazia
 * é respeitada (o chamador pediu "sem nome" de propósito — CardapioPage).
 *
 * @param {object|null|undefined} tema
 * @param {string} [fallback]
 * @returns {string}
 */
export function nomeExibicaoTenant(tema, fallback = MARCA_PLATAFORMA) {
  const nome = tema?.nome_exibicao;
  if (typeof nome === "string" && nome.trim()) return nome.trim();
  const alt = fallback ?? MARCA_PLATAFORMA;
  return typeof alt === "string" ? alt.trim() : MARCA_PLATAFORMA;
}

/**
 * Marca completa para aba/cabeçalho: "NOME by Kora", com a assinatura da
 * plataforma embaixo da marca do estabelecimento. Sem nome de
 * estabelecimento (ou quando o nome JÁ é o da plataforma), devolve só a
 * marca da plataforma — nunca "KORA by Kora".
 *
 * @param {string|null|undefined} nome
 * @returns {string}
 */
export function marcaComAssinatura(nome) {
  const n = typeof nome === "string" ? nome.trim() : "";
  if (!n || n.toUpperCase() === MARCA_PLATAFORMA.toUpperCase()) return MARCA_PLATAFORMA;
  return `${n.toUpperCase()} by ${MARCA_PLATAFORMA}`;
}

/**
 * X2 — mesma política de `logoUrlSegura` (src/lib/impressao/renderizar.js):
 * o logo vem do CADASTRO DO TENANT (white-label, decisão 017) e cai direto
 * em `<img src>` (SidebarBranding, LoginPage, CardapioPage). Sem validar o
 * esquema, um `javascript:`/`data:text/html` salvo ali vira XSS. Allowlist:
 * só `http:`, `https:` (logo hospedado) ou `data:image/…` (logo embutido em
 * base64) passam — duplicada aqui (em vez de importar de
 * `lib/impressao/renderizar.js`) para não acoplar este módulo, usado no
 * bootstrap do app inteiro, ao módulo de impressão.
 *
 * @param {any} url
 * @returns {boolean}
 */
function logoUrlSeguraParaImg(url) {
  const s = String(url ?? "").trim();
  if (!s) return false;
  return /^https?:/i.test(s) || /^data:image\//i.test(s);
}

/**
 * URL do logo do estabelecimento, ou `null` quando não definido ou com
 * esquema não permitido (o chamador decide o fallback visual — ex.: exibir
 * só o nome em texto). Ver `logoUrlSeguraParaImg` para a política de
 * validação.
 *
 * @param {object|null|undefined} tema
 * @returns {string|null}
 */
export function logoUrlTenant(tema) {
  const url = tema?.logo_url;
  const s = typeof url === "string" && url.trim() ? url.trim() : null;
  return s && logoUrlSeguraParaImg(s) ? s : null;
}

/**
 * Título do documento (aba do navegador) com a marca do tenant — o
 * white-label vale na aba também (mesmo padrão do <title> estático do
 * index.html: "NOME by Kora"). Sem nome utilizável, não mexe: o título
 * estático continua valendo (ex.: bootstrap ainda sem tenant).
 *
 * @param {string|null|undefined} nome - nome de exibição do tenant
 * @param {Document} [doc]
 */
export function aplicarTituloDocumento(nome, doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return;
  const n = typeof nome === "string" ? nome.trim() : "";
  if (!n) return;
  doc.title = marcaComAssinatura(n);
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

/**
 * Remove do elemento raiz TODAS as custom properties de tema já
 * aplicadas via CSSOM, devolvendo os defaults do `:root` (tema.css).
 * Usado ao trocar de layout/variante (src/layouts): sem a limpeza,
 * tokens do layout anterior "vazariam" para o novo quando o novo não
 * os define (ex.: sair de um layout com fontes custom para o padrao).
 *
 * @param {HTMLElement} [root]
 */
export function limparVariaveisTema(root = typeof document !== "undefined" ? document.documentElement : null) {
  if (!root) return;
  for (const token of Object.values(TOKENS_PERMITIDOS)) {
    root.style.removeProperty(token);
  }
}

/**
 * Resolve uma CSS Custom Property para seu valor hexadecimal em runtime.
 * Usado por props que precisam de valor hex real (ícones lucide-react,
 * recharts, canvas, etc.) — não chamado direto em componentes, sempre
 * através do hook `useCor()` que o torna reativo.
 *
 * Retorna o valor resolvido ou um fallback default se a var não
 * estiver definida ou getComputedStyle falhar.
 *
 * @param {string} tokenName - nome da CSS var, ex.: '--gm-accent' (com --)
 * @returns {string} hex, ex.: '#7c3aed'
 */
export function resolverCor(tokenName) {
  if (typeof document === "undefined") return FALLBACK_DEFAULTS[tokenName] || "#000000";
  try {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
    return valor || FALLBACK_DEFAULTS[tokenName] || "#000000";
  } catch {
    return FALLBACK_DEFAULTS[tokenName] || "#000000";
  }
}

/**
 * Helper para facilitar inline styles com CSS Custom Properties.
 * Converte um nome de token para `var(token)`.
 *
 * Uso:
 *   style={{ color: varColor(C.accent) }}
 *   // equivalente a:
 *   style={{ color: `var(${C.accent})` }}
 *
 * @param {string} tokenName - token name, ex.: '--gm-accent'
 * @returns {string} var(token)
 */
export function varColor(tokenName) {
  return `var(${tokenName})`;
}

/**
 * ⚠️ Para o hook reativo useCor(), importe de '@/lib/useCorHook' em vez deste arquivo.
 * Motivo: evitar dependência circular durante testes (AppContext depende de supabase).
 *
 * Uso em componentes React:
 *   import { useCor } from '@/lib/useCorHook';
 *   const corAccent = useCor('--gm-accent');
 *   <Icon color={corAccent} />
 */
