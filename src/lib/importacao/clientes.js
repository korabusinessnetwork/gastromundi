// ──────────────────────────────────────────────────────────────────
// Migração de dados — CLIENTES (Fase 2): aplicação do plano no
// Supabase (client autenticado do app — RLS isola o tenant; tenant_id
// NUNCA vem do arquivo).
//
// O planejamento (puro) vive em plano.js — compartilhado com a Edge
// Function importar-dados. Idempotência por telefone normalizado (só
// dígitos): rodar o mesmo arquivo duas vezes não duplica ninguém.
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { TAMANHO_LOTE, planejarImportacaoClientes, paraPayloadCliente } from "./plano";

export { planejarImportacaoClientes, paraPayloadCliente };

/**
 * Aplica o plano no banco, em lotes, reportando progresso. Para no
 * primeiro erro do Supabase (nada de meio-importado silencioso).
 * @param {ReturnType<typeof planejarImportacaoClientes>} plano
 * @param {(feitos:number, total:number) => void} [onProgresso]
 * @param {string} [usuario] - vai em criado_por (auditoria simples)
 * @returns {Promise<{criados:number, atualizados:number, error:object|null}>}
 */
export async function aplicarImportacaoClientes(plano, onProgresso, usuario) {
  const total = plano.criar.length + plano.atualizar.length;
  let feitos = 0;
  let criados = 0;
  let atualizados = 0;

  for (let i = 0; i < plano.criar.length; i += TAMANHO_LOTE) {
    const lote = plano.criar.slice(i, i + TAMANHO_LOTE).map((item) => paraPayloadCliente(item, usuario));
    const { error } = await supabase.from("clientes").insert(lote);
    if (error) return { criados, atualizados, error };
    criados += lote.length;
    feitos += lote.length;
    onProgresso?.(feitos, total);
  }

  for (const { id, changes } of plano.atualizar) {
    const { error } = await supabase
      .from("clientes")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { criados, atualizados, error };
    atualizados += 1;
    feitos += 1;
    if (feitos % 20 === 0 || feitos === total) onProgresso?.(feitos, total);
  }

  return { criados, atualizados, error: null };
}

/**
 * Busca os clientes do tenant pro plano/preview e pro export — campos
 * nomeados (regra do repo: nunca select * em tabela sensível).
 */
export async function buscarClientesParaMigracao() {
  return supabase
    .from("clientes")
    .select("id, nome, telefone, endereco, observacoes")
    .eq("anonimizado", false)
    .order("nome");
}
