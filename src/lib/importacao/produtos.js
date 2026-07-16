// ──────────────────────────────────────────────────────────────────
// Migração de dados — PRODUTOS: plano de importação (puro) + aplicação
// no Supabase (client autenticado do app — a RLS isola o tenant e o
// tenant_id nasce do DEFAULT tenant_atual_id(); NUNCA vem do arquivo).
//
// `products` não tem unique em name (nome só é único DENTRO do tenant),
// então idempotência é por casamento de nome normalizado no código:
// existe → UPDATE por id; não existe → INSERT. Rodar o mesmo arquivo
// duas vezes não duplica nada.
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "./planilha";

export const TAMANHO_LOTE = 200;

/**
 * Monta o plano de importação (PURO — é o que o preview mostra).
 * @param {Array} produtosPlanilha - saída de validarPlanilhaProdutos().produtos
 * @param {Array<{id:number|string, name:string, price:number, category:string, emoji?:string, active?:boolean, unidade_estoque?:string}>} produtosExistentes
 * @returns {{criar:Array, atualizar:Array<{id, changes, nome}>, iguais:Array, categoriasNovas:string[]}}
 */
export function planejarImportacaoProdutos(produtosPlanilha, produtosExistentes) {
  const existentesPorNome = new Map(
    (produtosExistentes || []).map((p) => [normalizarTexto(p.name), p])
  );
  const categoriasExistentes = new Set(
    (produtosExistentes || []).map((p) => normalizarTexto(p.category))
  );

  const criar = [];
  const atualizar = [];
  const iguais = [];
  const categoriasNovas = new Map();

  for (const item of produtosPlanilha || []) {
    if (!categoriasExistentes.has(normalizarTexto(item.categoria)) &&
        !categoriasNovas.has(normalizarTexto(item.categoria))) {
      categoriasNovas.set(normalizarTexto(item.categoria), item.categoria);
    }

    const existente = existentesPorNome.get(normalizarTexto(item.nome));
    if (!existente) {
      criar.push(item);
      continue;
    }

    const changes = {};
    if (Number(existente.price) !== item.preco) changes.price = item.preco;
    if ((existente.category || "") !== item.categoria) changes.category = item.categoria;
    if (item.emoji && (existente.emoji || null) !== item.emoji) changes.emoji = item.emoji;
    if (Boolean(existente.active) !== item.ativo) changes.active = item.ativo;

    if (Object.keys(changes).length === 0) iguais.push(item);
    else atualizar.push({ id: existente.id, nome: item.nome, changes });
  }

  return { criar, atualizar, iguais, categoriasNovas: [...categoriasNovas.values()] };
}

/** Converte um item da planilha no payload da tabela `products`. */
export function paraPayloadProduto(item) {
  return {
    name: item.nome,
    price: item.preco,
    category: item.categoria,
    emoji: item.emoji,
    active: item.ativo,
    unidade_estoque: item.unidade || "un",
  };
}

/**
 * Aplica o plano no banco, em lotes, reportando progresso. Para no
 * primeiro erro do Supabase (nada de meio-importado silencioso).
 * @param {ReturnType<typeof planejarImportacaoProdutos>} plano
 * @param {(feitos:number, total:number) => void} [onProgresso]
 * @returns {Promise<{criados:number, atualizados:number, error:object|null}>}
 */
export async function aplicarImportacaoProdutos(plano, onProgresso) {
  const total = plano.criar.length + plano.atualizar.length;
  let feitos = 0;
  let criados = 0;
  let atualizados = 0;

  for (let i = 0; i < plano.criar.length; i += TAMANHO_LOTE) {
    const lote = plano.criar.slice(i, i + TAMANHO_LOTE).map(paraPayloadProduto);
    const { error } = await supabase.from("products").insert(lote);
    if (error) return { criados, atualizados, error };
    criados += lote.length;
    feitos += lote.length;
    onProgresso?.(feitos, total);
  }

  // UPDATE é por id (sem unique em name não há upsert confiável)
  for (const { id, changes } of plano.atualizar) {
    const { error } = await supabase.from("products").update(changes).eq("id", id);
    if (error) return { criados, atualizados, error };
    atualizados += 1;
    feitos += 1;
    if (feitos % 20 === 0 || feitos === total) onProgresso?.(feitos, total);
  }

  return { criados, atualizados, error: null };
}

/**
 * Busca os produtos do tenant pro plano/preview e pro export — campos
 * nomeados (regra do repo: nunca select * fora do bootstrap).
 */
export async function buscarProdutosParaMigracao() {
  return supabase
    .from("products")
    .select("id, name, price, category, emoji, active, unidade_estoque")
    .order("category")
    .order("name");
}
