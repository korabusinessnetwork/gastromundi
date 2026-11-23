// Categorias personalizadas do cardápio (ADR-015, tarefa 1.4). Moram numa
// linha de `config` com a lista inteira. Devolve o `{ data, error }` do
// Supabase sem interpretar.

import { supabase } from "@/lib/supabase";

/** `error.code === "PGRST116"` quer dizer que o estabelecimento ainda não criou nenhuma. */
export function lerCategoriasExtra() {
  return supabase.from("config").select("value").eq("key", "categorias_extra").single();
}

/** Grava a lista INTEIRA: só chame depois de ter lido a lista atual com sucesso. */
export function salvarCategoriasExtra(lista) {
  return supabase.from("config").upsert({ key: "categorias_extra", value: lista });
}
