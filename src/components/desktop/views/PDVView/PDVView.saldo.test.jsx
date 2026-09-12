// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Saldo do Dia, consulta dos logs de comanda cancelada.
 *
 * A consulta ignorava o `error` e não tinha estado de carregando: falhando, o
 * card "Cancelamentos do Dia" mostrava menos do que o real e o gerente lia um
 * número errado como se fosse certo.
 */

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: {} }));

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  Object.assign(supabaseMock, createMockSupabase());
  return { supabase: supabaseMock };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({ useTravaComanda: () => ({ bloqueio: null }) }));
vi.mock("@/lib/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));

import { setAppMock } from "@/test/mockApp";
import PDVView from "./index";

beforeEach(() => {
  vi.clearAllMocks();
  // O mock do supabase é do módulo, então guarda o que o teste anterior armou.
  supabaseMock.setTableError("operator_logs", null);
  supabaseMock.setTableHandler("operator_logs", undefined);
  supabaseMock.setTableResult("operator_logs", { data: [], error: null });
  setAppMock({ caixaAberto: true, pending: [], sales: [] });
});

/** Abre o Saldo do Dia e passa pela senha de gerente. */
async function abrirSaldoAutorizado() {
  render(<MemoryRouter><PDVView notify={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByTitle("Saldo do dia"));
  fireEvent.change(screen.getByPlaceholderText("Digite a senha de acesso"), { target: { value: "1234" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Acessar" })); });
}

describe("PDVView, Saldo do Dia e os logs de comanda cancelada", () => {
  it("falha na consulta aparece na tela em vez de virar total menor calado", async () => {
    supabaseMock.setTableError("operator_logs", { message: "falha de rede" });

    await abrirSaldoAutorizado();

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/Não foi possível carregar as comandas canceladas/);
  });

  it("consulta boa não deixa aviso de falha na tela", async () => {
    supabaseMock.setTableResult("operator_logs", { data: [], error: null });

    await abrirSaldoAutorizado();

    // A consulta resolve num microtask: esperar é mais honesto do que supor
    // que já voltou, ainda mais com a suíte inteira disputando a máquina.
    await waitFor(() => {
      expect(screen.queryByText(/Carregando comandas canceladas/)).toBeNull();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Cancelamentos do Dia")).toBeInTheDocument();
  });

  it("enquanto a consulta não volta, a tela diz que está carregando", async () => {
    let liberar;
    supabaseMock.setTableHandler("operator_logs", () => new Promise(resolve => { liberar = resolve; }));

    await abrirSaldoAutorizado();
    expect(screen.getByText(/Carregando comandas canceladas/)).toBeInTheDocument();

    await act(async () => { liberar({ data: [], error: null }); });
    expect(screen.queryByText(/Carregando comandas canceladas/)).toBeNull();
  });
});

/**
 * O corte do Saldo do Dia: a abertura do caixa, não o dia do calendário.
 *
 * O PDV fica aberto 24 horas e atravessa a meia-noite sem recarregar, e a
 * madrugada pertence ao movimento da noite anterior. Com `toDateString()`, num
 * bar que abriu às 18h, à 00h10 o Saldo do Dia descartava a noite inteira
 * ("1 venda hoje", total quase zerado) enquanto o fechamento, às 4h, mostrava
 * o total certo.
 */
describe("PDVView, Saldo do Dia corta pela abertura do caixa", () => {
  // 00h30 de 16/07 no fuso da suíte (America/Sao_Paulo, UTC-3).
  const MADRUGADA   = new Date("2026-07-16T03:30:00.000Z");
  // Caixa aberto às 18h de 15/07, venda fechada às 22h da mesma noite.
  const ABERTURA_18H = "2026-07-15T21:00:00.000Z";
  const VENDA_22H    = "2026-07-16T01:00:00.000Z";

  it("venda das 22h ainda conta às 00h30 da madrugada seguinte", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(MADRUGADA);
      setAppMock({
        caixaAberto: true,
        pending: [],
        sessaoAbertaEm: ABERTURA_18H,
        sales: [{ id: "v1", at: VENDA_22H, total: 120, pagamentos: [{ metodo: "dinheiro", valor: 120 }] }],
      });

      await abrirSaldoAutorizado();

      const kpi = screen.getByText("Vendas Finalizadas").parentElement.textContent;
      expect(kpi).toMatch(/R\$ 120\.00/);
      expect(kpi).toMatch(/1 comanda/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem caixa aberto, o corte volta a ser o início do dia local", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(MADRUGADA);
      setAppMock({
        caixaAberto: true,
        pending: [],
        sessaoAbertaEm: null,
        sales: [{ id: "v1", at: VENDA_22H, total: 120, pagamentos: [{ metodo: "dinheiro", valor: 120 }] }],
      });

      await abrirSaldoAutorizado();

      const kpi = screen.getByText("Vendas Finalizadas").parentElement.textContent;
      expect(kpi).toMatch(/R\$ 0\.00/);
      expect(kpi).toMatch(/0 comandas/);
    } finally {
      vi.useRealTimers();
    }
  });
});
