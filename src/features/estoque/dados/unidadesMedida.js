// Camada de dados das unidades de medida (ADR-015, tarefa 1.3 do plano de
// refatoração). Usada pela aba do computador e pela seção do celular.

import { supabase } from "@/lib/supabase";

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
