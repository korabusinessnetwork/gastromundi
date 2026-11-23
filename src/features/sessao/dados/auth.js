// Supabase Auth, a única porta do app para entrar, sair e ler a sessão
// (ADR-015, tarefas 1.5 e 2.2 do plano de refatoração). As funções devolvem o
// mesmo resultado do supabase-js, sem interpretar.

import { supabase } from "@/lib/supabase";

export function obterSessaoAuth() {
  return supabase.auth.getSession();
}

export function entrarComSenha(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function sairDoAuth() {
  return supabase.auth.signOut();
}

/** Devolve `{ data: { subscription } }`, como o supabase-js. */
export function aoMudarSessaoAuth(callback) {
  return supabase.auth.onAuthStateChange(callback);
}
