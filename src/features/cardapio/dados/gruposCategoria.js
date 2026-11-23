// Grupos de categoria (comida, bebida, café) do Radar de Oportunidades
// (ADR-015, tarefas 1.5 e 2.5). Devolvem o `{ data, error }` do Supabase.

import { supabase } from "@/lib/supabase";

export function listarGruposCategoria() {
  return supabase.from("grupos_categoria").select("id,nome").order("id");
}

export function listarCategoriaGrupos() {
  return supabase.from("categoria_grupo").select("category,grupo_id");
}

export function removerGrupoDaCategoria(categoria) {
  return supabase.from("categoria_grupo").delete().eq("category", categoria);
}

export function definirGrupoDaCategoria(categoria, grupoId) {
  return supabase
    .from("categoria_grupo")
    .upsert({ category: categoria, grupo_id: grupoId, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,category" });
}
