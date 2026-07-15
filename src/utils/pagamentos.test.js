import { describe, it, expect } from "vitest";
import { normalizarPagamentos, totalPorMetodo, totalTroco, rotuloMetodo } from "./pagamentos";

describe("normalizarPagamentos", () => {
  it("retorna o array de pagamentos quando a venda já usa split", () => {
    const sale = { pagamentos: [{ metodo: "dinheiro", valor: 10 }] };
    expect(normalizarPagamentos(sale)).toBe(sale.pagamentos);
  });

  it("monta um pagamento único a partir dos campos legados", () => {
    const sale = { metodo: "pix", total: 50, recebido: 50, troco: 0 };
    expect(normalizarPagamentos(sale)).toEqual([
      { metodo: "pix", valor: 50, recebido: 50, troco: 0 },
    ]);
  });
});

describe("totalPorMetodo", () => {
  it("soma um único pagamento por método", () => {
    const sale = { metodo: "dinheiro", total: 25.5 };
    expect(totalPorMetodo(sale)).toEqual({ dinheiro: 25.5 });
  });

  it("soma múltiplos pagamentos (split) na mesma venda", () => {
    const sale = {
      pagamentos: [
        { metodo: "dinheiro", valor: 20 },
        { metodo: "credito", valor: 30 },
        { metodo: "dinheiro", valor: 5 },
      ],
    };
    expect(totalPorMetodo(sale)).toEqual({ dinheiro: 25, credito: 30 });
  });

  it("retorna objeto vazio para venda sem pagamentos", () => {
    const sale = { pagamentos: [] };
    expect(totalPorMetodo(sale)).toEqual({});
  });

  it("preserva precisão de centavos com valores decimais", () => {
    const sale = {
      pagamentos: [
        { metodo: "pix", valor: 10.1 },
        { metodo: "pix", valor: 0.2 },
      ],
    };
    expect(totalPorMetodo(sale).pix).toBeCloseTo(10.3, 2);
  });

  it("aceita método desconhecido/custom como chave livre", () => {
    const sale = { metodo: "vale-refeicao", total: 15 };
    expect(totalPorMetodo(sale)).toEqual({ "vale-refeicao": 15 });
  });

  it("ignora pagamento sem metodo", () => {
    const sale = { pagamentos: [{ valor: 10 }] };
    expect(totalPorMetodo(sale)).toEqual({});
  });
});

describe("rotuloMetodo", () => {
  it("traduz os métodos nativos para rótulos amigáveis", () => {
    expect(rotuloMetodo("dinheiro")).toBe("Dinheiro");
    expect(rotuloMetodo("credito")).toBe("Crédito");
    expect(rotuloMetodo("debito")).toBe("Débito");
    expect(rotuloMetodo("pix")).toBe("Pix");
    expect(rotuloMetodo("fiado")).toBe("Fiado");
  });

  it("deriva o nome de um método personalizado (custom_<nome>_<timestamp>)", () => {
    // antes exibido cru: "custom_crédito_cielo_1783529650712"
    expect(rotuloMetodo("custom_crédito_cielo_1783529650712")).toBe("Crédito Cielo");
    expect(rotuloMetodo("custom_vale_refeicao_1700000000000")).toBe("Vale Refeicao");
  });

  it("prioriza um rótulo configurado pelo estabelecimento quando fornecido", () => {
    const rotulos = { custom_crédito_cielo_1783529650712: "Crédito Cielo (maq. 2)" };
    expect(rotuloMetodo("custom_crédito_cielo_1783529650712", rotulos)).toBe("Crédito Cielo (maq. 2)");
    expect(rotuloMetodo("pix", { pix: "PIX Loja" })).toBe("PIX Loja");
  });

  it("cai no próprio id quando não é nativo nem custom parseável", () => {
    expect(rotuloMetodo("boleto")).toBe("boleto");
    expect(rotuloMetodo("custom_")).toBe("custom_");
  });

  it("retorna travessão para vazio/nulo (nunca 'undefined' na tela)", () => {
    expect(rotuloMetodo(null)).toBe("—");
    expect(rotuloMetodo(undefined)).toBe("—");
    expect(rotuloMetodo("")).toBe("—");
  });
});

describe("totalTroco", () => {
  it("soma o troco de múltiplos pagamentos", () => {
    const sale = {
      pagamentos: [
        { metodo: "dinheiro", valor: 20, troco: 3 },
        { metodo: "credito", valor: 30, troco: 0 },
      ],
    };
    expect(totalTroco(sale)).toBe(3);
  });

  it("retorna 0 quando não há troco registrado", () => {
    const sale = { metodo: "pix", total: 10 };
    expect(totalTroco(sale)).toBe(0);
  });
});
