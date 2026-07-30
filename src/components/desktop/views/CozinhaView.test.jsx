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

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import CozinhaView from "./CozinhaView";

const agora = new Date().toISOString();

const pedidoAguardando = {
  id: "pend-1",
  comanda: "5",
  mesa: "3",
  items: [{ id: 1, name: "Hambúrguer", qty: 2 }],
  status: "open",
  status_cozinha: "aguardando",
  created_at: agora,
  em_preparo_em: null,
  pronto_em: null,
};

const pedidoEmPreparo = {
  id: "pend-2",
  comanda: "7",
  mesa: null,
  items: [{ id: 2, name: "Pizza", qty: 1, obs: ["sem cebola"] }],
  status: "open",
  status_cozinha: "em_preparo",
  created_at: agora,
  em_preparo_em: agora,
  pronto_em: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  // reset() (e não só limpar `calls`): resultados e erros de tabela ficam no
  // mock entre os testes, e um erro esquecido vazaria para o teste seguinte.
  mockSupabase.current?.reset?.();
  setAppMock({ currentUser: { name: "Cozinheiro", username: "cozinha1", role: "caixa" } });
});

describe("CozinhaView", () => {
  it("monta o painel e distribui os pedidos nas colunas certas", async () => {
    mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando, pedidoEmPreparo], error: null });

    renderWithProviders(<CozinhaView />);

    expect(screen.getByText("Cozinha")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Comanda 5")).toBeInTheDocument());
    expect(screen.getByText("Comanda 7")).toBeInTheDocument();
    expect(screen.getByText(/2x/)).toBeInTheDocument();
    expect(screen.getByText(/Hambúrguer/)).toBeInTheDocument();
    expect(screen.getByText("sem cebola")).toBeInTheDocument();

    // ações corretas por coluna
    expect(screen.getByRole("button", { name: /iniciar preparo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar pronto/i })).toBeInTheDocument();
  });

  it("iniciar preparo grava a transição no Supabase (aguardando → em_preparo)", async () => {
    mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando], error: null });
    const user = userEvent.setup();

    renderWithProviders(<CozinhaView />);
    await waitFor(() => expect(screen.getByText("Comanda 5")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /iniciar preparo/i }));

    await waitFor(() => {
      const updateCall = mockSupabase.current.calls.find((c) => c.table === "pending" && c.method === "update");
      expect(updateCall).toBeDefined();
    });

    const updateCall = mockSupabase.current.calls.find((c) => c.table === "pending" && c.method === "update");
    expect(updateCall.args[0]).toMatchObject({ status_cozinha: "em_preparo" });
  });

  it("marcar pronto grava a transição no Supabase (em_preparo → pronto)", async () => {
    mockSupabase.current.setTableResult("pending", { data: [pedidoEmPreparo], error: null });
    const user = userEvent.setup();

    renderWithProviders(<CozinhaView />);
    await waitFor(() => expect(screen.getByText("Comanda 7")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /marcar pronto/i }));

    await waitFor(() => {
      const updateCall = mockSupabase.current.calls.find((c) => c.table === "pending" && c.method === "update");
      expect(updateCall).toBeDefined();
    });

    const updateCall = mockSupabase.current.calls.find((c) => c.table === "pending" && c.method === "update");
    expect(updateCall.args[0]).toMatchObject({ status_cozinha: "pronto" });
  });

  it("mostra estado vazio quando não há pedidos em uma coluna", async () => {
    mockSupabase.current.setTableResult("pending", { data: [], error: null });

    renderWithProviders(<CozinhaView />);

    await waitFor(() => expect(screen.getAllByText("Nenhum pedido aqui.")).toHaveLength(3));
  });

  // A3 da auditoria — antes disso o erro era descartado e a cozinha via a
  // MESMA tela de "nenhum pedido aqui": ninguém percebia que o painel tinha
  // quebrado, e os pedidos ficavam parados no salão.
  describe("falha ao carregar (A3)", () => {
    it("avisa a cozinha em vez de fingir que não há pedidos", async () => {
      mockSupabase.current.setTableError("pending", { code: "PGRST301", message: "JWT expired" });

      renderWithProviders(<CozinhaView />);

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(/não deu para carregar os pedidos/i);
      expect(alerta).toHaveTextContent(/pode haver pedidos esperando/i);
    });

    it("oferece tentar de novo e refaz a busca ao clicar", async () => {
      mockSupabase.current.setTableError("pending", { message: "network error" });
      const user = userEvent.setup();

      renderWithProviders(<CozinhaView />);
      const botao = await screen.findByRole("button", { name: /tentar de novo/i });

      const antes = mockSupabase.current.calls.filter((c) => c.table === "pending" && c.method === "select").length;
      await user.click(botao);

      await waitFor(() => {
        const depois = mockSupabase.current.calls.filter((c) => c.table === "pending" && c.method === "select").length;
        expect(depois).toBeGreaterThan(antes);
      });
    });

    it("busca que volta a funcionar tira o aviso e mostra os pedidos", async () => {
      mockSupabase.current.setTableError("pending", { message: "network error" });
      const user = userEvent.setup();

      renderWithProviders(<CozinhaView />);
      const botao = await screen.findByRole("button", { name: /tentar de novo/i });

      mockSupabase.current.setTableError("pending", null);
      mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando], error: null });
      await user.click(botao);

      await waitFor(() => expect(screen.getByText("Comanda 5")).toBeInTheDocument());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("carga com sucesso não mostra aviso nenhum", async () => {
      mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando], error: null });

      renderWithProviders(<CozinhaView />);

      await waitFor(() => expect(screen.getByText("Comanda 5")).toBeInTheDocument());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
