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

export default MODULOS;
