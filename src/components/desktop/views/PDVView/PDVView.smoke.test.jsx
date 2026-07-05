// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import PDVView from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Smoke test: garante que a árvore inteira do PDVView monta sem
 * lançar exceção, com caixa aberto e nenhuma comanda em aberto.
 * Complementa os testes de hook (useFinalizarPagamento,
 * useCancelarComanda), que cobrem a lógica de negócio isoladamente.
 */
describe("PDVView (smoke)", () => {
  it("renderiza a tela inicial (mapa) sem lançar exceção", () => {
    setAppMock({
      caixaAberto: true,
      pending: [],
      products: [{ id: 1, name: "Hambúrguer", price: 30, category: "Lanches", active: true }],
      estoque: { 1: 10 },
    });

    renderWithProviders(<PDVView />);

    expect(screen.getByText("Frente de Caixa")).toBeInTheDocument();
    expect(screen.getByText(/0 comandas em aberto|0 comanda em aberto/)).toBeInTheDocument();
  });

  it("mostra a tela de 'Caixa Fechado' quando o caixa está fechado", () => {
    setAppMock({ caixaAberto: false });

    renderWithProviders(<PDVView />);

    expect(screen.getByText("Caixa Fechado")).toBeInTheDocument();
  });
});
