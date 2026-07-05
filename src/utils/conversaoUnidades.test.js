import { describe, it, expect } from "vitest";
import {
  getUnidadesCompra, compraParaEstoque, consumoParaEstoque, estoqueParaConsumo,
  labelConsumo, labelCompra, labelEstoque, temConversaoConsumo, temConversaoCompra, fmtQtd,
} from "./conversaoUnidades";

describe("getUnidadesCompra", () => {
  it("retorna unidades_compra quando presente", () => {
    const insumo = { unidades_compra: [{ unidade: "caixa", fator: 12 }] };
    expect(getUnidadesCompra(insumo)).toEqual([{ unidade: "caixa", fator: 12 }]);
  });

  it("cai para os campos legados quando unidades_compra está ausente", () => {
    const insumo = { unidade_compra: "fardo", fator_compra_estoque: 6, detalhamento_compra: "6 un" };
    expect(getUnidadesCompra(insumo)).toEqual([{ unidade: "fardo", fator: 6, detalhamento: "6 un" }]);
  });

  it("retorna array vazio quando não há unidade de compra configurada", () => {
    expect(getUnidadesCompra({})).toEqual([]);
  });
});

describe("compraParaEstoque / consumoParaEstoque (ida e volta)", () => {
  it("converte com fator inteiro", () => {
    expect(compraParaEstoque(2, { fator: 12 })).toBe(24);
  });

  it("fator 1 não altera a quantidade", () => {
    expect(compraParaEstoque(7, { fator: 1 })).toBe(7);
  });

  it("aceita fator fracionário", () => {
    expect(compraParaEstoque(1000, { fator: 0.001 })).toBeCloseTo(1, 5);
  });

  it("quantidade zero resulta em zero", () => {
    expect(compraParaEstoque(0, { fator: 12 })).toBe(0);
  });

  it("consumoParaEstoque e estoqueParaConsumo são inversas (ida e volta)", () => {
    const insumo = { fator_consumo_estoque: 0.5 };
    const estoque = consumoParaEstoque(10, insumo);
    expect(estoque).toBe(5);
    expect(estoqueParaConsumo(estoque, insumo)).toBe(10);
  });

  it("estoqueParaConsumo retorna 0 quando o fator é 0 (evita divisão por zero)", () => {
    expect(estoqueParaConsumo(10, { fator_consumo_estoque: 0 })).toBe(0);
  });
});

describe("labels e flags de conversão", () => {
  it("labelEstoque cai para unidade legada e depois para 'un'", () => {
    expect(labelEstoque({ unidade_estoque: "kg" })).toBe("kg");
    expect(labelEstoque({ unidade: "L" })).toBe("L");
    expect(labelEstoque({})).toBe("un");
  });

  it("labelConsumo cai para unidade de estoque quando não há consumo", () => {
    expect(labelConsumo({ unidade_consumo: "porção" })).toBe("porção");
    expect(labelConsumo({ unidade_estoque: "kg" })).toBe("kg");
  });

  it("labelCompra usa a primeira unidade de compra, senão a de estoque", () => {
    expect(labelCompra({ unidades_compra: [{ unidade: "caixa", fator: 12 }] })).toBe("caixa");
    expect(labelCompra({ unidade_estoque: "un" })).toBe("un");
  });

  it("temConversaoConsumo é true só quando a unidade de consumo difere da de estoque", () => {
    expect(temConversaoConsumo({ unidade_consumo: "porção", unidade_estoque: "kg" })).toBe(true);
    expect(temConversaoConsumo({ unidade_estoque: "kg" })).toBe(false);
    expect(temConversaoConsumo({ unidade_consumo: "kg", unidade_estoque: "kg" })).toBe(false);
  });

  it("temConversaoCompra reflete se há unidade de compra configurada", () => {
    expect(temConversaoCompra({ unidades_compra: [{ unidade: "caixa", fator: 12 }] })).toBe(true);
    expect(temConversaoCompra({})).toBe(false);
  });

  it("unidade desconhecida cai para o fallback 'un'", () => {
    expect(labelEstoque({ unidade_estoque: null, unidade: null })).toBe("un");
  });
});

describe("fmtQtd", () => {
  it("remove zeros à direita desnecessários", () => {
    expect(fmtQtd(2)).toBe("2");
    expect(fmtQtd(2.5)).toBe("2.5");
    expect(fmtQtd(2.100)).toBe("2.1");
  });

  it("trata null/undefined/NaN como '0'", () => {
    expect(fmtQtd(null)).toBe("0");
    expect(fmtQtd(undefined)).toBe("0");
    expect(fmtQtd(NaN)).toBe("0");
  });

  it("quantidade zero formata como '0'", () => {
    expect(fmtQtd(0)).toBe("0");
  });
});
