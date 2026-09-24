// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
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
      data: [{ id: "l1", valor: 30, status: "previsto", vencimento: "2026-08-01", descricao: "Fiado, comanda 5" }],
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

  // LGPD: o CPF ficava impresso por extenso na lista e no cadastro, à vista de
  // quem passasse pelo balcão, e ver o dado não deixava rastro nenhum.
  describe("CPF protegido (LGPD)", () => {
    const clienteComCpf = {
      id: "c1", nome: "João Silva", telefone: "11977776666",
      documento: "52998224725", documento_tipo: "cpf", endereco: null, observacoes: null,
    };

    const prepararLista = () => {
      mockSupabase.current.setTableResult("clientes", { data: [clienteComCpf], error: null });
      mockSupabase.current.setTableResult("vendas", { data: [], error: null });
      mockSupabase.current.setTableResult("lancamentos", { data: [], error: null });
    };

    it("na lista o CPF aparece oculto, sem botão para abrir", async () => {
      prepararLista();
      renderWithProviders(<ClientesView />);

      await waitFor(() => expect(screen.getByText("***.982.247-**")).toBeInTheDocument());
      expect(screen.queryByText("529.982.247-25")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^ver$/i })).not.toBeInTheDocument();
    });

    it("caixa abre o cadastro e continua sem poder revelar o CPF", async () => {
      const user = userEvent.setup();
      setAppMock({ currentUser: { name: "Caixa Teste", username: "caixa1", role: "caixa" } });
      prepararLista();
      renderWithProviders(<ClientesView />);

      await waitFor(() => expect(screen.getByText("João Silva")).toBeInTheDocument());
      await user.click(screen.getByText("João Silva"));

      await waitFor(() => expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /^ver$/i })).not.toBeInTheDocument();
      expect(screen.queryByText("529.982.247-25")).not.toBeInTheDocument();
    });

    it("gerente clica em Ver, o CPF completo aparece e o acesso vai para o log", async () => {
      const user = userEvent.setup();
      setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" } });
      prepararLista();
      renderWithProviders(<ClientesView />);

      await waitFor(() => expect(screen.getByText("João Silva")).toBeInTheDocument());
      await user.click(screen.getByText("João Silva"));

      const verBtn = await screen.findByRole("button", { name: /^ver$/i });
      await user.click(verBtn);

      expect(screen.getByText("529.982.247-25")).toBeInTheDocument();

      await waitFor(() => {
        const evento = mockSupabase.current.calls.find(
          (c) => c.table === "jarvas_eventos" && c.method === "insert"
            && c.args[0]?.tipo === "cliente.documento_visualizado",
        );
        expect(evento).toBeDefined();
        expect(evento.args[0]).toMatchObject({
          modulo: "clientes",
          payload: { cliente_id: "c1" },
          operator_id: "gerente1",
        });
        // o documento em si NUNCA entra no log
        expect(JSON.stringify(evento.args[0])).not.toContain("52998224725");
      });

      // e dá para esconder de volta (o cartão da lista atrás também está oculto,
      // por isso a máscara aparece mais de uma vez na tela)
      await user.click(screen.getByRole("button", { name: /ocultar/i }));
      expect(screen.queryByText("529.982.247-25")).not.toBeInTheDocument();
      expect(screen.getAllByText("***.982.247-**").length).toBeGreaterThan(0);
    });
  });

  describe("origem e filtros", () => {
    const listaMista = [
      { id: "c1", nome: "Ana Balcão", telefone: "11911110000", criado_por: "caixa1", data_nascimento: "1990-05-10", endereco: "Rua A, 10" },
      { id: "c2", nome: "Bruno Delivery", telefone: "11922220000", criado_por: "delivery", data_nascimento: "1985-05-02", endereco: "Rua B, 20" },
      { id: "c3", nome: "Carla Delivery", telefone: "11933330000", criado_por: "delivery", data_nascimento: "1992-11-30", endereco: null },
    ];

    it("mostra de onde veio cada cliente e filtra por origem", async () => {
      const user = userEvent.setup();
      mockSupabase.current.setTableResult("clientes", { data: listaMista, error: null });

      renderWithProviders(<ClientesView />);
      await waitFor(() => expect(screen.getByText("Ana Balcão")).toBeInTheDocument());

      // o selo aparece em cada cartão, e a contagem já vem no próprio filtro
      expect(document.querySelectorAll(".clientes-view__selo--delivery")).toHaveLength(2);
      expect(document.querySelectorAll(".clientes-view__selo--pdv")).toHaveLength(1);
      expect(screen.getByRole("button", { name: /^frente de caixa 1$/i })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^delivery 2$/i }));

      expect(screen.queryByText("Ana Balcão")).not.toBeInTheDocument();
      expect(screen.getByText("Bruno Delivery")).toBeInTheDocument();
      expect(screen.getByText("Carla Delivery")).toBeInTheDocument();
    });

    it("filtra aniversariantes do mês e por quem tem endereço, e o limpar volta tudo", async () => {
      const user = userEvent.setup();
      mockSupabase.current.setTableResult("clientes", { data: listaMista, error: null });

      renderWithProviders(<ClientesView />);
      await waitFor(() => expect(screen.getByText("Ana Balcão")).toBeInTheDocument());

      await user.selectOptions(screen.getByLabelText(/mês de aniversário/i), "5");
      expect(screen.getByText("Ana Balcão")).toBeInTheDocument();
      expect(screen.getByText("Bruno Delivery")).toBeInTheDocument();
      expect(screen.queryByText("Carla Delivery")).not.toBeInTheDocument();
      expect(screen.getByText(/mostrando 2 de 3/i)).toBeInTheDocument();

      // maio + delivery = só o Bruno
      await user.click(screen.getByRole("button", { name: /^delivery 2$/i }));
      expect(screen.queryByText("Ana Balcão")).not.toBeInTheDocument();
      expect(screen.getByText("Bruno Delivery")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /limpar filtros/i }));
      expect(screen.getByText("Ana Balcão")).toBeInTheDocument();
      expect(screen.getByText("Carla Delivery")).toBeInTheDocument();
    });

    it("lista vazia por filtro não se passa por cadastro vazio — oferece limpar", async () => {
      const user = userEvent.setup();
      mockSupabase.current.setTableResult("clientes", { data: listaMista, error: null });

      renderWithProviders(<ClientesView />);
      await waitFor(() => expect(screen.getByText("Ana Balcão")).toBeInTheDocument());

      await user.selectOptions(screen.getByLabelText(/mês de aniversário/i), "3");

      expect(screen.getByText(/nenhum cliente com esses filtros/i)).toBeInTheDocument();
      expect(screen.queryByText(/nenhum cliente cadastrado/i)).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /limpar filtros/i }).length).toBeGreaterThan(0);
    });

    it("cadastro no balcão grava a data de nascimento", async () => {
      const user = userEvent.setup();
      mockSupabase.current.setTableResult("clientes", { data: [], error: null });

      renderWithProviders(<ClientesView />);
      await waitFor(() => expect(screen.getByText(/nenhum cliente cadastrado/i)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /novo cliente/i }));
      await user.type(screen.getByPlaceholderText("Nome do cliente"), "Maria Souza");
      await user.type(screen.getByPlaceholderText("(00) 00000-0000"), "11988887777");
      // <input type="date"> não recebe texto tecla a tecla no jsdom.
      fireEvent.change(screen.getByLabelText(/data de nascimento/i), { target: { value: "1990-05-10" } });

      // O mock acumula as chamadas entre os testes deste arquivo; zerar aqui
      // garante que o insert conferido abaixo é o deste cadastro.
      mockSupabase.current.calls.splice(0);
      await user.click(screen.getByRole("button", { name: /^cadastrar$/i }));

      await waitFor(() => {
        const insert = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "insert");
        expect(insert?.args[0]).toMatchObject({ nome: "Maria Souza", data_nascimento: "1990-05-10" });
      });
    });
  });
});
