import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { planejarImportacaoProdutos, paraPayloadProduto } from "./produtos";

const itemPlanilha = (extra = {}) => ({
  linha: 2,
  nome: "X-Salada",
  preco: 24.9,
  categoria: "Lanches",
  emoji: "🍔",
  ativo: true,
  unidade: "un",
  ...extra,
});

describe("planejarImportacaoProdutos (idempotência por nome no tenant)", () => {
  it("sem existentes: tudo vai pra criar, categorias novas listadas", () => {
    const plano = planejarImportacaoProdutos([itemPlanilha()], []);
    expect(plano.criar).toHaveLength(1);
    expect(plano.atualizar).toEqual([]);
    expect(plano.categoriasNovas).toEqual(["Lanches"]);
  });

  it("casa por nome normalizado (caixa/acento) e atualiza só o que mudou", () => {
    const existente = { id: 7, name: "x-salada", price: 19.9, category: "Lanches", emoji: "🍔", active: true };
    const plano = planejarImportacaoProdutos([itemPlanilha()], [existente]);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([{ id: 7, nome: "X-Salada", changes: { price: 24.9 } }]);
    expect(plano.categoriasNovas).toEqual([]);
  });

  it("linha idêntica ao banco cai em iguais (rodar 2x não duplica nem regrava)", () => {
    const existente = { id: 7, name: "X-Salada", price: 24.9, category: "Lanches", emoji: "🍔", active: true };
    const plano = planejarImportacaoProdutos([itemPlanilha()], [existente]);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.iguais).toHaveLength(1);
  });

  it("emoji vazio na planilha não apaga o emoji existente", () => {
    const existente = { id: 7, name: "X-Salada", price: 24.9, category: "Lanches", emoji: "🍔", active: true };
    const plano = planejarImportacaoProdutos([itemPlanilha({ emoji: null })], [existente]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.iguais).toHaveLength(1);
  });

  it("categoria nova só entra uma vez mesmo repetida", () => {
    const plano = planejarImportacaoProdutos(
      [itemPlanilha(), itemPlanilha({ nome: "Outro", categoria: "lanches" })],
      []
    );
    expect(plano.categoriasNovas).toEqual(["Lanches"]);
  });
});

describe("paraPayloadProduto", () => {
  it("mapeia pro shape da tabela products — sem tenant_id (vem do JWT)", () => {
    expect(paraPayloadProduto(itemPlanilha())).toEqual({
      name: "X-Salada",
      price: 24.9,
      category: "Lanches",
      emoji: "🍔",
      active: true,
      unidade_estoque: "un",
    });
  });
});
