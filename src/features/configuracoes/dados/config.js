// Configurações do estabelecimento na tabela `config`, uma linha por chave
// (ADR-015, tarefas 1.5 e 2.4 do plano de refatoração). Devolvem o
// `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

/** Chaves que o app carrega na abertura: caixa, pagamento, ponte e alertas. */
export const CHAVES_CONFIG_DA_ABERTURA = [
  "fundo_atual", "caixa_aberto", "sessao_aberta_em", "meios_pagamento", "taxa_servico",
  "metodos_custom", "metodos_tef", "dias_alerta_validade", "ponte_endereco",
  "ponte_local_ativa", "limite_sangria",
];

export function lerConfigDaAbertura() {
  return supabase.from("config").select("key,value").in("key", CHAVES_CONFIG_DA_ABERTURA);
}

export function gravarChaveConfig(chave, valor) {
  return supabase.from("config").upsert({ key: chave, value: valor }, { onConflict: "tenant_id,key" });
}
