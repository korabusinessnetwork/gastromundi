// ──────────────────────────────────────────────────────────────────
// Migração de dados — CLIENTES (Fase 2): plano de importação (puro) +
// aplicação no Supabase (client autenticado do app — RLS isola o
// tenant; tenant_id NUNCA vem do arquivo).
//
// Idempotência por telefone normalizado (só dígitos) — a mesma chave
// de dedupe do cadastro na tela. Rodar o mesmo arquivo duas vezes não
// duplica ninguém.
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { normalizarTelefone } from "./planilha";
import { TAMANHO_LOTE } from "./produtos";

/**
 * Monta o plano de importação (PURO — é o que o preview mostra).
 * Campos opcionais vazios na planilha nunca apagam o que já existe.
 * @param {Array} clientesPlanilha - saída de validarPlanilhaClientes().clientes
 * @param {Array<{id:string, nome:string, telefone?:string, endereco?:string, observacoes?:string}>} clientesExistentes
 * @returns {{criar:Array, atualizar:Array<{id, nome, changes}>, iguais:Array}}
 */
export function planejarImportacaoClientes(clientesPlanilha, clientesExistentes) {
  const existentesPorTelefone = new Map();
  for (const c of clientesExistentes || []) {
    const tel = normalizarTelefone(c.telefone);
    if (tel && !existentesPorTelefone.has(tel)) existentesPorTelefone.set(tel, c);
  }

  const criar = [];
  const atualizar = [];
  const iguais = [];

  for (const item of clientesPlanilha || []) {
    const existente = existentesPorTelefone.get(item.telefone);
    if (!existente) {
      criar.push(item);
      continue;
    }

    const changes = {};
    if (item.nome !== existente.nome) changes.nome = item.nome;
    if (item.endereco && (existente.endereco || null) !== item.endereco) changes.endereco = item.endereco;
    if (item.observacoes && (existente.observacoes || null) !== item.observacoes) changes.observacoes = item.observacoes;

    if (Object.keys(changes).length === 0) iguais.push(item);
    else atualizar.push({ id: existente.id, nome: item.nome, changes });
  }

  return { criar, atualizar, iguais };
}

/** Converte um item da planilha no payload da tabela `clientes`. */
export function paraPayloadCliente(item, usuario) {
  return {
    nome: item.nome,
    telefone: item.telefone,
    endereco: item.endereco,
    observacoes: item.observacoes,
    criado_por: usuario ?? null,
  };
}

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
