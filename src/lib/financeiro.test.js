import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./jarvas", () => ({ emitirEvento: vi.fn() }));

import { calcularFluxoCaixa, marcarVencidos, contaEmAberto, criarLancamento } from "./financeiro";

describe("calcularFluxoCaixa", () => {
  const lancamentos = [
    { id: "1", tipo: "receita", valor: 1000, competencia: "2026-07-05", status: "recebido" },
    { id: "2", tipo: "despesa", valor: 300,  competencia: "2026-07-10", status: "pago" },
    { id: "3", tipo: "receita", valor: 500,  competencia: "2026-07-15", status: "previsto" },
    { id: "4", tipo: "despesa", valor: 200,  competencia: "2026-07-20", status: "previsto" },
    { id: "5", tipo: "receita", valor: 999,  competencia: "2026-06-30", status: "recebido" }, // fora do período
  ];

  it("separa previsto (status previsto) de realizado (pago/recebido) dentro do período", () => {
    const fluxo = calcularFluxoCaixa(lancamentos, "2026-07-01", "2026-07-31");

    expect(fluxo.realizado).toEqual({ entradas: 1000, saidas: 300, saldo: 700 });
    expect(fluxo.previsto).toEqual({ entradas: 500, saidas: 200, saldo: 300 });
  });

  it("ignora lançamentos fora do período (limites inclusivos)", () => {
    const fluxo = calcularFluxoCaixa(lancamentos, "2026-07-01", "2026-07-31");
    // a receita de 2026-06-30 (999) não deve entrar em nenhum total
    expect(fluxo.realizado.entradas).toBe(1000);

    const fluxoJunho = calcularFluxoCaixa(lancamentos, "2026-06-30", "2026-06-30");
    expect(fluxoJunho.realizado).toEqual({ entradas: 999, saidas: 0, saldo: 999 });
  });

  it("retorna zeros para período sem lançamentos", () => {
    const fluxo = calcularFluxoCaixa(lancamentos, "2025-01-01", "2025-01-31");
    expect(fluxo).toEqual({
      previsto:  { entradas: 0, saidas: 0, saldo: 0 },
      realizado: { entradas: 0, saidas: 0, saldo: 0 },
    });
  });

  it("lida com lista vazia/undefined sem lançar exceção", () => {
    expect(calcularFluxoCaixa([], "2026-07-01", "2026-07-31")).toEqual({
      previsto:  { entradas: 0, saidas: 0, saldo: 0 },
      realizado: { entradas: 0, saidas: 0, saldo: 0 },
    });
    expect(calcularFluxoCaixa(undefined, "2026-07-01", "2026-07-31").realizado.entradas).toBe(0);
  });

  // Run 2 — este teste substitui um que afirmava o contrário ("ignora status
  // 'vencido' tanto em previsto quanto em realizado"). Aquele documentava o
  // defeito: abrir a tela roda processarVencidos, que vira as contas atrasadas
  // para 'vencido', e aí o dinheiro delas saía do card "Previsto (a receber /
  // a pagar)" sem entrar no realizado — a conta atrasada simplesmente
  // desaparecia dos totais, embora continuasse vermelha na lista.
  it("conta 'vencido' como previsto: é conta em aberto, não some dos totais", () => {
    const comVencido = [
      { id: "6", tipo: "despesa", valor: 100, competencia: "2026-07-10", status: "vencido" },
      { id: "7", tipo: "receita", valor: 250, competencia: "2026-07-11", status: "vencido" },
    ];
    const fluxo = calcularFluxoCaixa(comVencido, "2026-07-01", "2026-07-31");

    expect(fluxo.previsto).toEqual({ entradas: 250, saidas: 100, saldo: 150 });
    // e não pode virar dinheiro que já entrou/saiu
    expect(fluxo.realizado).toEqual({ entradas: 0, saidas: 0, saldo: 0 });
  });

  it("a conta atrasada continua nos totais depois de processarVencidos virar o status", () => {
    // Cenário de produção: o aluguel venceu ontem. A tela carrega, marca como
    // vencido, e o valor tem que continuar em "a pagar" — é o mais urgente.
    const previsto = [{ id: "8", tipo: "despesa", valor: 2500, competencia: "2026-07-01", status: "previsto" }];
    const depois   = [{ id: "8", tipo: "despesa", valor: 2500, competencia: "2026-07-01", status: "vencido" }];

    const antes = calcularFluxoCaixa(previsto, "2026-07-01", "2026-07-31");
    const agora = calcularFluxoCaixa(depois,   "2026-07-01", "2026-07-31");
    expect(agora.previsto.saidas).toBe(antes.previsto.saidas);
  });

  it("arredonda as somas: saldo zerado sai 0, nunca '-R$ 0.00' em vermelho", () => {
    // R$ 39,90 + R$ 8,70 = 48.599999999999994 em float. Contra uma despesa de
    // 48,60 paga, o saldo cru é -7.105427357601002e-15: negativo. O card pinta
    // de vermelho e o toFixed(2) imprime "-R$ 0.00" — o dono lê prejuízo num
    // dia que fechou exatamente empatado.
    const empatado = [
      { id: "a", tipo: "receita", valor: 39.9, competencia: "2026-07-05", status: "recebido" },
      { id: "b", tipo: "receita", valor: 8.7,  competencia: "2026-07-05", status: "recebido" },
      { id: "c", tipo: "despesa", valor: 48.6, competencia: "2026-07-05", status: "pago" },
    ];
    const fluxo = calcularFluxoCaixa(empatado, "2026-07-01", "2026-07-31");

    expect(fluxo.realizado.entradas).toBe(48.6);
    expect(fluxo.realizado.saldo).toBe(0);
    // Object.is(-0, 0) é false: garante que não voltou como zero negativo.
    expect(Object.is(fluxo.realizado.saldo, 0)).toBe(true);
    expect(fluxo.realizado.saldo >= 0).toBe(true);
  });

  it("arredonda o saldo, não só as somas: 1,10 − 1,00 tem que dar 0,10", () => {
    // Arredondar as somas não basta. Entradas e saídas saem exatas de round2 e
    // a SUBTRAÇÃO delas ainda deriva: 1.1 - 1 = 0.10000000000000009. O card
    // imprime "R$ 0.10" e engana, mas o número que sai daqui alimenta relatório
    // e comparação — precisa ser 0.1 de verdade.
    const centavo = [
      { id: "g", tipo: "receita", valor: 1.1, competencia: "2026-07-05", status: "recebido" },
      { id: "h", tipo: "despesa", valor: 1,   competencia: "2026-07-05", status: "pago" },
      { id: "i", tipo: "receita", valor: 1.1, competencia: "2026-07-06", status: "previsto" },
      { id: "j", tipo: "despesa", valor: 1,   competencia: "2026-07-06", status: "vencido" },
    ];
    const fluxo = calcularFluxoCaixa(centavo, "2026-07-01", "2026-07-31");

    expect(fluxo.realizado.saldo).toBe(0.1);
    expect(fluxo.previsto.saldo).toBe(0.1);
  });

  it("arredonda também o previsto (mesma poeira de float em contas a pagar)", () => {
    const poeira = [
      { id: "d", tipo: "despesa", valor: 16.1, competencia: "2026-07-05", status: "previsto" },
      { id: "e", tipo: "despesa", valor: 16.1, competencia: "2026-07-06", status: "vencido" },
      { id: "f", tipo: "despesa", valor: 16.1, competencia: "2026-07-07", status: "previsto" },
    ];
    // 16.1 * 3 = 48.300000000000004 somando em float
    expect(calcularFluxoCaixa(poeira, "2026-07-01", "2026-07-31").previsto.saidas).toBe(48.3);
  });
});

describe("contaEmAberto", () => {
  it("previsto e vencido ainda podem ser baixados", () => {
    expect(contaEmAberto({ status: "previsto" })).toBe(true);
    expect(contaEmAberto({ status: "vencido" })).toBe(true);
  });

  it("conta já liquidada não pode ser baixada de novo", () => {
    expect(contaEmAberto({ status: "pago" })).toBe(false);
    expect(contaEmAberto({ status: "recebido" })).toBe(false);
  });

  it("status ausente, desconhecido ou lançamento nulo não abre o botão de baixa", () => {
    expect(contaEmAberto({})).toBe(false);
    expect(contaEmAberto({ status: "cancelado" })).toBe(false);
    expect(contaEmAberto(null)).toBe(false);
    expect(contaEmAberto(undefined)).toBe(false);
  });
});

describe("criarLancamento — validação de entrada", () => {
  // O mock de ./supabase é `{}`: qualquer lançamento que PASSE da validação
  // estoura em `supabase.from is not a function`. Isso é de propósito — se
  // alguma guarda for removida, o teste falha de qualquer jeito.
  const valido = { tipo: "despesa", categoria: "aluguel", valor: 100, competencia: "2026-07-10", status: "pago" };

  it("recusa valor zero, negativo ou não numérico", async () => {
    for (const valor of [0, -5, "abc", null, undefined]) {
      const { data, error } = await criarLancamento({ ...valido, valor }, "ana");
      expect(data).toBeNull();
      expect(error.message).toBe("Valor deve ser maior que zero.");
    }
  });

  it("recusa tipo fora de receita/despesa — dinheiro que não entra em card nenhum", async () => {
    // calcularFluxoCaixa soma por tipo. Um lançamento com tipo "transferencia"
    // é gravado, aparece na lista e não é contado nem como entrada nem como
    // saída: o valor fica órfão. Barrar na criação é o único jeito.
    for (const tipo of ["transferencia", "", null, undefined, "Receita"]) {
      const { data, error } = await criarLancamento({ ...valido, tipo }, "ana");
      expect(data).toBeNull();
      expect(error.message).toBe("Tipo deve ser receita ou despesa.");
    }
  });

  it("recusa categoria vazia ou só com espaços", async () => {
    for (const categoria of [undefined, null, "", "   "]) {
      const { data, error } = await criarLancamento({ ...valido, categoria }, "ana");
      expect(data).toBeNull();
      expect(error.message).toBe("Categoria é obrigatória.");
    }
  });

  it("recusa competência ausente", async () => {
    const { data, error } = await criarLancamento({ ...valido, competencia: null }, "ana");
    expect(data).toBeNull();
    expect(error.message).toBe("Competência é obrigatória.");
  });

  it("exige vencimento quando o lançamento é previsto (conta a pagar/receber)", async () => {
    const { data, error } = await criarLancamento(
      { ...valido, status: "previsto", vencimento: null }, "ana",
    );
    expect(data).toBeNull();
    expect(error.message).toBe("Vencimento é obrigatório para lançamentos previstos.");
  });

  it("não recusa nada de um lançamento bem formado (chega até o banco)", async () => {
    // Contrapeso: prova que as guardas barram o inválido sem barrar o válido.
    // Com o supabase mockado como {}, "chegou ao banco" é o TypeError do insert.
    await expect(criarLancamento(valido, "ana")).rejects.toThrow(/from is not a function/);
  });
});

describe("marcarVencidos", () => {
  const hoje = "2026-07-15";

  it("retorna apenas ids previstos com vencimento no passado", () => {
    const lancamentos = [
      { id: "a", status: "previsto", vencimento: "2026-07-10" }, // vencido
      { id: "b", status: "previsto", vencimento: "2026-07-20" }, // ainda não venceu
      { id: "c", status: "pago", vencimento: "2026-07-01" },     // já baixado, não conta
      { id: "d", status: "previsto", vencimento: "2026-07-14" }, // vencido (véspera)
    ];
    expect(marcarVencidos(lancamentos, hoje).sort()).toEqual(["a", "d"]);
  });

  it("não marca lançamento sem vencimento (ex.: receita já recebida sem data de conta)", () => {
    const lancamentos = [{ id: "x", status: "previsto", vencimento: null }];
    expect(marcarVencidos(lancamentos, hoje)).toEqual([]);
  });

  it("retorna array vazio para lista vazia/undefined", () => {
    expect(marcarVencidos([], hoje)).toEqual([]);
    expect(marcarVencidos(undefined, hoje)).toEqual([]);
  });

  it("não marca o que vence exatamente hoje (só o que já passou)", () => {
    const lancamentos = [{ id: "y", status: "previsto", vencimento: "2026-07-15" }];
    expect(marcarVencidos(lancamentos, hoje)).toEqual([]);
  });

  it("não marca a conta que vence hoje quando 'hoje' é um Date com hora do dia (regressão de fuso — produção usa new Date())", () => {
    // Produção chama processarVencidos sem hoje → new Date() = agora local COM hora.
    // Antes, new Date("2026-07-15") (meia-noite UTC) era < esse Date da tarde,
    // marcando a conta de hoje como vencida no próprio dia. Compara-se por data.
    const agoraTarde = new Date(2026, 6, 15, 14, 30, 0); // 15/07/2026 14:30 local
    const lancamentos = [
      { id: "hoje",   status: "previsto", vencimento: "2026-07-15" }, // vence hoje → NÃO vencido
      { id: "ontem",  status: "previsto", vencimento: "2026-07-14" }, // venceu ontem → vencido
    ];
    expect(marcarVencidos(lancamentos, agoraTarde)).toEqual(["ontem"]);
  });
});
