// Tempo real dos insights do Jarvas (ADR-015, tarefa 1.4). O postgres_changes
// respeita a RLS: cada operador só recebe os insights que já poderia ver.
// Requer Realtime habilitado na tabela `jarvas_insights`.

import { supabase } from "@/lib/supabase";

/**
 * Assina inserções e atualizações de insights. Devolve a função que cancela
 * a assinatura, para o `useEffect` chamar na desmontagem.
 */
export function assinarInsightsJarvas({ aoInserir, aoAtualizar }) {
  const canal = supabase
    .channel("jarvas-insights-realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvas_insights" }, (payload) => aoInserir(payload.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jarvas_insights" }, (payload) => aoAtualizar(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}
