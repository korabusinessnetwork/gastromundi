// Camada de dados das unidades de medida (ADR-015, tarefas 1.3 e 1.4 do plano
// de refatoração). Usada pela aba do computador e pela seção do celular.

import { supabase } from "@/lib/supabase";

const COLUNAS = "id, abreviacao, nome, tipo, ordem";

export function listarUnidadesMedida() {
  return supabase.from("unidades_medida").select(COLUNAS).order("ordem").order("nome");
}

export function adicionarUnidadeMedida({ abreviacao, nome, tipo }) {
  return supabase
    .from("unidades_medida")
    .insert({ abreviacao, nome, tipo, ordem: 99 })
    .select(COLUNAS)
    .single();
}

/**
 * Quantos produtos usam a abreviação, como unidade de estoque, de consumo ou
 * de compra. Função pura: era a mesma conta copiada nas duas telas.
 */
export function contarProdutosComUnidade(produtos, abreviacao) {
  return (produtos || []).filter((p) =>
    p.unidade_estoque === abreviacao ||
    p.unidade_consumo === abreviacao ||
    (Array.isArray(p.unidades_compra) && p.unidades_compra.some((c) => c.unidade === abreviacao)),
  ).length;
}

/**
 * Conta, no banco, os produtos que perdem a unidade se ela for excluída.
 * Devolve `{ data: número, error }`.
 */
export async function contarUsoDaUnidade(abreviacao) {
  const { data, error } = await supabase
    .from("products")
    .select("id, unidade_estoque, unidade_consumo, unidades_compra");
  if (error) return { data: null, error };
  return { data: contarProdutosComUnidade(data, abreviacao), error: null };
}

/**
 * Desvincula a unidade de todos os produtos e a exclui, numa transação só:
 * ou tudo, ou nada. As recusas da função já chegam escritas para o operador
 * (unidade que não existe mais, usuário sem permissão).
 */
export async function excluirUnidadeMedida(unidadeId) {
  const { error } = await supabase.rpc("excluir_unidade_medida", { p_unidade_id: unidadeId });
  if (error) {
    throw new Error(error.message || "Não deu para excluir a unidade. Nada foi alterado, tente de novo.");
  }
}
