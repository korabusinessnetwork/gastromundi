// Cadastros da área administrativa (fichas técnicas, fornecedores, compras,
// impostos), cada um numa linha de `config` com a lista inteira (ADR-015,
// tarefa 1.4). Devolve o `{ data, error }` do Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

export const CHAVES_ADMINISTRATIVO = ["fichas_tecnicas", "fornecedores", "compras", "impostos"];

export function lerCadastrosAdministrativos() {
  return supabase.from("config").select("key, value").in("key", CHAVES_ADMINISTRATIVO);
}

/** Grava a lista INTEIRA da chave: só chame depois de ter lido com sucesso. */
export function salvarCadastroAdministrativo(chave, valor) {
  return supabase.from("config").upsert({ key: chave, value: valor });
}

/** Só a contagem (`count`), sem trazer linha nenhuma. */
export function contarNotasFiscais() {
  return supabase.from("notas_fiscais").select("id", { count: "exact", head: true });
}
