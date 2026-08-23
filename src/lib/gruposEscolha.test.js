import { describe, it, expect, vi, beforeEach } from "vitest";

// A camada fala com o Supabase; o client é mockado para o teste rodar sem env
// e sem rede. `resolverOpcoes` é pura e não depende disso.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  carregarGruposDoProduto,
  carregarGruposDoCombo,
  carregarTodosGrupos,
  salvarGrupos,
  resolverOpcoes,
} from "./gruposEscolha";
import { supabase } from "./supabase";

/** Linha crua como o Supabase devolve (snake_case, itens aninhados). */
function linha(over = {}) {
  return {
    id: "g1",
    produto_id: 10,
    combo_id: null,
    nome: "Escolha o hambúrguer",
    minimo: 1,
    maximo: 1,
    origem: "lista",
    categoria: null,
    ordem: 0,
    grupo_escolha_itens: [],
    ...over,
  };
}

/** Só os inserts em `grupos_escolha`, na ordem em que saíram. */
function payloadsDeGrupo() {
  return supabase.calls
    .filter((c) => c.table === "grupos_escolha" && c.method === "insert")
    .map((c) => c.args[0]);
}

/** Só os inserts em `grupo_escolha_itens`, na ordem em que saíram. */
function payloadsDeItens() {
  return supabase.calls
    .filter((c) => c.table === "grupo_escolha_itens" && c.method === "insert")
    .map((c) => c.args[0]);
}

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
  // Insert de grupo precisa devolver o id, que vira `grupo_id` dos itens.
  supabase.setTableHandler("grupos_escolha", ({ method }) =>
    method === "insert" ? { data: { id: "novo-grupo" }, error: null } : undefined,
  );
});

describe("carregarGruposDoProduto / carregarGruposDoCombo", () => {
  it("não vai ao banco quando o dono não tem id (produto ainda não salvo)", async () => {
    for (const vazio of [null, undefined]) {
      expect(await carregarGruposDoProduto(vazio)).toEqual({ data: [], error: null });
      expect(await carregarGruposDoCombo(vazio)).toEqual({ data: [], error: null });
    }
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("filtra pela coluna do dono certo", async () => {
    await carregarGruposDoProduto(10);
    await carregarGruposDoCombo("c-9");
    const filtros = supabase.calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(filtros).toEqual([
      ["produto_id", 10],
      ["combo_id", "c-9"],
    ]);
  });

  it("normaliza a linha crua para o shape do app", async () => {
    supabase.setTableResult("grupos_escolha", {
      data: [
        linha({
          minimo: "2",
          maximo: "3",
          ordem: "1",
          grupo_escolha_itens: [
            { id: "i2", produto_id: 22, preco_customizado: "4.5", ordem: 1 },
            { id: "i1", produto_id: 11, preco_customizado: null, ordem: 0 },
          ],
        }),
      ],
      error: null,
    });

    const { data, error } = await carregarGruposDoProduto(10);

    expect(error).toBeNull();
    expect(data).toEqual([
      {
        id: "g1",
        nome: "Escolha o hambúrguer",
        minimo: 2,
        maximo: 3,
        origem: "lista",
        categoria: null,
        ordem: 1,
        // Ordenados por `ordem`, não pela ordem que vieram do banco.
        itens: [
          { id: "i1", produtoId: 11, preco: 0 },
          { id: "i2", produtoId: 22, preco: 4.5 },
        ],
      },
    ]);
  });

  it("qualquer origem que não seja exatamente 'categoria' vira 'lista'", async () => {
    supabase.setTableResult("grupos_escolha", {
      data: [linha({ id: "a", origem: "categoria" }), linha({ id: "b", origem: null }), linha({ id: "c", origem: "Categoria" })],
      error: null,
    });
    const { data } = await carregarGruposDoProduto(10);
    expect(data.map((g) => g.origem)).toEqual(["categoria", "lista", "lista"]);
  });

  it("preenche o que o banco deixou nulo, sem quebrar", async () => {
    supabase.setTableResult("grupos_escolha", {
      data: [{ id: "g1", grupo_escolha_itens: null }],
      error: null,
    });
    const { data } = await carregarGruposDoProduto(10);
    expect(data[0]).toEqual({
      id: "g1",
      nome: "",
      minimo: 1,
      maximo: 1,
      origem: "lista",
      categoria: null,
      ordem: 0,
      itens: [],
    });
  });

  it("erro do banco volta como error, com lista vazia — nunca lança", async () => {
    supabase.setTableError("grupos_escolha", new Error("sem conexão"));
    const { data, error } = await carregarGruposDoProduto(10);
    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("carregarTodosGrupos", () => {
  it("indexa por dono e ordena cada dono por `ordem` (carga única do PDV)", async () => {
    supabase.setTableResult("grupos_escolha", {
      data: [
        linha({ id: "p2", produto_id: 10, ordem: 2 }),
        linha({ id: "p1", produto_id: 10, ordem: 1 }),
        linha({ id: "outro", produto_id: 20, ordem: 0 }),
        linha({ id: "c2", produto_id: null, combo_id: "c-9", ordem: 5 }),
        linha({ id: "c1", produto_id: null, combo_id: "c-9", ordem: 0 }),
      ],
      error: null,
    });

    const { porProduto, porCombo, error } = await carregarTodosGrupos();

    expect(error).toBeNull();
    expect(porProduto[10].map((g) => g.id)).toEqual(["p1", "p2"]);
    expect(porProduto[20].map((g) => g.id)).toEqual(["outro"]);
    expect(porCombo["c-9"].map((g) => g.id)).toEqual(["c1", "c2"]);
    // Um grupo cai em exatamente um dos dois mapas.
    expect(porCombo[10]).toBeUndefined();
    expect(porProduto["c-9"]).toBeUndefined();
  });

  it("grupo órfão (sem produto e sem combo) é ignorado", async () => {
    supabase.setTableResult("grupos_escolha", {
      data: [linha({ id: "orfao", produto_id: null, combo_id: null })],
      error: null,
    });
    const { porProduto, porCombo } = await carregarTodosGrupos();
    expect(porProduto).toEqual({});
    expect(porCombo).toEqual({});
  });

  it("erro do banco volta com os dois mapas vazios", async () => {
    supabase.setTableError("grupos_escolha", new Error("timeout"));
    const { porProduto, porCombo, error } = await carregarTodosGrupos();
    expect(porProduto).toEqual({});
    expect(porCombo).toEqual({});
    expect(error).toBeInstanceOf(Error);
  });
});

describe("salvarGrupos", () => {
  it("exige um dono — sem produtoId nem comboId não escreve nada", async () => {
    const { error } = await salvarGrupos({ grupos: [{ nome: "X" }] });
    expect(error).toBeInstanceOf(Error);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("apaga os grupos atuais do dono antes de inserir os novos", async () => {
    await salvarGrupos({ produtoId: 10, grupos: [{ nome: "Pão", itens: [{ produtoId: 1 }] }] });

    const ordem = supabase.calls.filter((c) => ["delete", "insert"].includes(c.method));
    expect(ordem[0]).toMatchObject({ table: "grupos_escolha", method: "delete" });
    expect(ordem[1]).toMatchObject({ table: "grupos_escolha", method: "insert" });
    // O delete é escopado ao dono, não à tabela inteira.
    expect(supabase.calls.find((c) => c.method === "eq").args).toEqual(["produto_id", 10]);
  });

  it("delete que falha aborta antes de qualquer insert — senão o dono fica com grupos duplicados", async () => {
    supabase.setTableHandler("grupos_escolha", ({ method }) => {
      if (method === "delete") return { data: null, error: new Error("RLS negou") };
      return { data: { id: "novo-grupo" }, error: null };
    });

    const { error } = await salvarGrupos({ produtoId: 10, grupos: [{ nome: "Pão" }] });

    expect(error).toBeInstanceOf(Error);
    expect(payloadsDeGrupo()).toEqual([]);
  });

  it("erro ao inserir um grupo interrompe na hora, sem gravar os seguintes", async () => {
    let inseridos = 0;
    supabase.setTableHandler("grupos_escolha", ({ method }) => {
      if (method !== "insert") return undefined;
      inseridos += 1;
      return inseridos === 2
        ? { data: null, error: new Error("violação de constraint") }
        : { data: { id: `g${inseridos}` }, error: null };
    });

    const { error } = await salvarGrupos({
      produtoId: 10,
      grupos: [{ nome: "A" }, { nome: "B" }, { nome: "C" }],
    });

    expect(error).toBeInstanceOf(Error);
    expect(payloadsDeGrupo().map((p) => p.nome)).toEqual(["A", "B"]);
  });

  it("erro ao inserir os itens de um grupo também interrompe", async () => {
    supabase.setTableError("grupo_escolha_itens", new Error("fk inválida"));
    const { error } = await salvarGrupos({
      produtoId: 10,
      grupos: [{ nome: "A", itens: [{ produtoId: 1 }] }, { nome: "B" }],
    });
    expect(error).toBeInstanceOf(Error);
    expect(payloadsDeGrupo().map((p) => p.nome)).toEqual(["A"]);
  });

  it("grava a `ordem` pela posição no array, ignorando a que veio na tela", async () => {
    await salvarGrupos({
      produtoId: 10,
      grupos: [{ nome: "A", ordem: 99 }, { nome: "B", ordem: 99 }, { nome: "C" }],
    });
    expect(payloadsDeGrupo().map((p) => p.ordem)).toEqual([0, 1, 2]);
  });

  it("grupo sem nome vira 'Escolha' — o operador nunca vê rótulo em branco", async () => {
    await salvarGrupos({ produtoId: 10, grupos: [{ nome: "   " }, { nome: null }, { nome: " Bebida " }] });
    expect(payloadsDeGrupo().map((p) => p.nome)).toEqual(["Escolha", "Escolha", "Bebida"]);
  });

  it("mínimo nunca é negativo e máximo nunca fica abaixo do mínimo", async () => {
    await salvarGrupos({
      produtoId: 10,
      grupos: [
        { minimo: -5, maximo: 2 },
        { minimo: 3, maximo: 1 }, // máximo menor que o mínimo: impossível de satisfazer
        { minimo: 0, maximo: 0 }, // máximo 0 não deixaria escolher nada
        { minimo: "2", maximo: "4" },
        {}, // sem nada informado
      ],
    });
    expect(payloadsDeGrupo().map((p) => [p.minimo, p.maximo])).toEqual([
      [0, 2],
      [3, 3],
      [0, 1],
      [2, 4],
      [1, 1],
    ]);
  });

  it("grupo por categoria guarda a categoria e não grava itens", async () => {
    await salvarGrupos({
      produtoId: 10,
      grupos: [{ nome: "Bebida", origem: "categoria", categoria: "Drinks", itens: [{ produtoId: 1 }] }],
    });
    expect(payloadsDeGrupo()[0]).toMatchObject({ origem: "categoria", categoria: "Drinks" });
    expect(payloadsDeItens()).toEqual([]);
  });

  it("grupo por lista zera a categoria, mesmo se a tela mandar uma", async () => {
    await salvarGrupos({ produtoId: 10, grupos: [{ nome: "X", origem: "lista", categoria: "Drinks" }] });
    expect(payloadsDeGrupo()[0]).toMatchObject({ origem: "lista", categoria: null });
  });

  it("itens: descarta linha sem produto, renumera a ordem e só grava acréscimo maior que zero", async () => {
    await salvarGrupos({
      produtoId: 10,
      grupos: [
        {
          nome: "Hambúrguer",
          itens: [
            { produtoId: "11", preco: 0 },
            { produtoId: null, preco: 9 }, // linha em branco deixada na tela
            { produtoId: 22, preco: "3.5" },
            { produtoId: 33 }, // sem preço informado
          ],
        },
      ],
    });

    expect(payloadsDeItens()[0]).toEqual([
      { grupo_id: "novo-grupo", produto_id: 11, preco_customizado: null, ordem: 0 },
      { grupo_id: "novo-grupo", produto_id: 22, preco_customizado: 3.5, ordem: 1 },
      { grupo_id: "novo-grupo", produto_id: 33, preco_customizado: null, ordem: 2 },
    ]);
  });

  it("grupo de lista sem nenhum item válido não dispara insert de itens", async () => {
    await salvarGrupos({ produtoId: 10, grupos: [{ nome: "X", itens: [{ produtoId: null }] }] });
    expect(payloadsDeItens()).toEqual([]);
  });

  it("dono produto grava produto_id numérico e combo_id nulo", async () => {
    await salvarGrupos({ produtoId: "10", grupos: [{ nome: "X" }] });
    expect(payloadsDeGrupo()[0]).toMatchObject({ produto_id: 10, combo_id: null });
  });

  it("dono combo grava combo_id e produto_id nulo", async () => {
    await salvarGrupos({ comboId: "c-9", grupos: [{ nome: "X" }] });
    expect(payloadsDeGrupo()[0]).toMatchObject({ produto_id: null, combo_id: "c-9" });
  });

  it("lista vazia de grupos apaga tudo do dono e para por aí", async () => {
    const { error } = await salvarGrupos({ produtoId: 10, grupos: [] });
    expect(error).toBeNull();
    expect(supabase.calls.some((c) => c.method === "delete")).toBe(true);
    expect(payloadsDeGrupo()).toEqual([]);
  });
});

describe("resolverOpcoes", () => {
  const produtos = [
    { id: 1, name: "X-Burger", price: 20, emoji: "🍔", category: "Comidas", active: true },
    { id: 2, name: "X-Salada", price: 22, emoji: "🥗", category: "Comidas" },
    { id: 3, name: "Fora do cardápio", price: 5, category: "Comidas", active: false },
    { id: 4, name: "Coca", price: 8, emoji: "🥤", category: "Drinks" },
  ];

  it("sem grupo, sem opções", () => {
    expect(resolverOpcoes(null)).toEqual([]);
    expect(resolverOpcoes(undefined, produtos)).toEqual([]);
  });

  it("origem categoria devolve os produtos ativos daquela categoria, sem acréscimo", () => {
    const opcoes = resolverOpcoes({ origem: "categoria", categoria: "Comidas" }, produtos);
    expect(opcoes).toEqual([
      { produtoId: 1, nome: "X-Burger", preco: 0, emoji: "🍔" },
      { produtoId: 2, nome: "X-Salada", preco: 0, emoji: "🥗" },
    ]);
  });

  it("categoria sem produto ativo devolve vazio", () => {
    expect(resolverOpcoes({ origem: "categoria", categoria: "Sobremesas" }, produtos)).toEqual([]);
  });

  it("origem lista junta o item com o catálogo e mantém o acréscimo do item", () => {
    const grupo = {
      origem: "lista",
      itens: [
        { produtoId: 1, preco: 0 },
        { produtoId: "4", preco: 2.5 }, // id como string, como vem do banco às vezes
      ],
    };
    expect(resolverOpcoes(grupo, produtos)).toEqual([
      { produtoId: 1, nome: "X-Burger", preco: 0, emoji: "🍔" },
      { produtoId: "4", nome: "Coca", preco: 2.5, emoji: "🥤" },
    ]);
  });

  it("opção cujo produto sumiu do catálogo é descartada — não vira botão sem nome no PDV", () => {
    const grupo = { origem: "lista", itens: [{ produtoId: 1 }, { produtoId: 999 }] };
    expect(resolverOpcoes(grupo, produtos).map((o) => o.produtoId)).toEqual([1]);
  });

  it("catálogo ausente não quebra a lista", () => {
    expect(resolverOpcoes({ origem: "lista", itens: [{ produtoId: 1 }] })).toEqual([]);
    expect(resolverOpcoes({ origem: "categoria", categoria: "Comidas" }, null)).toEqual([]);
  });
});
