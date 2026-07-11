import { describe, it, expect, vi, beforeEach } from "vitest";

const emitirEvento = vi.fn();
vi.mock("./jarvas", () => ({ emitirEvento: (...args) => emitirEvento(...args) }));

import { isPagamentoCartao, processarPagamentoTef } from "./tef";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isPagamentoCartao", () => {
  it("true para crédito e débito", () => {
    expect(isPagamentoCartao("credito")).toBe(true);
    expect(isPagamentoCartao("debito")).toBe(true);
  });

  it("false para dinheiro, pix e fiado", () => {
    expect(isPagamentoCartao("dinheiro")).toBe(false);
    expect(isPagamentoCartao("pix")).toBe(false);
    expect(isPagamentoCartao("fiado")).toBe(false);
  });

  it("trata caixa alta/espaços com segurança", () => {
    expect(isPagamentoCartao(" Credito ")).toBe(true);
  });

  it("false com segurança para valor ausente", () => {
    expect(isPagamentoCartao(undefined)).toBe(false);
    expect(isPagamentoCartao(null)).toBe(false);
  });
});

describe("processarPagamentoTef (stub — sem terminal integrado)", () => {
  it("retorna status 'stub' sem contatar nenhum terminal", async () => {
    const resultado = await processarPagamentoTef({ metodo: "credito", valor: 30 }, { usuario: "maria", comanda: "5" });

    expect(resultado).toEqual({ status: "stub", metodo: "credito" });
  });

  it("registra o processamento simulado como evento (Jarvas/Event Bus)", async () => {
    await processarPagamentoTef({ metodo: "debito", valor: 20 }, { usuario: "maria", comanda: "5" });

    expect(emitirEvento).toHaveBeenCalledWith(
      "tef.pagamento_simulado",
      "pdv",
      { comanda: "5", metodo: "debito", valor: 20 },
      "maria",
    );
  });
});
