import C from "./colors";
import { varColor } from "@/lib/tema";

export const ROLES = {
  garcom: {
    label: "Garçom",
    color: varColor(C.blue),
    description: "Tira pedidos via Palm",
    icon: "🛎️",
    permissions: {
      pdv: false, produtos: false, relatorio: false,
      configuracoes: false, transferir: false, palm: true, estoque: false,
      financeiro: false, cozinha: true, clientes: true,
    },
  },
  caixa: {
    label: "Caixa",
    color: varColor(C.green),
    description: "Tira pedidos e opera a frente de caixa",
    icon: "🧾",
    permissions: {
      pdv: true, produtos: false, relatorio: false,
      configuracoes: false, transferir: true, palm: true, estoque: false,
      financeiro: false, cozinha: true, clientes: true,
    },
  },
  gerente: {
    label: "Gerente",
    color: varColor(C.warn),
    description: "Caixa + relatórios e cadastro de produtos",
    icon: "📊",
    permissions: {
      pdv: true, produtos: true, relatorio: true,
      configuracoes: false, transferir: true, palm: true, estoque: true,
      financeiro: true, cozinha: true, clientes: true,
    },
  },
  admin: {
    label: "Administrador",
    color: varColor(C.accent),
    description: "Acesso completo ao sistema",
    icon: "⚙️",
    permissions: {
      pdv: true, produtos: true, relatorio: true,
      configuracoes: true, transferir: true, palm: true, estoque: true,
      financeiro: true, cozinha: true, clientes: true,
    },
  },
};

export const ROLE_FEATURES = {
  garcom:  ["Palm — tirar pedidos", "Cozinha (KDS)", "Clientes"],
  caixa:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Cozinha (KDS)", "Clientes"],
  gerente: ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos", "Financeiro", "Cozinha (KDS)", "Clientes"],
  admin:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos", "Configurações", "Financeiro", "Cozinha (KDS)", "Clientes"],
};

// Cargo desconhecido não herda permissão de ninguém (fail-closed). Antes o
// fallback era garçom, então um cargo com typo, um cargo novo que ainda não
// tem linha na matriz do tenant, ou o papel `plataforma` do Console entravam
// num estabelecimento já com palm + cozinha + clientes liberados.
const PERMISSOES_ZERO = Object.freeze(
  Object.fromEntries(Object.keys(ROLES.admin.permissions).map((k) => [k, false])),
);

export const getPermissions = (role) =>
  Object.prototype.hasOwnProperty.call(ROLES, role) ? ROLES[role].permissions : PERMISSOES_ZERO;

// ── Permissões editáveis (por cargo e por funcionário) ─────────────
// Fonte única das chaves de permissão e seus rótulos para a UI. A ordem
// aqui é a ordem de exibição nos editores (Configurações → Usuários).
export const PERMISSION_KEYS = [
  "pdv",
  "palm",
  "transferir",
  "produtos",
  "estoque",
  "cozinha",
  "clientes",
  "relatorio",
  "financeiro",
  "configuracoes",
];

// Rótulos em português do dia a dia (Princípio nº 1 — nada de jargão).
export const PERMISSION_LABELS = {
  pdv:           "Frente de Caixa (PDV)",
  palm:          "Palm — tirar pedidos",
  transferir:    "Transferir comandas",
  produtos:      "Cadastro de produtos",
  estoque:       "Estoque",
  cozinha:       "Cozinha (KDS)",
  clientes:      "Clientes",
  relatorio:     "Relatórios",
  financeiro:    "Financeiro",
  configuracoes: "Configurações",
};

// Descrição curta de cada permissão (tooltip/ajuda nos editores).
export const PERMISSION_DESCRICOES = {
  pdv:           "Abrir comandas, lançar pedidos e processar pagamentos.",
  palm:          "Abrir mesas e lançar pedidos pelo celular.",
  transferir:    "Mover itens/comandas entre mesas.",
  produtos:      "Criar e editar produtos do cardápio.",
  estoque:       "Consultar e ajustar quantidades em estoque.",
  cozinha:       "Ver e mover pedidos no painel da cozinha.",
  clientes:      "Cadastro e histórico de clientes.",
  relatorio:     "Relatórios de vendas e desempenho.",
  financeiro:    "Movimentos financeiros e fechamento.",
  configuracoes: "Configurações do sistema e usuários.",
};

/**
 * Mescla o mapa de permissões de um cargo (base) com um override parcial.
 * Puro e defensivo: sempre retorna um objeto com TODAS as PERMISSION_KEYS
 * como booleanos. Para cada chave, o override manda quando presente; senão
 * vale o cargo (base). Chaves desconhecidas no override são ignoradas.
 *
 * @param {Record<string, boolean>|null|undefined} base    - mapa do cargo
 * @param {Record<string, boolean>|null|undefined} override - override do funcionário (parcial)
 * @returns {Record<string, boolean>} mapa efetivo completo
 */
export const mesclarPermissoes = (base, override) => {
  const b = base || {};
  const o = override || {};
  const out = {};
  for (const k of PERMISSION_KEYS) {
    out[k] = Object.prototype.hasOwnProperty.call(o, k) ? !!o[k] : !!b[k];
  }
  return out;
};

/**
 * Calcula o override MÍNIMO de um funcionário: só as chaves cujo valor
 * desejado difere do mapa do cargo. Retorna null quando nada difere (o
 * funcionário volta a seguir o cargo por completo). Assim, ao mudar o
 * cargo depois, as chaves não sobrescritas continuam acompanhando.
 *
 * @param {Record<string, boolean>} desejado - mapa completo que o admin marcou
 * @param {Record<string, boolean>} base      - mapa do cargo (referência)
 * @returns {Record<string, boolean>|null} override parcial ou null
 */
export const calcularOverride = (desejado, base) => {
  const b = base || {};
  const override = {};
  for (const k of PERMISSION_KEYS) {
    const alvo = !!desejado?.[k];
    if (alvo !== !!b[k]) override[k] = alvo;
  }
  return Object.keys(override).length > 0 ? override : null;
};
