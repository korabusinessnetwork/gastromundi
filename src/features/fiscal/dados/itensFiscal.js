// Dados fiscais por produto (NCM, CFOP, alíquotas), tabela `itens_fiscal`
// (ADR-015, tarefa 1.4). Devolve o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

const COLUNAS =
  "item_id, ncm, cest, cfop, origem_mercadoria, csosn, cst_icms, aliquota_icms, reducao_base_icms, " +
  "cst_ipi, aliquota_ipi, cst_pis, aliquota_pis, cst_cofins, aliquota_cofins, aliquota_ibs, aliquota_cbs, " +
  "aliquota_is, regime_tributario, observacao_fiscal";

export function listarConfigFiscalDosItens(itemIds) {
  return supabase.from("itens_fiscal").select(COLUNAS).in("item_id", itemIds);
}

export function salvarConfigFiscalDoItem(campos) {
  return supabase.from("itens_fiscal").upsert(campos, { onConflict: "item_id" });
}
