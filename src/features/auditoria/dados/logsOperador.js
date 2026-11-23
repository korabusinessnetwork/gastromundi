// Leituras do registro de ações dos operadores, `operator_logs` (ADR-015,
// tarefa 1.4). Devolve o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

/** As ações mais recentes, até `limite`, para a aba Logs do relatório. */
export function listarLogsOperador(limite = 2000) {
  return supabase
    .from("operator_logs")
    .select("id, operator_id, action_type, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
}

/** Comandas canceladas desde `desdeIso`, para o saldo do dia no PDV. */
export function listarCancelamentosDeComandaDesde(desdeIso) {
  return supabase
    .from("operator_logs")
    .select("payload, created_at")
    .eq("action_type", "comanda:cancelar")
    .gte("created_at", desdeIso);
}
