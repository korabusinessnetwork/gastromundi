import { describe, it, expect } from "vitest";
import { formatarDinheiro } from "./dinheiro";

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
  it("usa vírgula no decimal, ponto no milhar e espaço comum", () => {
    expect((formatarDinheiro(1234.56))).toBe("R$ 1.234,56");
    expect((formatarDinheiro(5))).toBe("R$ 5,00");
    expect((formatarDinheiro(0))).toBe("R$ 0,00");
  });

  it("arredonda para dois dígitos, como o dinheiro de verdade", () => {
    expect((formatarDinheiro(0.1 + 0.2))).toBe("R$ 0,30");
    expect((formatarDinheiro(48.300000000000004))).toBe("R$ 48,30");
  });

  it("valor negativo mantém o sinal", () => {
    expect((formatarDinheiro(-12.5))).toBe("-R$ 12,50");
  });

  it("zero negativo não sai com sinal de menos", () => {
    // Zero negativo existe em ponto flutuante, e no card de lucro o sinal de
    // menos quer dizer prejuízo: lucro exatamente zerado aparecia em vermelho
    // com "-R$ 0,00". Um teste de tela do projeto pegou isto.
    expect((formatarDinheiro(-0))).toBe("R$ 0,00");
    expect((formatarDinheiro(0 * -1))).toBe("R$ 0,00");
  });

  it("valor ausente ou inválido vira zero, nunca R$ NaN na tela", () => {
    expect((formatarDinheiro(null))).toBe("R$ 0,00");
    expect((formatarDinheiro(undefined))).toBe("R$ 0,00");
    expect((formatarDinheiro("abc"))).toBe("R$ 0,00");
    expect((formatarDinheiro(NaN))).toBe("R$ 0,00");
    expect((formatarDinheiro(Infinity))).toBe("R$ 0,00");
  });

  it("número em texto, que é o que vem do banco em numeric, é aceito", () => {
    expect((formatarDinheiro("1234.56"))).toBe("R$ 1.234,56");
  });
});
