import { describe, it, expect } from "vitest";
import { formatarReais, formatarValor } from "./dinheiro";

/**
 * O formato do dinheiro na tela. Existia em três versões que não
 * concordavam, e o PDV inteiro escrevia "R$ 30.00" com PONTO — num
 * sistema em português, ao lado de um "R$ 0,00" literal na mesma tela.
 */

describe("formatarReais", () => {
  it("usa vírgula decimal, como se escreve em português", () => {
    expect(formatarReais(30)).toBe("R$ 30,00");
    expect(formatarReais(5.5)).toBe("R$ 5,50");
    expect(formatarReais(0)).toBe("R$ 0,00");
  });

  it("põe separador de milhar — é o que o toFixed nunca fez", () => {
    // "R$ 12345,60" num fechamento de caixa se lê errado.
    expect(formatarReais(12345.6)).toBe("R$ 12.345,60");
    expect(formatarReais(1000)).toBe("R$ 1.000,00");
    expect(formatarReais(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("sempre duas casas, nem mais nem menos", () => {
    expect(formatarReais(5)).toBe("R$ 5,00");
    expect(formatarReais(5.555)).toBe("R$ 5,56");
    expect(formatarReais(5.554)).toBe("R$ 5,55");
  });

  it("negativo mantém o sinal (troco que falta, desconto)", () => {
    expect(formatarReais(-12.3)).toBe("-R$ 12,30");
  });

  it("o espaço depois do R$ é um espaço NORMAL", () => {
    // O Intl usa U+00A0, invisível na tela e quebrando toda comparação de
    // texto: teste, busca do navegador, copiar e colar para planilha.
    expect(formatarReais(30)).not.toContain(" ");
    expect(formatarReais(30).charCodeAt(2)).toBe(32);
  });

  it("lixo vira zero, nunca 'R$ NaN' na tela do caixa", () => {
    for (const ruim of [null, undefined, NaN, "", "abc", {}, Infinity]) {
      expect(formatarReais(ruim)).toBe("R$ 0,00");
    }
  });

  it("aceita número em texto, que é como o input entrega", () => {
    expect(formatarReais("12.5")).toBe("R$ 12,50");
  });
});

describe("formatarValor", () => {
  it("é o mesmo sem o símbolo", () => {
    expect(formatarValor(1234.5)).toBe("1.234,50");
    expect(formatarValor(0)).toBe("0,00");
  });
});
