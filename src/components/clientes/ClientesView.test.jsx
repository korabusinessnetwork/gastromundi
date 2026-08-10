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
import ClientesView from "./ClientesView";

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ currentUser: { name: "Caixa Teste", username: "caixa1", role: "caixa" } });
});

describe("ClientesView", () => {
  it("cadastro rápido: cria cliente com nome e telefone sem sair da tela", async () => {
    const user = userEvent.setup();
    mockSupabase.current.setTableResult("clientes", { data: [], error: null });

    renderWithProviders(<ClientesView />);
    await waitFor(() => expect(screen.getByText(/nenhum cliente cadastrado/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /novo cliente/i }));
    expect(screen.getByPlaceholderText("Nome do cliente")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Nome do cliente"), "Maria Souza");
    await user.type(screen.getByPlaceholderText("(00) 00000-0000"), "11988887777");
    await user.click(screen.getByRole("button", { name: /^cadastrar$/i }));

    await waitFor(() => {
      const insertCall = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "insert");
      expect(insertCall).toBeDefined();
    });

    const insertCall = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "insert");
    expect(insertCall.args[0]).toMatchObject({
      nome: "Maria Souza",
      telefone: "11988887777",
      criado_por: "caixa1",
    });

    await waitFor(() => expect(screen.queryByPlaceholderText("Nome do cliente")).not.toBeInTheDocument());
  });

  it("mostra o saldo devedor em destaque e registra o pagamento do fiado (baixa via Financeiro)", async () => {
    const user = userEvent.setup();
    mockSupabase.current.setTableResult("clientes", {
      data: [{ id: "c1", nome: "João Silva", telefone: "11977776666", endereco: null, observacoes: null }],
      error: null,
    });
    mockSupabase.current.setTableResult("vendas", { data: [], error: null });
    mockSupabase.current.setTableResult("lancamentos", {
      data: [{ id: "l1", valor: 30, status: "previsto", vencimento: "2026-08-01", descricao: "Fiado — comanda 5" }],
      error: null,
    });

    renderWithProviders(<ClientesView />);
    await waitFor(() => expect(screen.getByText("João Silva")).toBeInTheDocument());

    await user.click(screen.getByText("João Silva"));

    await waitFor(() => expect(screen.getByText(/joão silva deve r\$ 30.00/i)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /registrar pagamento/i }));
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => {
      const updateCall = mockSupabase.current.calls.find((c) => c.table === "lancamentos" && c.method === "update");
      expect(updateCall).toBeDefined();
    });

    const eqCalls = mockSupabase.current.calls.filter((c) => c.table === "lancamentos" && c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "id" && c.args[1] === "l1")).toBe(true);
  });

  it("edita um cliente pelo detalhe: adiciona CPF e salva (atualizarCliente)", async () => {
    const user = userEvent.setup();
    mockSupabase.current.setTableResult("clientes", {
      data: [{ id: "c1", nome: "João Silva", telefone: "11977776666", documento: null, documento_tipo: null, endereco: null, observacoes: null }],
      error: null,
    });
    mockSupabase.current.setTableResult("vendas", { data: [], error: null });
    mockSupabase.current.setTableResult("lancamentos", { data: [], error: null });

    renderWithProviders(<ClientesView />);
    await waitFor(() => expect(screen.getByText("João Silva")).toBeInTheDocument());

    // abre o detalhe e entra na edição
    await user.click(screen.getByText("João Silva"));
    await waitFor(() => expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /editar/i }));

    // campos vêm preenchidos; CPF começa vazio e é mascarado ao digitar
    const cpfInput = screen.getByPlaceholderText("000.000.000-00");
    await user.type(cpfInput, "52998224725");
    expect(cpfInput).toHaveValue("529.982.247-25");

    // a linha atualizada volta pelo .single() do update
    mockSupabase.current.setTableResult("clientes", {
      data: { id: "c1", nome: "João Silva", telefone: "11977776666", documento: "52998224725", documento_tipo: "cpf", endereco: null, observacoes: null },
      error: null,
    });

    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => {
      const updateCall = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "update");
      expect(updateCall).toBeDefined();
    });

    // grava só os dígitos + o tipo escolhido, no id certo
    const updateCall = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "update");
    expect(updateCall.args[0]).toMatchObject({ documento: "52998224725", documento_tipo: "cpf" });
    const eqCalls = mockSupabase.current.calls.filter((c) => c.table === "clientes" && c.method === "eq");
    expect(eqCalls.some((c) => c.args[0] === "id" && c.args[1] === "c1")).toBe(true);

    // some com o modal de edição depois de salvar
    await waitFor(() => expect(screen.queryByRole("button", { name: /^salvar$/i })).not.toBeInTheDocument());
  });
});
