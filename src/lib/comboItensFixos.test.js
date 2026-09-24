import { describe, it, expect, vi, beforeEach } from "vitest";

// A camada fala com o Supabase; o client é mockado para o teste rodar sem
// env e sem rede. As duas funções puras não dependem disso.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  carregarItensFixos,
  carregarTodosItensFixos,
  salvarItensFixos,
  resolverItensFixos,
  resumoItensFixos,
} from "./comboItensFixos";
import { supabase } from "./supabase";

const PRODUTOS = [
  { id: 1, name: "Batata frita", price: 12, emoji: "🍟" },
  { id: 2, name: "Refrigerante", price: 8, emoji: "🥤" },
];

beforeEach(() => {
  vi.clearAllMocks();
  supabase.reset?.();
});

describe("carregarItensFixos", () => {
  it("normaliza a linha crua para o shape do app", async () => {
    supabase.setTableResult("combo_produtos", {
      data: [{ id: "cp1", combo_id: "c1", produto_id: 1, quantidade: 2, preco_customizado: null }],
      error: null,
    });

    const { data } = await carregarItensFixos("c1");

    expect(data).toEqual([{ id: "cp1", produtoId: 1, quantidade: 2, preco: 0 }]);
  });

  it("quantidade ausente ou inválida vira 1 — item fixo sempre vem ao menos uma vez", async () => {
    supabase.setTableResult("combo_produtos", {
      data: [
        { id: "a", produto_id: 1, quantidade: null },
        { id: "b", produto_id: 2, quantidade: 0 },
      ],
      error: null,
    });

    const { data } = await carregarItensFixos("c1");

    expect(data.map((i) => i.quantidade)).toEqual([1, 1]);
  });

  it("sem combo não chama o banco", async () => {
    const { data, error } = await carregarItensFixos(null);
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(supabase.calls).toHaveLength(0);
  });

  it("erro do banco volta como error, com lista vazia — nunca lança", async () => {
    supabase.setTableError("combo_produtos", new Error("sem conexão"));
    const { data, error } = await carregarItensFixos("c1");
    expect(data).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("carregarTodosItensFixos", () => {
  it("indexa por combo (carga única do PDV, sem N+1)", async () => {
    supabase.setTableResult("combo_produtos", {
      data: [
        { id: "a", combo_id: "c1", produto_id: 1, quantidade: 1 },
        { id: "b", combo_id: "c1", produto_id: 2, quantidade: 1 },
        { id: "c", combo_id: "c2", produto_id: 1, quantidade: 3 },
      ],
      error: null,
    });

    const { porCombo } = await carregarTodosItensFixos();

    expect(porCombo.c1).toHaveLength(2);
    expect(porCombo.c2[0].quantidade).toBe(3);
  });
});

describe("salvarItensFixos", () => {
  it("apaga os atuais antes de inserir os novos", async () => {
    supabase.setTableResult("combo_produtos", { data: [], error: null });

    await salvarItensFixos({ comboId: "c1", itens: [{ produtoId: 1, quantidade: 2 }] });

    const metodos = supabase.calls.filter((c) => c.table === "combo_produtos").map((c) => c.method);
    expect(metodos.indexOf("delete")).toBeLessThan(metodos.indexOf("insert"));
  });

  it("se o delete falhar, NÃO insere — o item duplicado baixaria estoque duas vezes", async () => {
    supabase.setTableError("combo_produtos", new Error("sem conexão"));

    const { error } = await salvarItensFixos({ comboId: "c1", itens: [{ produtoId: 1 }] });

    expect(error).toBeInstanceOf(Error);
    expect(supabase.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("preço zerado grava null — o item já está embutido no preço do combo", async () => {
    supabase.setTableResult("combo_produtos", { data: [], error: null });

    await salvarItensFixos({ comboId: "c1", itens: [{ produtoId: 1, preco: 0 }] });

    const insert = supabase.calls.find((c) => c.method === "insert");
    expect(insert.args[0][0].preco_customizado).toBeNull();
  });

  it("lista vazia apaga tudo e não insere nada", async () => {
    supabase.setTableResult("combo_produtos", { data: [], error: null });

    const { error } = await salvarItensFixos({ comboId: "c1", itens: [] });

    expect(error).toBeNull();
    expect(supabase.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("sem comboId devolve erro em vez de apagar algo por engano", async () => {
    const { error } = await salvarItensFixos({ itens: [{ produtoId: 1 }] });
    expect(error).toBeInstanceOf(Error);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("resolverItensFixos", () => {
  it("vira escolha de preço zero, para reusar baixa de estoque e impressão", () => {
    const escolhas = resolverItensFixos([{ produtoId: 1, quantidade: 2 }], PRODUTOS);

    expect(escolhas).toEqual([
      { produtoId: 1, nome: "Batata frita", qtd: 2, preco: 0, grupoId: "fixos", regra: "soma", fixo: true },
    ]);
  });

  it("preço zero NÃO soma ao combo — o item já está no preço total", () => {
    const escolhas = resolverItensFixos([{ produtoId: 1 }, { produtoId: 2 }], PRODUTOS);
    expect(escolhas.reduce((s, e) => s + e.preco * e.qtd, 0)).toBe(0);
  });

  it("preço customizado é respeitado, para o item fixo que cobra à parte", () => {
    const escolhas = resolverItensFixos([{ produtoId: 1, preco: 5 }], PRODUTOS);
    expect(escolhas[0].preco).toBe(5);
  });

  it("item cujo produto sumiu do catálogo é descartado", () => {
    // Imprimir "produto removido" na via de produção não ajuda a cozinha.
    const escolhas = resolverItensFixos([{ produtoId: 99 }, { produtoId: 1 }], PRODUTOS);
    expect(escolhas.map((e) => e.produtoId)).toEqual([1]);
  });

  it("a regra é sempre 'soma', para não interferir num grupo de sabores", () => {
    // Com 'maior', um item fixo de R$ 0 entraria no mesmo balde dos sabores
    // e poderia zerar a conta da pizza.
    const escolhas = resolverItensFixos([{ produtoId: 1 }], PRODUTOS);
    expect(escolhas[0]).toMatchObject({ grupoId: "fixos", regra: "soma" });
  });

  it("lista vazia ou inválida não quebra", () => {
    expect(resolverItensFixos([], PRODUTOS)).toEqual([]);
    expect(resolverItensFixos(null, PRODUTOS)).toEqual([]);
    expect(resolverItensFixos([{ produtoId: 1 }], [])).toEqual([]);
  });
});

describe("resumoItensFixos", () => {
  it("um item só sai sem vírgula nem 'e'", () => {
    expect(resumoItensFixos([{ nome: "Batata frita", qtd: 1 }])).toBe("Batata frita");
  });

  it("dois itens saem ligados por 'e'", () => {
    expect(resumoItensFixos([{ nome: "Batata", qtd: 1 }, { nome: "Refri", qtd: 1 }]))
      .toBe("Batata e Refri");
  });

  it("três ou mais usam vírgula até o último", () => {
    expect(resumoItensFixos([
      { nome: "Batata", qtd: 1 }, { nome: "Refri", qtd: 1 }, { nome: "Sobremesa", qtd: 1 },
    ])).toBe("Batata, Refri e Sobremesa");
  });

  it("quantidade maior que 1 aparece na frente do nome", () => {
    expect(resumoItensFixos([{ nome: "Batata", qtd: 2 }])).toBe("2× Batata");
  });

  it("sem item nenhum devolve string vazia, para a tela não mostrar rótulo solto", () => {
    expect(resumoItensFixos([])).toBe("");
    expect(resumoItensFixos(null)).toBe("");
  });
});
