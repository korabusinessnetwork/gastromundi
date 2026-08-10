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

import { emitirEvento } from "./jarvas";
import {
  validarCadastroCliente,
  cadastrarCliente,
  listarClientes,
  buscarClientePorId,
  registrarPagamentoFiado,
  calcularSaldoDevedor,
  sanitizarTermoBusca,
  anonimizarCliente,
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

  it("sanitiza o termo antes de montar o filtro .or() (não injeta no PostgREST)", async () => {
    mockSupabase.current.setTableResult("clientes", { data: [], error: null });

    // Termo malicioso: tenta fechar o ilike e injetar outro filtro.
    await listarClientes({ busca: 'ana,id.eq.00000000-0000-0000-0000-000000000000)' });

    const chamadasOr = mockSupabase.current.calls.filter((c) => c.method === "or");
    expect(chamadasOr.length).toBeGreaterThan(0);
    const filtro = chamadasOr[0].args[0];
    // A injeção depende da vírgula (separa filtros no PostgREST) e do parêntese.
    // Sanitizado, o `.or()` tem EXATAMENTE 2 segmentos, ambos ilike — o
    // `id.eq...` vira texto literal dentro do ilike, não um filtro extra.
    const segmentos = filtro.split(",");
    expect(segmentos).toHaveLength(2);
    expect(segmentos.every((s) => s.includes(".ilike."))).toBe(true);
    expect(filtro).not.toContain("(");
    expect(filtro).not.toContain(")");
  });
});

describe("sanitizarTermoBusca", () => {
  it("remove metacaracteres do PostgREST (, ( ) \" \\ * %)", () => {
    expect(sanitizarTermoBusca('a,b(c)d"e\\f*g%h')).toBe("a b c d e f g h");
  });

  it("preserva letras, números, espaço e acentos", () => {
    expect(sanitizarTermoBusca("João 123 São")).toBe("João 123 São");
  });

  it("faz trim e trata vazio/nullish", () => {
    expect(sanitizarTermoBusca("  ana  ")).toBe("ana");
    expect(sanitizarTermoBusca("")).toBe("");
    expect(sanitizarTermoBusca(undefined)).toBe("");
    expect(sanitizarTermoBusca(null)).toBe("");
  });
});

describe("buscarClientePorId", () => {
  it("não chama o Supabase quando o id é vazio", async () => {
    const { data, error } = await buscarClientePorId("");
    expect(data).toBeNull();
    expect(error).toBeNull();
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("busca o cliente pelo id com os campos do checkout (inclui documento)", async () => {
    mockSupabase.current.setTableResult("clientes", {
      data: { id: "c1", nome: "Ana", documento: "12345678909", documento_tipo: "cpf" },
      error: null,
    });

    const { data } = await buscarClientePorId("c1");

    expect(data.documento).toBe("12345678909");
    const select = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "select");
    expect(select.args[0]).toContain("documento");
    const eqId = mockSupabase.current.calls.find((c) => c.method === "eq" && c.args[0] === "id");
    expect(eqId.args[1]).toBe("c1");
  });
});

describe("anonimizarCliente", () => {
  it("não chama o Supabase sem id", async () => {
    const { data, error } = await anonimizarCliente("", "maria");
    expect(data).toBeNull();
    expect(error.message).toMatch(/inválido/i);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("apaga os dados pessoais e marca anonimizado (não deleta a linha)", async () => {
    mockSupabase.current.setTableResult("clientes", { data: { id: "c1", anonimizado: true }, error: null });

    const { error } = await anonimizarCliente("c1", "maria");

    expect(error).toBeNull();
    // Remoção física quebraria vendas/lançamentos — a regra do módulo é anonimizar.
    expect(mockSupabase.current.calls.find((c) => c.method === "delete")).toBeUndefined();

    const update = mockSupabase.current.calls.find((c) => c.table === "clientes" && c.method === "update");
    expect(update.args[0]).toMatchObject({
      anonimizado: true,
      telefone: null,
      documento: null,
      documento_tipo: null,
      endereco: null,
      observacoes: null,
    });
    expect(update.args[0].nome).not.toMatch(/ana|joão/i);

    const eqId = mockSupabase.current.calls.find((c) => c.method === "eq" && c.args[0] === "id");
    expect(eqId.args[1]).toBe("c1");
  });

  it("registra o evento de auditoria com o autor", async () => {
    mockSupabase.current.setTableResult("clientes", { data: { id: "c1", anonimizado: true }, error: null });

    await anonimizarCliente("c1", "maria");

    expect(emitirEvento).toHaveBeenCalledWith("cliente.anonimizado", "clientes", { cliente_id: "c1" }, "maria");
  });

  it("não registra evento quando o banco recusa", async () => {
    mockSupabase.current.setTableResult("clientes", { data: null, error: { message: "permission denied" } });

    const { error } = await anonimizarCliente("c1", "maria");

    expect(error).not.toBeNull();
    expect(emitirEvento).not.toHaveBeenCalled();
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
