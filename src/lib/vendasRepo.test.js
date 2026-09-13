import { describe, it, expect, vi, beforeEach } from "vitest";

// Camada de leitura do Supabase: o client é mockado para o teste rodar sem env
// e sem rede.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { buscarVendaCompleta } from "./vendasRepo";
import { supabase } from "./supabase";

const CABECALHO = {
  id: "v-1",
  comanda: "12",
  mesa: null,
  subtotal: 100,
  taxa_servico: true,
  valor_taxa: 10,
  valor_ajuste: -5,
  total: 105,
  cashier: "Ana",
  at: "2026-08-23T18:00:00.000Z",
};

function prepararVendaCompleta() {
  supabase.setTableResult("vendas", { data: CABECALHO, error: null });
  supabase.setTableResult("venda_itens", {
    data: [
      { venda_id: "v-1", product_id: 7, nome: "X-Burger", preco: 20, qtd: 2, cancelado: false },
      {
        venda_id: "v-1",
        product_id: 8,
        nome: "Coca",
        preco: 8,
        qtd: 1,
        cancelado: true,
        motivo_cancelamento: "cliente desistiu",
        cancelado_por: "Gerente",
      },
    ],
    error: null,
  });
  supabase.setTableResult("venda_pagamentos", {
    data: [
      { venda_id: "v-1", metodo: "dinheiro", valor: 50 },
      { venda_id: "v-1", metodo: "pix", valor: 55 },
    ],
    error: null,
  });
}

/** Colunas pedidas em cada tabela, por `select`. */
function colunasSelecionadas(tabela) {
  return supabase.calls.find((c) => c.table === tabela && c.method === "select")?.args[0] ?? "";
}

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
});

describe("buscarVendaCompleta", () => {
  it("sem id não vai ao banco", async () => {
    for (const vazio of [null, undefined, "", 0]) {
      expect(await buscarVendaCompleta(vazio)).toEqual({ data: null, error: null });
    }
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("monta a venda no shape que o cupom já consome (cabeçalho + itens + pagamentos)", async () => {
    prepararVendaCompleta();

    const { data, error } = await buscarVendaCompleta("v-1");

    expect(error).toBeNull();
    expect(data).toEqual({
      id: "v-1",
      comanda: "12",
      mesa: null,
      subtotal: 100,
      taxaServico: true,
      valorTaxa: 10,
      valorAjuste: -5,
      total: 105,
      cashier: "Ana",
      clienteId: null,
      at: "2026-08-23T18:00:00.000Z",
      items: [
        { id: 7, name: "X-Burger", price: 20, qty: 2, cancelado: false, motivoCancelamento: null, canceladoPor: null },
        { id: 8, name: "Coca", price: 8, qty: 1, cancelado: true, motivoCancelamento: "cliente desistiu", canceladoPor: "Gerente" },
      ],
      pagamentos: [
        { metodo: "dinheiro", valor: 50 },
        { metodo: "pix", valor: 55 },
      ],
    });
  });

  it("lê as três tabelas filtrando pelo id da venda", async () => {
    prepararVendaCompleta();
    await buscarVendaCompleta("v-1");

    const tabelas = supabase.from.mock.calls.map(([t]) => t);
    expect(tabelas).toEqual(["vendas", "venda_itens", "venda_pagamentos"]);
    expect(supabase.calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
      ["id", "v-1"],
      ["venda_id", "v-1"],
      ["venda_id", "v-1"],
    ]);
  });

  it("pede colunas nomeadas, nunca `select *` (venda é dado sensível)", async () => {
    prepararVendaCompleta();
    await buscarVendaCompleta("v-1");

    for (const tabela of ["vendas", "venda_itens", "venda_pagamentos"]) {
      const colunas = colunasSelecionadas(tabela);
      expect(colunas).not.toContain("*");
      expect(colunas.length).toBeGreaterThan(0);
    }
    expect(colunasSelecionadas("vendas")).toContain("total");
  });

  it("venda que não existe devolve nulo sem erro — não é falha, é ausência", async () => {
    supabase.setTableResult("vendas", { data: null, error: null });
    const { data, error } = await buscarVendaCompleta("v-inexistente");
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("venda sem itens e sem pagamentos ainda remonta o cabeçalho", async () => {
    supabase.setTableResult("vendas", { data: CABECALHO, error: null });
    supabase.setTableResult("venda_itens", { data: null, error: null });
    supabase.setTableResult("venda_pagamentos", { data: null, error: null });

    const { data, error } = await buscarVendaCompleta("v-1");

    expect(error).toBeNull();
    expect(data.id).toBe("v-1");
    expect(data.items).toEqual([]);
    expect(data.pagamentos).toEqual([]);
  });

  it.each(["vendas", "venda_itens", "venda_pagamentos"])(
    "erro em %s aborta a montagem — cupom pela metade seria pior que nenhum",
    async (tabela) => {
      prepararVendaCompleta();
      supabase.setTableError(tabela, new Error(`falha em ${tabela}`));

      const { data, error } = await buscarVendaCompleta("v-1");

      expect(data).toBeNull();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(tabela);
    },
  );

  it("exceção inesperada do client vira error — a função nunca lança", async () => {
    supabase.from.mockImplementationOnce(() => {
      throw new Error("rede caiu");
    });

    const { data, error } = await buscarVendaCompleta("v-1");

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("rede caiu");
  });
});
