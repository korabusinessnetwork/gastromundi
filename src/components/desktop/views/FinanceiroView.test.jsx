// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import FinanceiroView from "./FinanceiroView";

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" } });
});

describe("FinanceiroView", () => {
  it("renderiza a lista vazia sem lançar exceção", async () => {
    renderWithProviders(<FinanceiroView />);

    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument());
  });

  it("cria uma despesa pelo modal 'Novo lançamento' e ela chama o insert em lancamentos", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinanceiroView />);
    await waitFor(() => expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
    expect(screen.getByText("Novo Lançamento")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/valor \(r\$\)/i), "250");
    await user.type(screen.getByLabelText(/vencimento/i), "2026-08-05");

    await user.click(screen.getByRole("button", { name: /salvar lançamento/i }));

    await waitFor(() => {
      const insertCall = mockSupabase.current.calls.find((c) => c.table === "lancamentos" && c.method === "insert");
      expect(insertCall).toBeDefined();
    });

    const insertCall = mockSupabase.current.calls.find((c) => c.table === "lancamentos" && c.method === "insert");
    expect(insertCall.args[0]).toMatchObject({
      tipo: "despesa",
      categoria: "aluguel",
      valor: 250,
      status: "previsto",
      vencimento: "2026-08-05",
      origem: "manual",
      criado_por: "gerente1",
    });

    // modal fecha depois de salvar
    await waitFor(() => expect(screen.queryByText("Novo Lançamento")).not.toBeInTheDocument());
  });
});
