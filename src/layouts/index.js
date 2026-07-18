/**
 * Layouts de aparência do sistema (catálogo + motor dia/noite).
 *
 * Cada layout é um MODELO NOMEADO de paleta, mapeado nos tokens `--gm-*`
 * do design system (ADR-007). Os modelos ficam salvos aqui para uso e
 * mudanças futuras; os CSS originais de referência estão em
 * `src/layouts/referencia/` (fonte visual de onde as paletas vieram).
 *
 * Como se combina com o tema do tenant (ordem de aplicação):
 *   1. defaults de src/styles/tema.css (`:root`) — sempre por baixo;
 *   2. variante do layout escolhido (`tema.layout`) — este arquivo;
 *   3. overrides finos do tenant (`gerarVariaveisTema`) — sempre por cima.
 * Tenant sem `tema.layout` cai no layout `padrao` (variantes vazias):
 * nada é sobrescrito e a aparência atual fica idêntica.
 *
 * Dia/noite: todo layout tem as variantes `diurno` e `noturno`. Nos
 * layouts fixos as duas são o MESMO objeto (sem troca automática); nos
 * adaptativos (marca, casa) o motor troca sozinho — noturno a partir
 * das 19h, diurno a partir das 6h (`varianteDoHorario` + timer no
 * AppContext via `msAteProximaTroca`).
 */

// ── Paletas (derivadas de referencia/layout_pdv_frentedecaixa.css e
//    referencia/layout_pdv_casacoffee.css, mapeadas em --gm-*) ─────────

// 1a — Neutro funcional CLARO (.theme-light). Accent = nav-active-bg
// (grafite): CTAs escuros com texto branco, legíveis no claro.
const NEUTRO_CLARO = {
  "--gm-bg": "#F4F5F7",
  "--gm-card": "#FFFFFF",
  "--gm-surface": "#FFFFFF",
  "--gm-border": "#E3E5E9",
  "--gm-text": "#191B1E",
  "--gm-muted": "#6B7076",
  "--gm-faint": "#9BA1A8",
  "--gm-accent": "#191B1E",
  "--gm-alow": "rgba(25, 27, 30, 0.08)",
  "--gm-green": "#1D9A5B",
  "--gm-red": "#D14C4C",
  "--gm-blue": "#3B77C2",
};

// 1a — Neutro funcional ESCURO (.theme-dark). Accent = info (#5B94D6):
// o nav-active claro da referência (#F2F3F5) não serve de accent aqui
// porque os CTAs do app pintam texto branco sobre o accent.
const NEUTRO_ESCURO = {
  "--gm-bg": "#17191D",
  "--gm-card": "#21242A",
  "--gm-surface": "#262A31",
  "--gm-border": "#2E3238",
  "--gm-text": "#F2F3F5",
  "--gm-muted": "#9BA1A8",
  "--gm-faint": "#6B7076",
  "--gm-accent": "#5B94D6",
  "--gm-alow": "rgba(91, 148, 214, 0.14)",
  "--gm-green": "#2EB56E",
  "--gm-red": "#E36060",
  "--gm-blue": "#5B94D6",
};

// 1b — Marca (.theme-light + .brand): base clara com o roxo-índigo
// #473CA8 da marca como accent e teal #2AA48F como verde de ação.
const MARCA_DIURNO = {
  ...NEUTRO_CLARO,
  "--gm-accent": "#473CA8",
  "--gm-alow": "rgba(71, 60, 168, 0.13)",
  "--gm-green": "#2AA48F",
  "--gm-blue": "#3E8DD6",
};

// 1c — Alto contraste noturno (.theme-night): bar/luz baixa, texto
// branco puro e semânticas mais vivas. Accent = azul do nav ativo.
const NOTURNO = {
  "--gm-bg": "#101215",
  "--gm-card": "#1A1D21",
  "--gm-surface": "#22262B",
  "--gm-border": "#33383F",
  "--gm-text": "#FFFFFF",
  "--gm-muted": "#A6ADB5",
  "--gm-faint": "#6E757D",
  "--gm-accent": "#4E9CF0",
  "--gm-alow": "rgba(78, 156, 240, 0.16)",
  "--gm-green": "#34C275",
  "--gm-red": "#F05B5B",
  "--gm-blue": "#4E9CF0",
};

// Casa Coffee CLARO (.theme-casa): creme como base (nunca branco puro),
// verde-mata só em confirmar, terracota só em cancelar/erro (Social DNA).
const CASA_DIURNO = {
  "--gm-bg": "#F4EDE1",
  "--gm-card": "#FFFDF8",
  "--gm-surface": "#FFFDF8",
  "--gm-border": "#E0D3BF",
  "--gm-text": "#2A211D",
  "--gm-muted": "#8A776B",
  "--gm-faint": "#B3A092",
  "--gm-accent": "#8c3a2a",
  "--gm-alow": "rgba(140, 58, 42, 0.13)",
  "--gm-green": "#305429",
  "--gm-red": "#8c3a2a",
  "--gm-blue": "#5b3c34",
  "--gm-font-titulo": '"Saira", system-ui, sans-serif',
  "--gm-font-texto": '"Sora", system-ui, sans-serif',
};

// Casa Coffee ESCURO (.theme-casa-dark): marrom profundo, semânticas
// clareadas para manter contraste AA sobre fundo escuro.
const CASA_NOTURNO = {
  "--gm-bg": "#241B17",
  "--gm-card": "#322721",
  "--gm-surface": "#322721",
  "--gm-border": "#3E3028",
  "--gm-text": "#F2EAE1",
  "--gm-muted": "#A8968A",
  "--gm-faint": "#7A6A5E",
  "--gm-accent": "#D4785F",
  "--gm-alow": "rgba(212, 120, 95, 0.16)",
  "--gm-green": "#7FB069",
  "--gm-red": "#D4785F",
  "--gm-blue": "#E4D2BC",
  "--gm-font-titulo": '"Saira", system-ui, sans-serif',
  "--gm-font-texto": '"Sora", system-ui, sans-serif',
};

// `padrao`: variantes vazias de propósito — herda os defaults de
// tema.css e os tenants existentes ficam pixel-idênticos a antes.
const PADRAO = {};

// ── Catálogo ─────────────────────────────────────────────────────────
// Chave = código salvo em `tenants.tema.layout` (jsonb). A chave é
// desconhecida para `gerarVariaveisTema` (lista fechada) — nunca vira
// CSS; só este motor a interpreta.
export const LAYOUTS = {
  padrao: {
    codigo: "padrao",
    nome: "KORA Escuro (padrão)",
    descricao: "Aparência atual do sistema — navy escuro com roxo.",
    variantes: { diurno: PADRAO, noturno: PADRAO },
  },
  claro: {
    codigo: "claro",
    nome: "Neutro Claro",
    descricao: "Neutro funcional claro (1a) — fixo, sem troca automática.",
    variantes: { diurno: NEUTRO_CLARO, noturno: NEUTRO_CLARO },
  },
  escuro: {
    codigo: "escuro",
    nome: "Neutro Escuro",
    descricao: "Neutro funcional escuro (1a) — fixo, sem troca automática.",
    variantes: { diurno: NEUTRO_ESCURO, noturno: NEUTRO_ESCURO },
  },
  marca: {
    codigo: "marca",
    nome: "Marca (dia/noite automático)",
    descricao:
      "Layout da marca (1b) de dia; troca sozinho para o noturno (1c) às 19h e volta ao diurno às 6h.",
    variantes: { diurno: MARCA_DIURNO, noturno: NOTURNO },
  },
  noturno: {
    codigo: "noturno",
    nome: "Noturno",
    descricao: "Alto contraste para bar/luz baixa (1c) — fixo.",
    variantes: { diurno: NOTURNO, noturno: NOTURNO },
  },
  casa: {
    codigo: "casa",
    nome: "Casa Coffee (dia/noite automático)",
    descricao:
      "Paleta Casa Coffee Colab — creme de dia, marrom-café à noite (troca às 19h/6h).",
    variantes: { diurno: CASA_DIURNO, noturno: CASA_NOTURNO },
  },
};

// Layout aplicado por padrão aos estabelecimentos NOVOS criados no
// Console (regra do dono: novos nascem no 1b, o layout da marca).
export const LAYOUT_PADRAO_NOVOS = "marca";

// Fronteiras da troca automática (hora local do dispositivo do PDV):
// >= 19h entra o noturno; >= 6h volta o diurno.
export const HORA_INICIO_NOTURNO = 19;
export const HORA_INICIO_DIURNO = 6;

/**
 * Lista os layouts para o menu de escolha do Console.
 * @returns {Array<{codigo:string, nome:string, descricao:string}>}
 */
export function listarLayouts() {
  return Object.values(LAYOUTS).map(({ codigo, nome, descricao }) => ({ codigo, nome, descricao }));
}

/**
 * Código do layout do tenant a partir do `tema` (jsonb). Valor ausente
 * ou desconhecido cai no `padrao` — nunca quebra a renderização.
 * @param {object|null|undefined} tema
 * @returns {string}
 */
export function layoutDoTema(tema) {
  const codigo = tema?.layout;
  return typeof codigo === "string" && LAYOUTS[codigo] ? codigo : "padrao";
}

/**
 * Variante que vale para uma hora do dia: noturno das 19h às 5h59,
 * diurno das 6h às 18h59. Função pura (testável sem relógio real).
 * @param {number} hora - 0..23
 * @returns {"diurno"|"noturno"}
 */
export function varianteDoHorario(hora) {
  return hora >= HORA_INICIO_NOTURNO || hora < HORA_INICIO_DIURNO ? "noturno" : "diurno";
}

/**
 * Um layout tem troca automática quando as variantes diurna e noturna
 * são modelos diferentes (marca, casa). Nos fixos não há timer.
 * @param {string} codigo
 * @returns {boolean}
 */
export function temTrocaAutomatica(codigo) {
  const layout = LAYOUTS[codigo] ?? LAYOUTS.padrao;
  return layout.variantes.diurno !== layout.variantes.noturno;
}

/**
 * Mapa { "--gm-token": valor } da variante de um layout, pronto para
 * `aplicarVariaveisTema`. Layout desconhecido → `padrao` (mapa vazio).
 * @param {string} codigo
 * @param {"diurno"|"noturno"} [variante]
 * @returns {Record<string, string>}
 */
export function variaveisDoLayout(codigo, variante = "diurno") {
  const layout = LAYOUTS[codigo] ?? LAYOUTS.padrao;
  return { ...(layout.variantes[variante] ?? layout.variantes.diurno) };
}

/**
 * Milissegundos até a PRÓXIMA fronteira de troca (06:00 ou 19:00),
 * com 1s de folga para o timer disparar já DENTRO da nova janela
 * (evita re-armar no mesmo lado da fronteira por drift de relógio).
 * @param {Date} [agora]
 * @returns {number}
 */
export function msAteProximaTroca(agora = new Date()) {
  const proxima = new Date(agora.getTime());
  proxima.setMinutes(0, 0, 0);
  const hora = agora.getHours();
  if (hora < HORA_INICIO_DIURNO) {
    proxima.setHours(HORA_INICIO_DIURNO);
  } else if (hora < HORA_INICIO_NOTURNO) {
    proxima.setHours(HORA_INICIO_NOTURNO);
  } else {
    proxima.setDate(proxima.getDate() + 1);
    proxima.setHours(HORA_INICIO_DIURNO);
  }
  return Math.max(proxima.getTime() - agora.getTime(), 0) + 1000;
}
