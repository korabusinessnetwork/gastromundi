// F005 — sangria e suprimento: as duas parcelas do meio da fórmula do
// CAIXA.md (`esperado = fundo + entradas + suprimentos − sangrias`).
//
// A regra que mais dói se quebrar é a da linha do disponível: sangria maior
// que o numerário da gaveta deixaria o caixa devendo dinheiro que nunca
// esteve lá, e o fechamento acusaria uma falta que ninguém consegue explicar.
import { describe, it, expect } from "vitest";
import {
  LIMITE_SANGRIA_PADRAO,
  MOTIVO_MIN,
  ROTULO_TIPO,
  lerValor,
  movimentosDaSessao,
  totalPorTipo,
  ajusteEsperadoDinheiro,
  dinheiroDisponivel,
  exigeAutorizacao,
  limiteSangriaValido,
  validarMovimento,
} from "./caixaMovimentos";

const t = (iso) => new Date(iso).toISOString();

describe("lerValor", () => {
  it("aceita a vírgula decimal que o operador digita", () => {
    // Number("50,00") é NaN — gravaria uma sangria de zero sem avisar.
    expect(lerValor("50,00")).toBe(50);
    expect(lerValor("12,34")).toBe(12.34);
  });

  it("aceita ponto, número puro e espaço sobrando", () => {
    expect(lerValor("50.5")).toBe(50.5);
    expect(lerValor(50.5)).toBe(50.5);
    expect(lerValor(" 30 ")).toBe(30);
  });

  it("devolve null para o que não é número", () => {
    expect(lerValor("")).toBe(null);
    expect(lerValor("abc")).toBe(null);
    expect(lerValor(null)).toBe(null);
    expect(lerValor(undefined)).toBe(null);
    expect(lerValor(NaN)).toBe(null);
    expect(lerValor(Infinity)).toBe(null);
  });

  it("arredonda para dois dígitos", () => {
    expect(lerValor("10,005")).toBe(10.01);
  });
});

describe("movimentosDaSessao", () => {
  const inicio = new Date("2026-08-02T08:00:00Z").getTime();

  it("corta o que é de antes da abertura do caixa", () => {
    const movs = [
      { tipo: "sangria", valor: 10, created_at: t("2026-08-01T23:00:00Z") },
      { tipo: "sangria", valor: 20, created_at: t("2026-08-02T09:00:00Z") },
    ];
    expect(movimentosDaSessao(movs, inicio)).toHaveLength(1);
    expect(movimentosDaSessao(movs, inicio)[0].valor).toBe(20);
  });

  it("inclui o movimento feito no instante exato da abertura", () => {
    const movs = [{ tipo: "suprimento", valor: 5, created_at: t("2026-08-02T08:00:00Z") }];
    expect(movimentosDaSessao(movs, inicio)).toHaveLength(1);
  });

  it("descarta linha sem data legível em vez de contá-la como agora", () => {
    const movs = [
      { tipo: "sangria", valor: 10, created_at: "não é data" },
      { tipo: "sangria", valor: 10 },
      null,
    ];
    expect(movimentosDaSessao(movs, inicio)).toEqual([]);
  });

  it("lista vazia e entrada nula não quebram", () => {
    expect(movimentosDaSessao([], inicio)).toEqual([]);
    expect(movimentosDaSessao(null, inicio)).toEqual([]);
    expect(movimentosDaSessao(undefined, undefined)).toEqual([]);
  });
});

describe("totalPorTipo / ajusteEsperadoDinheiro", () => {
  const movs = [
    { tipo: "sangria",    valor: 100 },
    { tipo: "sangria",    valor: 50.5 },
    { tipo: "suprimento", valor: 30 },
  ];

  it("soma só o tipo pedido", () => {
    expect(totalPorTipo(movs, "sangria")).toBe(150.5);
    expect(totalPorTipo(movs, "suprimento")).toBe(30);
  });

  it("ajuste é suprimentos menos sangrias", () => {
    expect(ajusteEsperadoDinheiro(movs)).toBe(-120.5);
  });

  it("ajuste é zero sem movimento nenhum", () => {
    expect(ajusteEsperadoDinheiro([])).toBe(0);
    expect(ajusteEsperadoDinheiro(null)).toBe(0);
  });

  it("soma sem viés de ponto flutuante", () => {
    // 0.1 + 0.2 === 0.30000000000000004 sem o round2.
    const centavos = [
      { tipo: "suprimento", valor: 0.1 },
      { tipo: "suprimento", valor: 0.2 },
    ];
    expect(totalPorTipo(centavos, "suprimento")).toBe(0.3);
    expect(ajusteEsperadoDinheiro(centavos)).toBe(0.3);
  });

  it("valor corrompido é ignorado em vez de virar NaN", () => {
    const sujo = [{ tipo: "sangria", valor: "abc" }, { tipo: "sangria", valor: 10 }];
    expect(totalPorTipo(sujo, "sangria")).toBe(10);
  });
});

describe("dinheiroDisponivel", () => {
  it("é fundo + vendas em dinheiro + suprimentos − sangrias", () => {
    const disp = dinheiroDisponivel({
      fundo: 100,
      vendasDinheiro: 250,
      movimentos: [{ tipo: "sangria", valor: 200 }, { tipo: "suprimento", valor: 50 }],
    });
    expect(disp).toBe(200);
  });

  it("caixa recém-aberto sem venda tem só o fundo", () => {
    expect(dinheiroDisponivel({ fundo: 100, vendasDinheiro: 0, movimentos: [] })).toBe(100);
  });

  it("sem argumento nenhum é zero, não NaN", () => {
    expect(dinheiroDisponivel()).toBe(0);
    expect(dinheiroDisponivel({})).toBe(0);
  });
});

describe("exigeAutorizacao", () => {
  it("sangria acima do limite exige, no limite exato não", () => {
    expect(exigeAutorizacao({ tipo: "sangria", valor: 200.01, limite: 200 })).toBe(true);
    expect(exigeAutorizacao({ tipo: "sangria", valor: 200,    limite: 200 })).toBe(false);
    expect(exigeAutorizacao({ tipo: "sangria", valor: 199.99, limite: 200 })).toBe(false);
  });

  it("suprimento nunca exige — pôr dinheiro na gaveta não é risco", () => {
    expect(exigeAutorizacao({ tipo: "suprimento", valor: 99999, limite: 200 })).toBe(false);
  });

  it("limite torto cai no padrão em vez de liberar sangria ilimitada", () => {
    expect(exigeAutorizacao({ tipo: "sangria", valor: LIMITE_SANGRIA_PADRAO + 1, limite: 0 })).toBe(true);
    expect(exigeAutorizacao({ tipo: "sangria", valor: LIMITE_SANGRIA_PADRAO + 1, limite: null })).toBe(true);
    expect(exigeAutorizacao({ tipo: "sangria", valor: LIMITE_SANGRIA_PADRAO + 1, limite: "abc" })).toBe(true);
    expect(exigeAutorizacao({ tipo: "sangria", valor: LIMITE_SANGRIA_PADRAO + 1, limite: -50 })).toBe(true);
  });

  it("valor ilegível não pede senha (a validação já barra antes)", () => {
    expect(exigeAutorizacao({ tipo: "sangria", valor: NaN, limite: 200 })).toBe(false);
    expect(exigeAutorizacao()).toBe(false);
  });
});

describe("limiteSangriaValido", () => {
  it("respeita o limite do estabelecimento e arredonda", () => {
    expect(limiteSangriaValido(500)).toBe(500);
    expect(limiteSangriaValido("150,5")).toBe(LIMITE_SANGRIA_PADRAO); // Number("150,5") é NaN
    expect(limiteSangriaValido(150.555)).toBe(150.56);
  });

  it("cai no padrão quando a config está vazia ou inválida", () => {
    expect(limiteSangriaValido(undefined)).toBe(LIMITE_SANGRIA_PADRAO);
    expect(limiteSangriaValido(0)).toBe(LIMITE_SANGRIA_PADRAO);
    expect(limiteSangriaValido(-1)).toBe(LIMITE_SANGRIA_PADRAO);
  });
});

describe("validarMovimento", () => {
  const base = { tipo: "sangria", valor: "50", motivo: "Levar ao cofre", disponivel: 300 };

  it("aprova a sangria dentro do disponível", () => {
    expect(validarMovimento(base)).toEqual({ ok: true, erro: null });
  });

  it("recusa tipo que não é sangria nem suprimento", () => {
    expect(validarMovimento({ ...base, tipo: "outro" }).ok).toBe(false);
    expect(validarMovimento({}).ok).toBe(false);
    expect(validarMovimento().ok).toBe(false);
  });

  it("recusa valor vazio, ilegível, zero ou negativo", () => {
    expect(validarMovimento({ ...base, valor: "" }).ok).toBe(false);
    expect(validarMovimento({ ...base, valor: "abc" }).ok).toBe(false);
    expect(validarMovimento({ ...base, valor: 0 }).ok).toBe(false);
    expect(validarMovimento({ ...base, valor: -10 }).ok).toBe(false);
  });

  it("recusa motivo vazio ou curto demais", () => {
    expect(validarMovimento({ ...base, motivo: "" }).ok).toBe(false);
    expect(validarMovimento({ ...base, motivo: "   " }).ok).toBe(false);
    expect(validarMovimento({ ...base, motivo: "a".repeat(MOTIVO_MIN - 1) }).ok).toBe(false);
    expect(validarMovimento({ ...base, motivo: "a".repeat(MOTIVO_MIN) }).ok).toBe(true);
  });

  it("sangria não pode exceder o numerário disponível (CAIXA.md)", () => {
    expect(validarMovimento({ ...base, valor: "300", disponivel: 300 }).ok).toBe(true);
    const acima = validarMovimento({ ...base, valor: "300,01", disponivel: 300 });
    expect(acima.ok).toBe(false);
    expect(acima.erro).toContain("300,00");
  });

  it("gaveta vazia bloqueia sangria e explica", () => {
    const r = validarMovimento({ ...base, disponivel: 0 });
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("Não há dinheiro na gaveta para retirar.");
  });

  it("suprimento não olha o disponível — é dinheiro entrando", () => {
    expect(validarMovimento({ tipo: "suprimento", valor: "100", motivo: "Troco", disponivel: 0 }).ok).toBe(true);
  });
});

describe("ROTULO_TIPO", () => {
  it("fala a língua do balcão nas duas operações", () => {
    expect(ROTULO_TIPO.sangria).toBe("Sangria");
    expect(ROTULO_TIPO.suprimento).toBe("Suprimento");
  });
});
