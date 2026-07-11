/**
 * Códigos de add-on pago — espelham `public.addons.codigo`
 * (supabase/migrations/20260718_addons.sql).
 *
 * Add-ons são um eixo ORTOGONAL ao plano (decisão 019, ADR-005 §3):
 * disponíveis em qualquer tier, ligados/desligados por tenant. Usar
 * estas constantes evita string solta nos hooks de NF-e/TEF.
 */
const ADDONS = {
  NFE: "nfe",
  TEF: "tef",
};

export default ADDONS;
