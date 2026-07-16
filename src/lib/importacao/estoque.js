// ──────────────────────────────────────────────────────────────────
// Migração de dados — ESTOQUE INICIAL (Fase 2): plano de importação
// (puro) + aplicação no Supabase (client autenticado do app — RLS).
//
// A planilha traz o NOME do produto; o plano casa com o cardápio já
// cadastrado (nome normalizado) e vira upsert por produto_id — a
// tabela `estoque` tem PK em produto_id, então rodar o mesmo arquivo
// duas vezes não duplica nem soma nada (define, não incrementa).
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "./planilha";
import { TAMANHO_LOTE } from "./produtos";

/** Mínimo padrão quando o produto ainda não tem linha em `estoque` (DEFAULT do schema). */
export const MINIMO_PADRAO = 10;

/**
 * Monta o plano de importação (PURO — é o que o preview mostra).
 * Produto que não existe no cardápio vira erro apontado por linha
 * ("importe os produtos primeiro") — nunca cria produto por tabela.
 * @param {Array} itensPlanilha - saída de validarPlanilhaEstoque().itens
 * @param {Array<{id:number|string, name:string}>} produtosExistentes
 * @param {Array<{produto_id:number|string, quantidade:number, minimo:number}>} estoqueAtual
 * @returns {{definir:Array<{produto_id, nome, quantidade, minimo}>, iguais:Array, naoEncontrados:Array<{linha, mensagem}>}}
 */
export function planejarImportacaoEstoque(itensPlanilha, produtosExistentes, estoqueAtual) {
  const produtosPorNome = new Map(
    (produtosExistentes || []).map((p) => [normalizarTexto(p.name), p])
  );
  const estoquePorProduto = new Map(
    (estoqueAtual || []).map((e) => [String(e.produto_id), e])
  );

  const definir = [];
  const iguais = [];
  const naoEncontrados = [];

  for (const item of itensPlanilha || []) {
    const produto = produtosPorNome.get(normalizarTexto(item.produto));
    if (!produto) {
      naoEncontrados.push({
        linha: item.linha,
        mensagem: `"${item.produto}" não está no cardápio — importe/cadastre os produtos antes do estoque.`,
      });
      continue;
    }

    const atual = estoquePorProduto.get(String(produto.id));
    // Mínimo vazio na planilha mantém o atual (ou o padrão do sistema)
    const minimo = item.minimo ?? (atual ? Number(atual.minimo) : MINIMO_PADRAO);

    if (atual && Number(atual.quantidade) === item.quantidade && Number(atual.minimo) === minimo) {
      iguais.push(item);
    } else {
      definir.push({ produto_id: produto.id, nome: produto.name, quantidade: item.quantidade, minimo });
    }
  }

  return { definir, iguais, naoEncontrados };
}

/**
 * Aplica o plano no banco em lotes (upsert por produto_id), reportando
 * progresso. Para no primeiro erro do Supabase.
 * @param {ReturnType<typeof planejarImportacaoEstoque>} plano
 * @param {(feitos:number, total:number) => void} [onProgresso]
 * @returns {Promise<{definidos:number, error:object|null}>}
 */
export async function aplicarImportacaoEstoque(plano, onProgresso) {
  const total = plano.definir.length;
  let definidos = 0;

  for (let i = 0; i < plano.definir.length; i += TAMANHO_LOTE) {
    const lote = plano.definir.slice(i, i + TAMANHO_LOTE).map(({ produto_id, quantidade, minimo }) => ({
      produto_id,
      quantidade,
      minimo,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("estoque").upsert(lote, { onConflict: "produto_id" });
    if (error) return { definidos, error };
    definidos += lote.length;
    onProgresso?.(definidos, total);
  }

  return { definidos, error: null };
}

/**
 * Busca o estoque do tenant com o nome do produto (pro export e pro
 * plano) — campos nomeados, join pela FK produto_id → products.
 */
export async function buscarEstoqueParaMigracao() {
  return supabase
    .from("estoque")
    .select("produto_id, quantidade, minimo, products(name)")
    .order("produto_id");
}

/** Achata o resultado do join no shape do CSV de export ({produto, quantidade, minimo}). */
export function paraLinhasExportEstoque(linhas) {
  return (linhas || [])
    .filter((e) => e.products?.name)
    .map((e) => ({ produto: e.products.name, quantidade: Number(e.quantidade), minimo: Number(e.minimo) }));
}
