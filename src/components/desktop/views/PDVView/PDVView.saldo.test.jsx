// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

    expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível carregar as comandas canceladas/);
  });

  it("consulta boa não deixa aviso de falha na tela", async () => {
    supabaseMock.setTableResult("operator_logs", { data: [], error: null });

    await abrirSaldoAutorizado();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Carregando comandas canceladas/)).toBeNull();
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
