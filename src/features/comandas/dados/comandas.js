// Comandas em aberto, tabela `pending` (ADR-015, tarefas 1.5 e 2.6 do plano
// de refatoração). Devolvem o `{ data, error }` do Supabase sem interpretar: o
// contexto decide o que é falha de rede (vai para a fila offline), coluna
// ausente (migration não aplicada) ou recusa.

import { supabase } from "@/lib/supabase";

export function listarComandas(colunas) {
  return supabase.from("pending").select(colunas).order("created_at", { ascending: false });
}

export function inserirComanda(linha) {
  return supabase.from("pending").insert(linha);
}

/** Reenvio da fila offline: upsert por id, para reenviar não duplicar. */
export function regravarComanda(linha) {
  return supabase.from("pending").upsert(linha, { onConflict: "id" });
}

export function atualizarComanda(id, campos) {
  return supabase.from("pending").update(campos).eq("id", id);
}

export function excluirComanda(id) {
  return supabase.from("pending").delete().eq("id", id);
}

/**
 * TD013, gravação atômica dos itens: o Postgres lê, mescla e grava numa
 * transação só, com a linha travada (migration 20260922). `baseUids` são os
 * uids do snapshot de onde a tela derivou `items`.
 */
export function gravarItensComanda({ id, items, baseUids, total }) {
  return supabase.rpc("gravar_itens_comanda", {
    p_id: id,
    p_items: items,
    p_base_uids: baseUids,
    p_total: total,
  });
}

/** Os itens como estão no banco agora, para mesclar com a edição local. */
export function lerItensDaComanda(id) {
  return supabase.from("pending").select("items").eq("id", id).maybeSingle();
}

// ── Trava de edição (uma pessoa por vez numa comanda) ─────────────────

/**
 * Pega a trava se ela está livre, já é de `usuario`, ou venceu antes de
 * `limiteExpiradaIso`. Sem linha de volta quer dizer que outra pessoa segura.
 */
export function adquirirTravaDaComanda(id, { usuario, nome, agoraIso, limiteExpiradaIso }) {
  return supabase.from("pending")
    .update({ editando_por: usuario, editando_nome: nome, editando_desde: agoraIso })
    .eq("id", id)
    .or(`editando_por.is.null,editando_por.eq.${usuario},editando_desde.lt.${limiteExpiradaIso}`)
    .select("id,editando_por,editando_nome,editando_desde")
    .maybeSingle();
}

export function lerDonoDaTrava(id) {
  return supabase.from("pending").select("editando_nome,editando_por,editando_desde").eq("id", id).maybeSingle();
}

/** Só solta a trava que é de `usuario`. */
export function liberarTravaDaComanda(id, usuario) {
  return supabase.from("pending")
    .update({ editando_por: null, editando_nome: null, editando_desde: null })
    .eq("id", id)
    .eq("editando_por", usuario);
}

/**
 * Tempo real das comandas entre o garçom e o caixa. `aoMudar` recebe o payload
 * do postgres_changes. Devolve a função que cancela a assinatura.
 */
export function assinarComandas(aoMudar) {
  const canal = supabase
    .channel("pending-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "pending" }, aoMudar)
    .subscribe();
  return () => { supabase.removeChannel(canal); };
}
