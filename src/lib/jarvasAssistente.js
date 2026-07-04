import { supabase } from "./supabase";

/**
 * Cliente do assistente conversacional do Jarvas (fase 5).
 * Chama a Edge Function `jarvas-assistente`, que agrega os dados do
 * negócio no servidor e consulta o LLM — a chave da API nunca chega aqui.
 * Disponível apenas para admin/gerente (a function valida o role).
 */

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/jarvas-assistente`;

/**
 * @param {string} pergunta
 * @param {Array<{papel: "usuario"|"jarvas", texto: string}>} [historico] - últimas mensagens da conversa
 * @returns {Promise<{resposta?: string, error?: string}>}
 */
export async function perguntarAoJarvas(pergunta, historico = []) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ pergunta, historico }),
    });
    const json = await res.json();
    if (!res.ok) return { error: json.error ?? "Erro ao consultar o Jarvas." };
    return { resposta: json.resposta };
  } catch {
    return { error: "Sem conexão com o assistente. Tente novamente." };
  }
}
