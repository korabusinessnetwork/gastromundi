// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import { setAppMock } from "@/test/mockApp";
import CozinhaModulo from "./CozinhaModulo";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  setAppMock({ currentUser: { name: "Cozinheiro", username: "cozinha1", role: "caixa" } });
});

describe("CozinhaModulo (KDS mobile)", () => {
  it("lista os pedidos da fila", async () => {
    mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando], error: null });

    render(<CozinhaModulo onVoltar={() => {}} />);

    await waitFor(() => expect(screen.getByText("#5")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // A3 da auditoria — sem isto, a falha na busca virava a tela "Nada na fila".
  it("falha ao carregar avisa em vez de mostrar 'Nada na fila'", async () => {
    mockSupabase.current.setTableError("pending", { code: "PGRST301", message: "JWT expired" });

    render(<CozinhaModulo onVoltar={() => {}} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar os pedidos/i);
  });

  it("tentar de novo refaz a busca e limpa o aviso quando ela funciona", async () => {
    mockSupabase.current.setTableError("pending", { message: "network error" });
    const user = userEvent.setup();

    render(<CozinhaModulo onVoltar={() => {}} />);
    const botao = await screen.findByRole("button", { name: /tentar de novo/i });

    mockSupabase.current.setTableError("pending", null);
    mockSupabase.current.setTableResult("pending", { data: [pedidoAguardando], error: null });
    await user.click(botao);

    await waitFor(() => expect(screen.getByText("#5")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
