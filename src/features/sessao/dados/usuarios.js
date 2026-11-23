// Usuários do estabelecimento e a matriz de permissões por cargo (ADR-015,
// tarefas 1.5 e 2.2 do plano de refatoração). Devolvem o `{ data, error }` do
// Supabase sem interpretar: o contexto decide o que cada erro significa
// (coluna ausente, conta desativada, zero linhas afetadas).

import { supabase } from "@/lib/supabase";

/** O usuário ativo dono deste login. `.single()`: erro quando não há linha. */
export function buscarUsuarioAtivoPorAuth(authId, colunas) {
  return supabase.from("users").select(colunas).eq("auth_id", authId).eq("active", true).single();
}

export function listarUsuariosAtivos(colunas) {
  return supabase.from("users").select(colunas).eq("active", true);
}

export function criarUsuario(campos, colunasRetorno) {
  return supabase.from("users").insert(campos).select(colunasRetorno).single();
}

export function atualizarUsuario(id, campos, colunasRetorno) {
  return supabase.from("users").update(campos).eq("id", id).select(colunasRetorno);
}

/** Devolve as linhas apagadas: zero linhas quer dizer que a RLS recusou em silêncio. */
export function excluirUsuario(id) {
  return supabase.from("users").delete().eq("id", id).select("id");
}

export function listarPermissoesDosCargos() {
  return supabase.from("role_permissions").select("role,permissions");
}

export function salvarPermissoesDoCargo(linha) {
  return supabase.from("role_permissions").upsert(linha, { onConflict: "tenant_id,role" }).select("role,permissions");
}
