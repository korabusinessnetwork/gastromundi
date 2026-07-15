import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./jarvas", () => ({ emitirEvento: vi.fn() }));

import { calcularFluxoCaixa, marcarVencidos } from "./financeiro";

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

  it("ignora status 'vencido' tanto em previsto quanto em realizado", () => {
    const comVencido = [
      { id: "6", tipo: "despesa", valor: 100, competencia: "2026-07-10", status: "vencido" },
    ];
    const fluxo = calcularFluxoCaixa(comVencido, "2026-07-01", "2026-07-31");
    expect(fluxo.previsto.saidas).toBe(0);
    expect(fluxo.realizado.saidas).toBe(0);
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
