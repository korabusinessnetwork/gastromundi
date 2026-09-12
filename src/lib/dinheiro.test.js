import { describe, it, expect } from "vitest";
import { formatarDinheiro, formatarValor } from "./dinheiro";

/**
 * O que este teste prende é o formato que o dono lê: vírgula no decimal, ponto
 * no milhar, e nenhuma tela mostrando "R$ NaN" quando o valor não veio.
 *
 * `Intl` usa espaço INQUEBRÁVEL depois do "R$", não o espaço comum, então as
 * comparações normalizam antes: sem isso o teste passa a depender de um byte
 * invisível e quebra por motivo que ninguém enxerga na tela.
 */
const normal = (s) => s.replace(/ /g, " ");

describe("formatarDinheiro", () => {
  it("usa vírgula no decimal e ponto no milhar", () => {
    expect(normal(formatarDinheiro(1234.56))).toBe("R$ 1.234,56");
    expect(normal(formatarDinheiro(5))).toBe("R$ 5,00");
    expect(normal(formatarDinheiro(0))).toBe("R$ 0,00");
  });

  it("arredonda para dois dígitos, como o dinheiro de verdade", () => {
    expect(normal(formatarDinheiro(0.1 + 0.2))).toBe("R$ 0,30");
    expect(normal(formatarDinheiro(48.300000000000004))).toBe("R$ 48,30");
  });

  it("valor negativo mantém o sinal", () => {
    expect(normal(formatarDinheiro(-12.5))).toBe("-R$ 12,50");
  });

  it("valor ausente ou inválido vira zero, nunca R$ NaN na tela", () => {
    expect(normal(formatarDinheiro(null))).toBe("R$ 0,00");
    expect(normal(formatarDinheiro(undefined))).toBe("R$ 0,00");
    expect(normal(formatarDinheiro("abc"))).toBe("R$ 0,00");
    expect(normal(formatarDinheiro(NaN))).toBe("R$ 0,00");
    expect(normal(formatarDinheiro(Infinity))).toBe("R$ 0,00");
  });

  it("número em texto, que é o que vem do banco em numeric, é aceito", () => {
    expect(normal(formatarDinheiro("1234.56"))).toBe("R$ 1.234,56");
  });
});

describe("formatarValor", () => {
  it("é o mesmo número sem o símbolo, para planilha e PDF", () => {
    expect(formatarValor(1234.56)).toBe("1.234,56");
    expect(formatarValor(5)).toBe("5,00");
    expect(formatarValor(null)).toBe("0,00");
  });
});
