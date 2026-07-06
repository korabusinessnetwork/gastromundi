import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./jarvas", () => ({ emitirEvento: vi.fn() }));

const { baixarConta } = vi.hoisted(() => ({ baixarConta: vi.fn() }));
vi.mock("./financeiro", () => ({ baixarConta }));

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  validarCadastroCliente,
  cadastrarCliente,
  listarClientes,
  registrarPagamentoFiado,
  calcularSaldoDevedor,
} from "./clientes";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.calls?.splice(0);
});

describe("validarCadastroCliente", () => {
  it("exige nome", () => {
    expect(validarCadastroCliente({ nome: "", telefone: "11999999999" })).toEqual({ valido: false, erro: "Nome é obrigatório." });
  });

  it("exige telefone (contato mínimo)", () => {
    expect(validarCadastroCliente({ nome: "Maria", telefone: "" })).toEqual({
      valido: false,
      erro: "Telefone é obrigatório (contato mínimo para fiado/delivery).",
    });
  });

  it("válido com nome e telefone preenchidos", () => {
    expect(validarCadastroCliente({ nome: "Maria", telefone: "11999999999" })).toEqual({ valido: true, erro: null });
  });

  it("trata espaços em branco como vazio", () => {
    expect(validarCadastroCliente({ nome: "   ", telefone: "11999999999" }).valido).toBe(false);
  });
});

describe("cadastrarCliente", () => {
  it("retorna erro de validação sem chamar o Supabase", async () => {
    const { data, error } = await cadastrarCliente({ nome: "", telefone: "" }, "maria");
    expect(data).toBeNull();
    expect(error.message).toMatch(/nome/i);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("insere quando não há duplicidade de telefone", async () => {
    mockSupabase.current.setTableResult("clientes", { data: [], error: null });

    await cadastrarCliente({ nome: "João", telefone: "11988887777" }, "maria");

    const select = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "select");
    expect(select).toBeDefined();
  });

  it("recusa e sugere o existente quando o telefone já está cadastrado", async () => {
    mockSupabase.current.setTableResult("clientes", { data: [{ id: "c1", nome: "João Antigo", telefone: "11988887777" }], error: null });

    const { data, error } = await cadastrarCliente({ nome: "João Novo", telefone: "11988887777" }, "maria");

    expect(data).toBeNull();
    expect(error.clienteExistente.nome).toBe("João Antigo");
    const insert = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "insert");
    expect(insert).toBeUndefined();
  });
});

describe("listarClientes", () => {
  it("busca sem filtro retorna todos os clientes ativos", async () => {
    mockSupabase.current.setTableResult("clientes", { data: [{ id: "1", nome: "Ana" }], error: null });

    const { data } = await listarClientes();

    expect(data).toEqual([{ id: "1", nome: "Ana" }]);
  });

  it("aplica o filtro de busca por nome/telefone quando informado", async () => {
    mockSupabase.current.setTableResult("clientes", { data: [], error: null });

    await listarClientes({ busca: "ana" });

    const chamadasOr = mockSupabase.current.calls.filter((c) => c.method === "or");
    expect(chamadasOr.length).toBeGreaterThan(0);
    expect(chamadasOr[0].args[0]).toContain("ana");
  });
});

describe("registrarPagamentoFiado", () => {
  it("reaproveita baixarConta do Financeiro (não duplica a lógica de baixa)", async () => {
    baixarConta.mockResolvedValue({ data: { id: "l1", status: "recebido" }, error: null });

    const resultado = await registrarPagamentoFiado("l1", "maria");

    expect(baixarConta).toHaveBeenCalledWith("l1", "maria");
    expect(resultado).toEqual({ data: { id: "l1", status: "recebido" }, error: null });
  });
});

describe("calcularSaldoDevedor", () => {
  it("soma apenas lançamentos previstos/vencidos", () => {
    const lancamentos = [
      { valor: 50, status: "previsto" },
      { valor: 30, status: "vencido" },
      { valor: 100, status: "recebido" }, // já pago, não conta
    ];
    expect(calcularSaldoDevedor(lancamentos)).toBe(80);
  });

  it("retorna 0 para lista vazia/undefined", () => {
    expect(calcularSaldoDevedor([])).toBe(0);
    expect(calcularSaldoDevedor(undefined)).toBe(0);
  });

  it("retorna 0 quando todas as contas já foram quitadas", () => {
    expect(calcularSaldoDevedor([{ valor: 50, status: "recebido" }])).toBe(0);
  });
});
