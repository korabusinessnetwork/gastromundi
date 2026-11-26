// Run 1 da auditoria — a conta da conferência de caixa, num lugar só.
//
// Antes existiam quatro cópias de `totalVendas + fundo` (modal de fechamento,
// detalhe do relatório, exportação e Jarvas) e as quatro erravam do mesmo
// jeito: valor recebido em método sem linha de conferência entrava no esperado
// sem ter onde ser contado. O caixa fechado no centavo aparecia com falta do
// valor inteiro desses métodos — inclusive como alerta do Jarvas.
import { describe, it, expect } from "vitest";
import {
  TOLERANCIA_CENTAVO,
  esperadoEmCaixa,
  diferencaCaixa,
  situacaoCaixa,
  ROTULO_SITUACAO,
} from "./caixa";

describe("esperadoEmCaixa", () => {
  it("usa o esperado gravado no fechamento, não vendas + fundo", () => {
    // R$ 70 vendidos, R$ 20 em fiado: só R$ 50 podiam ser contados na gaveta.
    const f = { totalVendas: 70, totalEsperado: 50, fundo: 0, totalConferido: 50 };
    expect(esperadoEmCaixa(f)).toBe(50);
  });

  it("soma o fundo ao esperado quando o fechamento é antigo (sem o campo)", () => {
    // Retrocompatibilidade: fechamentos gravados antes desta versão não têm
    // `totalEsperado`. O melhor palpite é o que a tela mostrava na época.
    expect(esperadoEmCaixa({ totalVendas: 100, fundo: 50 })).toBe(150);
    expect(esperadoEmCaixa({ totalVendas: 100 })).toBe(100);
    expect(esperadoEmCaixa({})).toBe(0);
    expect(esperadoEmCaixa(null)).toBe(0);
  });

  it("esperado gravado como zero é respeitado (caixa que só recebeu fiado)", () => {
    // Zero é falsy: com `||` no lugar do typeof, este fechamento cairia no
    // fallback e passaria a esperar os R$ 70 de fiado na gaveta.
    expect(esperadoEmCaixa({ totalVendas: 70, totalEsperado: 0, fundo: 0 })).toBe(0);
  });

  it("esperado corrompido cai no fallback em vez de virar NaN", () => {
    expect(esperadoEmCaixa({ totalVendas: 100, fundo: 10, totalEsperado: NaN })).toBe(110);
    expect(esperadoEmCaixa({ totalVendas: 100, fundo: 10, totalEsperado: "50" })).toBe(110);
  });

  it("arredonda a deriva de centavos do próprio fallback", () => {
    expect(esperadoEmCaixa({ totalVendas: 39.9, fundo: 8.7 })).toBe(48.6);
  });
});

describe("diferencaCaixa", () => {
  it("caixa fechado no centavo dá diferença zero, não poeira negativa", () => {
    // 16.10 × 3 = 48.300000000000004 em ponto flutuante.
    const f = { totalEsperado: 16.1 * 3, totalConferido: 48.3 };
    expect(diferencaCaixa(f)).toBe(0);
  });

  it("falta e sobra reais aparecem com o sinal certo", () => {
    expect(diferencaCaixa({ totalEsperado: 100, totalConferido: 90 })).toBe(-10);
    expect(diferencaCaixa({ totalEsperado: 100, totalConferido: 130 })).toBe(30);
  });

  it("a própria subtração é arredondada (a falta não sai com 15 casas)", () => {
    // 39.90 − 48.60 = -8.700000000000003 em ponto flutuante. Sem arredondar
    // aqui, o relatório e a planilha exportada imprimem esse número inteiro.
    expect(diferencaCaixa({ totalEsperado: 48.6, totalConferido: 39.9 })).toBe(-8.7);
    expect(diferencaCaixa({ totalEsperado: 0.1, totalConferido: 0.3 })).toBe(0.2);
  });

  it("fechamento com fiado não gera falta (era o defeito)", () => {
    const f = { totalVendas: 70, totalEsperado: 50, fundo: 0, totalConferido: 50 };
    expect(diferencaCaixa(f)).toBe(0);

    // A mesma linha sem o campo gravado é o comportamento antigo, mantido só
    // para fechamentos históricos — e é por isso que o campo passou a existir.
    const antigo = { totalVendas: 70, fundo: 0, totalConferido: 50 };
    expect(diferencaCaixa(antigo)).toBe(-20);
  });
});

describe("situacaoCaixa", () => {
  it("poeira de ponto flutuante é caixa conferido, não falta", () => {
    expect(situacaoCaixa(0)).toBe("conferido");
    expect(situacaoCaixa(-0.0000000000001)).toBe("conferido");
    expect(situacaoCaixa(TOLERANCIA_CENTAVO)).toBe("conferido");
  });

  it("um centavo de verdade já é diferença", () => {
    expect(situacaoCaixa(0.01)).toBe("sobra");
    expect(situacaoCaixa(-0.01)).toBe("falta");
  });

  it("valor inválido não pinta a tela de vermelho", () => {
    expect(situacaoCaixa(NaN)).toBe("conferido");
    expect(situacaoCaixa(undefined)).toBe("conferido");
  });

  it("todo rótulo existe (nenhuma tela mostra 'undefined')", () => {
    for (const s of ["conferido", "sobra", "falta"]) {
      expect(ROTULO_SITUACAO[s]).toBeTruthy();
    }
  });
});
