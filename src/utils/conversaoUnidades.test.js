import { describe, it, expect } from "vitest";
import {
  getUnidadesCompra, compraParaEstoque, consumoParaEstoque, estoqueParaConsumo,
  labelConsumo, labelCompra, labelEstoque, temConversaoConsumo, temConversaoCompra, fmtQtd,
  arredondarQtd,
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

/**
 * Leva 5 — o resultado da conversão vai direto para o saldo no banco, então
 * sujeira de ponto flutuante não é detalhe de exibição: é o saldo do estoque.
 */
describe("arredondarQtd", () => {
  it("mata a sujeira binária da multiplicação", () => {
    // Números que realmente saem errado em JS.
    expect(arredondarQtd(3 * 0.35)).toBe(1.05);   // 1.0499999999999998
    expect(arredondarQtd(1.1 * 3)).toBe(3.3);     // 3.3000000000000003
    expect(arredondarQtd(0.1 * 3)).toBe(0.3);     // 0.30000000000000004
    expect(arredondarQtd(7 * 1.15)).toBe(8.05);   // 8.049999999999999
  });

  it("mantém 3 casas — 1 grama em quilo, 1 ml em litro", () => {
    expect(arredondarQtd(0.001)).toBe(0.001);
    expect(arredondarQtd(2.125)).toBe(2.125);
  });

  it("quantidade inválida nunca vira NaN para gravar", () => {
    expect(arredondarQtd(NaN)).toBe(0);
    expect(arredondarQtd(Infinity)).toBe(0);
    expect(arredondarQtd(null)).toBe(0);
    expect(arredondarQtd(undefined)).toBe(0);
    expect(arredondarQtd("abc")).toBe(0);
  });
});

describe("conversão arredondada (leva 5)", () => {
  it("compraParaEstoque não deixa dízima chegar ao banco", () => {
    // 3 garrafas de 0,35 L: sem arredondar, gravava 1.0499999999999998.
    expect(compraParaEstoque(3, { fator: 0.35 })).toBe(1.05);
    expect(compraParaEstoque(3, { fator_compra_estoque: 1.1 })).toBe(3.3);
    expect(compraParaEstoque(6, { fator: 0.35 })).toBe(2.1);
  });

  it("consumoParaEstoque também arredonda (é o número da baixa da venda)", () => {
    expect(consumoParaEstoque(3, { fator_consumo_estoque: 0.35 })).toBe(1.05);
    expect(consumoParaEstoque(3, { fator_consumo_estoque: 0.1 })).toBe(0.3);
  });

  it("quantidade em texto não vira NaN no meio da conversão", () => {
    // O valor vem de input; se escapar como string, virava "2" * 3 (ok) mas
    // "2,5" * 3 dava NaN e gravava NaN no saldo.
    expect(compraParaEstoque("2,5", { fator: 2 })).toBe(0);
    expect(consumoParaEstoque("abc", { fator_consumo_estoque: 2 })).toBe(0);
  });

  it("unidade ausente devolve 0 em vez de estourar", () => {
    // Produto editado em outro aparelho: a aba selecionada aponta para um
    // índice que não existe mais e `units[modo]` vem undefined.
    expect(() => compraParaEstoque(2, undefined)).not.toThrow();
    expect(compraParaEstoque(2, undefined)).toBe(0);
    expect(compraParaEstoque(2, null)).toBe(0);
  });

  it("fator não numérico não gera NaN de saldo", () => {
    expect(compraParaEstoque(2, { fator: "doze" })).toBe(0);
    expect(consumoParaEstoque(2, { fator_consumo_estoque: "x" })).toBe(0);
    expect(estoqueParaConsumo(2, { fator_consumo_estoque: "x" })).toBe(0);
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
