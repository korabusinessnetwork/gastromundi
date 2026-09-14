import { describe, it, expect } from "vitest";
import { formatarReais, formatarValor } from "./dinheiro";

/**
 * O que este teste prende é o formato que o dono lê: vírgula no decimal, ponto
 * no milhar, e nenhuma tela mostrando "R$ NaN" quando o valor não veio.
 *
 * `Intl` usa espaço INQUEBRÁVEL depois do "R$", não o espaço comum, então as
 * comparações normalizam antes: sem isso o teste passa a depender de um byte
 * invisível e quebra por motivo que ninguém enxerga na tela.
 */
describe("formatarReais", () => {
  it("usa vírgula no decimal, ponto no milhar e espaço comum", () => {
    expect(formatarReais(1234.56)).toBe("R$ 1.234,56");
    expect(formatarReais(5)).toBe("R$ 5,00");
    expect(formatarReais(0)).toBe("R$ 0,00");
  });

  it("arredonda para dois dígitos, como o dinheiro de verdade", () => {
    expect(formatarReais(0.1 + 0.2)).toBe("R$ 0,30");
    expect(formatarReais(48.300000000000004)).toBe("R$ 48,30");
  });

  it("valor negativo mantém o sinal", () => {
    expect(formatarReais(-12.5)).toBe("-R$ 12,50");
  });

  it("zero negativo não sai com sinal de menos", () => {
    // Zero negativo existe em ponto flutuante, e no card de lucro o sinal de
    // menos quer dizer prejuízo: lucro exatamente zerado aparecia em vermelho
    // com "-R$ 0,00". Um teste de tela do projeto pegou isto.
    expect(formatarReais(-0)).toBe("R$ 0,00");
    expect(formatarReais(0 * -1)).toBe("R$ 0,00");
  });

  it("valor ausente ou inválido vira zero, nunca R$ NaN na tela", () => {
    expect(formatarReais(null)).toBe("R$ 0,00");
    expect(formatarReais(undefined)).toBe("R$ 0,00");
    expect(formatarReais("abc")).toBe("R$ 0,00");
    expect(formatarReais(NaN)).toBe("R$ 0,00");
    expect(formatarReais(Infinity)).toBe("R$ 0,00");
  });

  it("número em texto, que é o que vem do banco em numeric, é aceito", () => {
    expect(formatarReais("1234.56")).toBe("R$ 1.234,56");
  });

  it("põe separador de milhar, que é o que o toFixed nunca fez", () => {
    // "R$ 12345,60" num fechamento de caixa se lê errado.
    expect(formatarReais(12345.6)).toBe("R$ 12.345,60");
    expect(formatarReais(1000)).toBe("R$ 1.000,00");
    expect(formatarReais(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("o espaço depois do R$ é um espaço NORMAL", () => {
    // O Intl usa U+00A0, invisível na tela e quebrando toda comparação de
    // texto: teste, busca do navegador, copiar e colar para planilha.
    expect(formatarReais(30)).not.toContain("\u00A0");
    expect(formatarReais(30).charCodeAt(2)).toBe(32);
  });
});

describe("formatarValor", () => {
  it("é o mesmo sem o símbolo", () => {
    expect(formatarValor(1234.5)).toBe("1.234,50");
    expect(formatarValor(0)).toBe("0,00");
  });
});
