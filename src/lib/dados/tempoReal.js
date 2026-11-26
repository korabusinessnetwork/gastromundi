// Assinatura de mudanças ao vivo (Supabase Realtime), na camada de dados.
// Os ganchos que mantêm uma lista sincronizada entre aparelhos (mesas, cozinha,
// delivery) assinam por aqui, para nenhum código fora de `dados/` falar com o
// Supabase (meta da fase F do plano de refatoração, cobrada pelo lint).

import { supabase } from "@/lib/supabase";

/**
 * Assina as mudanças de uma tabela e devolve a função que cancela a assinatura
 * (para o retorno de um `useEffect`).
 *
 * @param {string} canal - nome único do canal
 * @param {{ event?: string, table: string, filter?: string }} filtro - o que ouvir (schema public)
 * @param {(payload: object) => void} aoMudar - recebe o evento do Realtime
 * @returns {() => void} cancela a assinatura
 */
export function assinarMudancas(canal, { event = "*", table, filter }, aoMudar) {
  const opcoes = { event, schema: "public", table, ...(filter ? { filter } : {}) };
  const channel = supabase.channel(canal).on("postgres_changes", opcoes, aoMudar).subscribe();
  return () => { supabase.removeChannel(channel); };
}
