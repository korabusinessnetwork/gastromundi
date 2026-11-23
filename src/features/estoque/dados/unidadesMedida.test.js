import { describe, it, expect } from "vitest";
import { contarProdutosComUnidade } from "./unidadesMedida";

describe("contarProdutosComUnidade", () => {
  const produtos = [
    { id: 1, unidade_estoque: "kg", unidade_consumo: null, unidades_compra: [] },
    { id: 2, unidade_estoque: "un", unidade_consumo: "kg", unidades_compra: [] },
    { id: 3, unidade_estoque: "un", unidade_consumo: null, unidades_compra: [{ unidade: "kg", fator: 1 }] },
    { id: 4, unidade_estoque: "un", unidade_consumo: null, unidades_compra: [{ unidade: "cx", fator: 12 }] },
    { id: 5, unidade_estoque: "un", unidade_consumo: null, unidades_compra: null },
  ];

  it("conta estoque, consumo e compra, sem contar o mesmo produto duas vezes", () => {
    expect(contarProdutosComUnidade(produtos, "kg")).toBe(3);
  });

  it("produto que não usa a unidade não conta, nem com lista de compra vazia ou nula", () => {
    expect(contarProdutosComUnidade(produtos, "cx")).toBe(1);
    expect(contarProdutosComUnidade(produtos, "lt")).toBe(0);
  });

  it("lista vazia ou nula dá zero", () => {
    expect(contarProdutosComUnidade([], "kg")).toBe(0);
    expect(contarProdutosComUnidade(null, "kg")).toBe(0);
  });
});
