import { supabase } from "./supabase";

/**
 * Grupos de escolha — leitura e escrita (Supabase).
 *
 * Um "grupo de escolha" é a abstração única por trás de duas telas:
 * PRODUTO COM SELEÇÃO (grupo pertence a um produto) e COMBO FLEXÍVEL
 * (grupo pertence a um combo). Ver src/lib/combos.js para o lado puro.
 *
 * Shape do grupo no app (o que o editor e o seletor consomem):
 *   {
 *     id,        // uuid da linha (ou undefined em grupo novo, ainda não salvo)
 *     nome,      // rótulo mostrado ao operador ("Escolha o hambúrguer")
 *     minimo,    // quantas opções o cliente PRECISA escolher
 *     maximo,    // quantas opções o cliente PODE escolher
 *     origem,    // 'lista' (opções fixas) | 'categoria' (todos da categoria)
 *     categoria, // nome da categoria quando origem='categoria'
 *     ordem,     // posição do grupo
 *     itens: [{ id, produtoId, preco }]  // opções quando origem='lista'
 *   }
 *
 * `preco` de um item é o ACRÉSCIMO (R$) que aquela opção soma ao preço
 * base — 0 quando a opção não muda o preço. Persistido em
 * grupo_escolha_itens.preco_customizado.
 *
 * A RLS já isola por tenant (multitenant fase 2) — não se filtra tenant
 * aqui. Nunca lança: erro vira `{ ..., error }`.
 */

const SEL_GRUPO =
  "id, produto_id, combo_id, nome, minimo, maximo, origem, categoria, ordem, " +
  "grupo_escolha_itens(id, produto_id, preco_customizado, ordem)";

function mapGrupo(row) {
  return {
    id: row.id,
    nome: row.nome ?? "",
    minimo: Number(row.minimo ?? 1),
    maximo: Number(row.maximo ?? 1),
    origem: row.origem === "categoria" ? "categoria" : "lista",
    categoria: row.categoria ?? null,
    ordem: Number(row.ordem ?? 0),
    itens: (row.grupo_escolha_itens ?? [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((i) => ({
        id: i.id,
        produtoId: i.produto_id,
        preco: Number(i.preco_customizado ?? 0) || 0,
      })),
  };
}

/**
 * Carrega os grupos de um dono (produto OU combo). Passe exatamente um id.
 * @returns {Promise<{data: Array<object>, error: (Error|null)}>}
 */
async function carregarPorDono(coluna, valor) {
  if (valor == null) return { data: [], error: null };
  const { data, error } = await supabase
    .from("grupos_escolha")
    .select(SEL_GRUPO)
    .eq(coluna, valor)
    .order("ordem");
  if (error) return { data: [], error };
  return { data: (data ?? []).map(mapGrupo), error: null };
}

export function carregarGruposDoProduto(produtoId) {
  return carregarPorDono("produto_id", produtoId);
}

export function carregarGruposDoCombo(comboId) {
  return carregarPorDono("combo_id", comboId);
}

/**
 * Carrega TODOS os grupos do tenant de uma vez (uso do PDV), já indexados
 * por dono. Evita N+1 ao montar a grade de produtos/combos.
 * @returns {Promise<{porProduto: object, porCombo: object, error: (Error|null)}>}
 */
export async function carregarTodosGrupos() {
  const { data, error } = await supabase
    .from("grupos_escolha")
    .select(SEL_GRUPO)
    .order("ordem");
  if (error) return { porProduto: {}, porCombo: {}, error };

  const porProduto = {};
  const porCombo = {};
  for (const row of data ?? []) {
    const g = mapGrupo(row);
    if (row.produto_id != null) (porProduto[row.produto_id] ??= []).push(g);
    else if (row.combo_id != null) (porCombo[row.combo_id] ??= []).push(g);
  }
  for (const mapa of [porProduto, porCombo]) {
    for (const k of Object.keys(mapa)) mapa[k].sort((a, b) => a.ordem - b.ordem);
  }
  return { porProduto, porCombo, error: null };
}

/**
 * Substitui os grupos de um dono (produto OU combo) pelos fornecidos:
 * apaga os atuais e insere os novos. O delete É conferido — se ele falha
 * e os inserts seguem, o dono fica com grupos duplicados (o cliente
 * escolheria duas vezes a mesma coisa). Os itens somem em cascata.
 *
 * @param {{produtoId?: (number|string), comboId?: string, grupos: Array<object>}} params
 * @returns {Promise<{error: (Error|null)}>}
 */
export async function salvarGrupos({ produtoId = null, comboId = null, grupos = [] }) {
  const coluna = produtoId != null ? "produto_id" : "combo_id";
  const valor = produtoId != null ? produtoId : comboId;
  if (valor == null) return { error: new Error("salvarGrupos: informe produtoId ou comboId.") };

  const { error: errDel } = await supabase.from("grupos_escolha").delete().eq(coluna, valor);
  if (errDel) return { error: errDel };

  for (let gi = 0; gi < grupos.length; gi++) {
    const g = grupos[gi];
    const origem = g.origem === "categoria" ? "categoria" : "lista";
    const minimo = Math.max(0, Number(g.minimo ?? 1) || 0);
    const maximoBruto = Math.max(1, Number(g.maximo ?? 1) || 1);
    const payload = {
      produto_id: produtoId != null ? Number(produtoId) : null,
      combo_id: comboId != null ? comboId : null,
      nome: (g.nome ?? "").trim() || "Escolha",
      minimo,
      maximo: Math.max(maximoBruto, minimo),
      origem,
      categoria: origem === "categoria" ? (g.categoria ?? null) : null,
      ordem: gi,
    };
    const { data: grupoRow, error: errG } = await supabase
      .from("grupos_escolha")
      .insert(payload)
      .select("id")
      .single();
    if (errG) return { error: errG };

    if (origem === "lista") {
      const itensPayload = (g.itens ?? [])
        .filter((it) => it.produtoId != null)
        .map((it, idx) => ({
          grupo_id: grupoRow.id,
          produto_id: Number(it.produtoId),
          preco_customizado: Number(it.preco) > 0 ? Number(it.preco) : null,
          ordem: idx,
        }));
      if (itensPayload.length > 0) {
        const { error: errI } = await supabase.from("grupo_escolha_itens").insert(itensPayload);
        if (errI) return { error: errI };
      }
    }
  }
  return { error: null };
}

/**
 * Resolve as OPÇÕES concretas de um grupo (produtos reais escolhíveis),
 * juntando o grupo com o catálogo de produtos já carregado. Puro — não
 * chama o Supabase. Usado pelo seletor do PDV.
 *
 * @param {object} grupo - grupo no shape do app
 * @param {Array<object>} products - catálogo ({ id, name, price, emoji, category, active })
 * @returns {Array<{produtoId, nome, preco, emoji}>} preco = acréscimo da opção
 */
export function resolverOpcoes(grupo, products = []) {
  if (!grupo) return [];
  if (grupo.origem === "categoria") {
    return (products ?? [])
      .filter((p) => p.active !== false && p.category === grupo.categoria)
      .map((p) => ({ produtoId: p.id, nome: p.name ?? "", preco: 0, emoji: p.emoji }));
  }
  const porId = new Map((products ?? []).map((p) => [String(p.id), p]));
  return (grupo.itens ?? [])
    .map((it) => {
      const p = porId.get(String(it.produtoId));
      return {
        produtoId: it.produtoId,
        nome: p?.name ?? "",
        preco: Number(it.preco ?? 0) || 0,
        emoji: p?.emoji,
      };
    })
    .filter((o) => o.nome); // descarta opção cujo produto sumiu do catálogo
}
