import { describe, it, expect } from "vitest";
import { fmtComanda, fmtDinheiro } from "./fmt";

describe("fmtComanda", () => {
  it("prefixa 'Comanda' em número puro", () => {
    expect(fmtComanda("12")).toBe("Comanda 12");
    expect(fmtComanda("007")).toBe("Comanda 007");
  });

  it("aceita número como argumento numérico", () => {
    expect(fmtComanda(5)).toBe("Comanda 5");
  });

  it("deixa nomes livres intactos", () => {
    expect(fmtComanda("Mesa VIP")).toBe("Mesa VIP");
    expect(fmtComanda("Balcão 3")).toBe("Balcão 3");
    expect(fmtComanda("12A")).toBe("12A");
  });

  it("tolera espaços ao redor de número puro", () => {
    expect(fmtComanda(" 12 ")).toBe("Comanda  12 ");
  });

  it("não quebra com null/undefined/vazio (não é número → passa intacto)", () => {
    expect(fmtComanda(null)).toBe(null);
    expect(fmtComanda(undefined)).toBe(undefined);
    expect(fmtComanda("")).toBe("");
  });
});

describe("fmtDinheiro", () => {
  it("formata com prefixo R$ e duas casas (ponto)", () => {
    expect(fmtDinheiro(12.5)).toBe("R$ 12.50");
    expect(fmtDinheiro(0)).toBe("R$ 0.00");
    expect(fmtDinheiro(1234.567)).toBe("R$ 1234.57");
  });

  it("trata null/undefined como zero", () => {
    expect(fmtDinheiro(null)).toBe("R$ 0.00");
    expect(fmtDinheiro(undefined)).toBe("R$ 0.00");
  });

  it("converte string numérica", () => {
    expect(fmtDinheiro("9.9")).toBe("R$ 9.90");
  });
});
