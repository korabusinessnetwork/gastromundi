// Leituras de `lancamentos` usadas fora da tela de financeiro (ADR-015,
// tarefa 1.4). Devolve o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

/** Receitas em aberto (fiado) de todos os clientes, numa consulta só. */
export function listarFiadoEmAberto() {
  return supabase
    .from("lancamentos")
    .select("cliente_id, valor, status")
    .eq("tipo", "receita")
    .in("status", ["previsto", "vencido"])
    .not("cliente_id", "is", null)
    .limit(5000);
}
