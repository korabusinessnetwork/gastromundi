/**
 * Helpers para verificação de senha admin e gestão de usuários.
 * Substitui o antigo padrão de hash SHA-256 no cliente.
 */
import { supabase } from "./supabase";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user`;

// ── Verificação de senha ──────────────────────────────────────────

/**
 * Verifica se a senha é válida para qualquer admin/gerente ativo.
 * Retorna true | false.
 */
export async function verificarSenhaAdmin(password) {
  const { data, error } = await supabase.rpc("verificar_senha_admin", {
    p_password: password,
  });
  if (error) return false;
  return !!data;
}

/**
 * Verifica se a senha é válida para um usuário específico com papel admin/gerente.
 */
export async function verificarSenhaUsuario(username, password) {
  const { data, error } = await supabase.rpc("verificar_senha_admin", {
    p_password: password,
    p_username: username,
  });
  if (error) return false;
  return !!data;
}

// ── Gestão de usuários via Edge Function ─────────────────────────

async function chamarEdge(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${session?.access_token}`,
      "apikey":        import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error ?? "Erro na Edge Function." };
  return { data: json };
}

export async function criarAuthUsuario({ username, password, name, role }) {
  return chamarEdge({ action: "create", username, password, name, role });
}

export async function atualizarSenhaAuth(auth_id, password) {
  return chamarEdge({ action: "update_password", auth_id, password });
}

export async function deletarAuthUsuario(auth_id) {
  return chamarEdge({ action: "delete", auth_id });
}
