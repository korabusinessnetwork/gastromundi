import { describe, it, expect, vi, beforeEach } from "vitest";

const emitirEvento = vi.fn();
vi.mock("./jarvas", () => ({ emitirEvento: (...args) => emitirEvento(...args) }));

import { isPagamentoCartao, processarPagamentoTef, metodoUsaTef, METODOS_TEF_PADRAO } from "./tef";

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

describe("metodoUsaTef (Leva 12 — seleção por método)", () => {
  it("sem lista configurada, cai no padrão crédito/débito", () => {
    expect(metodoUsaTef("credito")).toBe(true);
    expect(metodoUsaTef("debito", undefined)).toBe(true);
    expect(metodoUsaTef("dinheiro")).toBe(false);
    expect(metodoUsaTef("pix", null)).toBe(false);
  });

  it("respeita a lista configurada pelo estabelecimento", () => {
    expect(metodoUsaTef("pix", ["pix"])).toBe(true);
    expect(metodoUsaTef("credito", ["pix"])).toBe(false);
  });

  it("lista vazia é escolha explícita: nenhum método usa TEF", () => {
    expect(metodoUsaTef("credito", [])).toBe(false);
    expect(metodoUsaTef("debito", [])).toBe(false);
  });

  it("compara sem diferenciar caixa/espaços", () => {
    expect(metodoUsaTef(" Credito ", ["credito"])).toBe(true);
    expect(metodoUsaTef("pix", [" PIX "])).toBe(true);
  });

  it("false com segurança para método ausente", () => {
    expect(metodoUsaTef(undefined)).toBe(false);
    expect(metodoUsaTef(null, ["credito"])).toBe(false);
    expect(metodoUsaTef("")).toBe(false);
  });

  it("padrão exportado é crédito + débito", () => {
    expect(METODOS_TEF_PADRAO).toEqual(["credito", "debito"]);
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
