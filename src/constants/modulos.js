/**
 * Códigos de módulo — espelham exatamente os valores gravados em
 * `public.planos_modulos.modulo_codigo` (supabase/migrations/20260717_planos_modulos.sql).
 *
 * Usar estas constantes em vez de strings soltas evita erro de
 * digitação e mantém o front alinhado ao registro central do
 * ADR-005 — nenhum componente decide sozinho "quais módulos existem".
 */
const MODULOS = {
  CARDAPIO:            "cardapio",
  PDV:                 "pdv",
  CAIXA:               "caixa",
  ESTOQUE:             "estoque",
  PEDIDOS:             "pedidos",
  MESAS_COMANDAS:      "mesas_comandas",
  COZINHA:             "cozinha",
  ALERTAS:             "alertas",
  FINANCEIRO:          "financeiro",
  CLIENTES:            "clientes",
  RELATORIOS:          "relatorios",
  JARVAS:              "jarvas",
  MULTILOJA:           "multiloja",
  FISCAL_INTEGRACOES:  "fiscal_integracoes",
  DELIVERY:            "delivery",
};

/**
 * Nome de cada módulo em português do dia a dia — para quando a tela
 * precisa NOMEAR módulos para uma pessoa (ex.: o que um estabelecimento
 * perde ao trocar de plano). Nunca mostre o código cru: `fiscal_integracoes`
 * na tela é jargão técnico (CLAUDE.md, Princípio nº1).
 *
 * A ordem das chaves é a ordem de exibição — a mesma do registro central.
 */
export const ROTULOS_MODULO = {
  [MODULOS.CARDAPIO]:           "Cardápio e produtos",
  [MODULOS.PDV]:                "Frente de caixa",
  [MODULOS.CAIXA]:              "Caixa (abertura e fechamento)",
  [MODULOS.ESTOQUE]:            "Estoque",
  [MODULOS.PEDIDOS]:            "Pedidos",
  [MODULOS.MESAS_COMANDAS]:     "Mesas e comandas",
  [MODULOS.COZINHA]:            "Tela da cozinha",
  [MODULOS.ALERTAS]:            "Alertas",
  [MODULOS.FINANCEIRO]:         "Financeiro",
  [MODULOS.CLIENTES]:           "Clientes",
  [MODULOS.RELATORIOS]:         "Relatórios",
  [MODULOS.JARVAS]:             "Jarvas (inteligência artificial)",
  [MODULOS.MULTILOJA]:          "Multiloja (mais de uma unidade)",
  [MODULOS.FISCAL_INTEGRACOES]: "Fiscal e integrações",
  [MODULOS.DELIVERY]:           "Delivery (site de pedidos)",
};

export default MODULOS;
