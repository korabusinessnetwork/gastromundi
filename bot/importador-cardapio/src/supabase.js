// ──────────────────────────────────────────────────────────────────
// Client Supabase do bot + login. O bot autentica como um USUARIO REAL
// do tenant (signInWithPassword). A partir dai toda escrita passa pela
// RLS com o tenant vindo do JWT — o bot NUNCA usa service key nem decide
// o tenant. E exatamente o mesmo modelo de seguranca do app web: "dois
// transportes, um pipeline" (o app e o bot compartilham a lib de import).
// ──────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

/**
 * Cria o client e autentica. Retorna o client ja logado e o usuario.
 * @param {{supabaseUrl:string, supabaseAnonKey:string, email:string, senha:string}} config
 * @returns {Promise<{supabase:import("@supabase/supabase-js").SupabaseClient, usuario:object}>}
 */
export async function conectar({ supabaseUrl, supabaseAnonKey, email, senha }) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    // Bot headless: sem persistir sessao em disco; refresh em memoria basta.
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) {
    throw new Error(`Login falhou (confira BOT_EMAIL/BOT_PASSWORD): ${error.message}`);
  }
  return { supabase, usuario: data.user };
}
