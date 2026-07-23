// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});
import * as estacao from "./estacao";

beforeEach(() => {
  mockSupabase.current.reset();
  localStorage.clear();
});

describe("identidade local da estação (localStorage)", () => {
  it("sem chave gravada, estacaoIdAtual() é null", () => {
    expect(estacao.estacaoIdAtual()).toBeNull();
  });

  it("definirEstacaoAtual grava e estacaoIdAtual lê de volta", () => {
    estacao.definirEstacaoAtual("estacao-1");
    expect(estacao.estacaoIdAtual()).toBe("estacao-1");
    expect(localStorage.getItem(estacao.CHAVE_ESTACAO_ID)).toBe("estacao-1");
  });

  it("definirEstacaoAtual(null) remove a chave", () => {
    estacao.definirEstacaoAtual("estacao-1");
    estacao.definirEstacaoAtual(null);
    expect(estacao.estacaoIdAtual()).toBeNull();
    expect(localStorage.getItem(estacao.CHAVE_ESTACAO_ID)).toBeNull();
  });

  it("definirEstacaoAtual('') também remove a chave", () => {
    estacao.definirEstacaoAtual("estacao-1");
    estacao.definirEstacaoAtual("");
    expect(estacao.estacaoIdAtual()).toBeNull();
  });
});

describe("listarEstacoes", () => {
  it("retorna as estações do tenant atual (select sem *, ordenado por nome)", async () => {
    mockSupabase.current.setTableResult("estacoes", {
      data: [{ id: "1", nome: "Caixa", impressoras: {} }],
      error: null,
    });
    const { data, error } = await estacao.listarEstacoes();
    expect(error).toBeNull();
    expect(data).toEqual([{ id: "1", nome: "Caixa", impressoras: {} }]);

    const selectCall = mockSupabase.current.calls.find(
      (c) => c.table === "estacoes" && c.method === "select"
    );
    expect(selectCall.args[0]).not.toContain("*");
  });

  it("erro do Supabase vira { data: [], error } sem lançar", async () => {
    mockSupabase.current.setTableError("estacoes", { message: "tabela não existe" });
    const { data, error } = await estacao.listarEstacoes();
    expect(data).toEqual([]);
    expect(error).toEqual({ message: "tabela não existe" });
  });
});

describe("criarEstacao", () => {
  it("insere com o nome trimado e retorna a linha criada", async () => {
    mockSupabase.current.setTableResult("estacoes", {
      data: { id: "2", nome: "Cozinha", impressoras: {} },
      error: null,
    });
    const { data, error } = await estacao.criarEstacao("  Cozinha  ");
    expect(error).toBeNull();
    expect(data).toEqual({ id: "2", nome: "Cozinha", impressoras: {} });

    const insertCall = mockSupabase.current.calls.find(
      (c) => c.table === "estacoes" && c.method === "insert"
    );
    expect(insertCall.args[0]).toEqual({ nome: "Cozinha" });
  });

  it("erro do Supabase vira { data: null, error } sem lançar", async () => {
    mockSupabase.current.setTableError("estacoes", { message: "boom" });
    const { data, error } = await estacao.criarEstacao("Bar");
    expect(data).toBeNull();
    expect(error).toEqual({ message: "boom" });
  });
});

describe("renomearEstacao / excluirEstacao", () => {
  it("renomearEstacao faz update({nome}).eq('id', id) e retorna { error: null } em sucesso", async () => {
    mockSupabase.current.setTableResult("estacoes", { data: null, error: null });
    const { error } = await estacao.renomearEstacao("1", "  Nova Caixa  ");
    expect(error).toBeNull();
    const updateCall = mockSupabase.current.calls.find(
      (c) => c.table === "estacoes" && c.method === "update"
    );
    expect(updateCall.args[0]).toEqual({ nome: "Nova Caixa" });
  });

  it("excluirEstacao propaga erro do Supabase sem lançar", async () => {
    mockSupabase.current.setTableError("estacoes", { message: "falhou delete" });
    const { error } = await estacao.excluirEstacao("1");
    expect(error).toEqual({ message: "falhou delete" });
  });
});

describe("salvarImpressorasEstacao", () => {
  it("grava o cache local quando id é a estação atual", async () => {
    estacao.definirEstacaoAtual("estacao-atual");
    mockSupabase.current.setTableResult("estacoes", { data: null, error: null });

    const impressoras = { "local-1": { nome: "Epson Cozinha" } };
    const { error } = await estacao.salvarImpressorasEstacao("estacao-atual", impressoras);

    expect(error).toBeNull();
    const cache = JSON.parse(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE));
    expect(cache).toEqual({ estacaoId: "estacao-atual", impressoras });
  });

  it("NÃO grava o cache quando o id salvo é de outra estação", async () => {
    estacao.definirEstacaoAtual("estacao-atual");
    mockSupabase.current.setTableResult("estacoes", { data: null, error: null });

    await estacao.salvarImpressorasEstacao("outra-estacao", { "local-1": { nome: "X" } });

    expect(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE)).toBeNull();
  });

  it("em erro do Supabase, não grava cache e retorna o erro", async () => {
    estacao.definirEstacaoAtual("estacao-atual");
    mockSupabase.current.setTableError("estacoes", { message: "boom" });

    const { error } = await estacao.salvarImpressorasEstacao("estacao-atual", {});
    expect(error).toEqual({ message: "boom" });
    expect(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE)).toBeNull();
  });
});

describe("sincronizarBindingsEstacao", () => {
  it("sem estacaoIdAtual(), é no-op: { data:{}, error:null } e não mexe no cache", async () => {
    const { data, error } = await estacao.sincronizarBindingsEstacao();
    expect(data).toEqual({});
    expect(error).toBeNull();
    expect(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE)).toBeNull();
  });

  it("com estacaoIdAtual(), busca e grava o cache com os vínculos do banco", async () => {
    estacao.definirEstacaoAtual("estacao-1");
    const impressoras = { "local-2": { nome: "Impressora Bar" } };
    mockSupabase.current.setTableResult("estacoes", { data: { impressoras }, error: null });

    const { data, error } = await estacao.sincronizarBindingsEstacao();
    expect(error).toBeNull();
    expect(data).toEqual(impressoras);

    const cache = JSON.parse(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE));
    expect(cache).toEqual({ estacaoId: "estacao-1", impressoras });
  });

  it("estação sem impressoras cadastradas ainda → cache com {}", async () => {
    estacao.definirEstacaoAtual("estacao-1");
    mockSupabase.current.setTableResult("estacoes", { data: { impressoras: null }, error: null });

    const { data, error } = await estacao.sincronizarBindingsEstacao();
    expect(error).toBeNull();
    expect(data).toEqual({});
  });

  it("em erro do Supabase, retorna { data:{}, error } SEM sobrescrever o cache existente", async () => {
    estacao.definirEstacaoAtual("estacao-1");
    // Cache pré-existente de uma sincronização anterior bem-sucedida.
    localStorage.setItem(
      estacao.CHAVE_BINDINGS_CACHE,
      JSON.stringify({ estacaoId: "estacao-1", impressoras: { "local-9": { nome: "Antiga" } } })
    );

    mockSupabase.current.setTableError("estacoes", { message: "offline" });
    const { data, error } = await estacao.sincronizarBindingsEstacao();

    expect(data).toEqual({});
    expect(error).toEqual({ message: "offline" });
    const cache = JSON.parse(localStorage.getItem(estacao.CHAVE_BINDINGS_CACHE));
    expect(cache).toEqual({ estacaoId: "estacao-1", impressoras: { "local-9": { nome: "Antiga" } } });
  });
});

describe("resiliência — nenhuma função lança mesmo com a tabela ausente", () => {
  it("todas as funções async degradam suave em vez de lançar", async () => {
    mockSupabase.current.setTableError("estacoes", { message: 'relation "estacoes" does not exist' });
    estacao.definirEstacaoAtual("estacao-1");

    await expect(estacao.listarEstacoes()).resolves.toBeDefined();
    await expect(estacao.criarEstacao("X")).resolves.toBeDefined();
    await expect(estacao.renomearEstacao("1", "Y")).resolves.toBeDefined();
    await expect(estacao.excluirEstacao("1")).resolves.toBeDefined();
    await expect(estacao.salvarImpressorasEstacao("estacao-1", {})).resolves.toBeDefined();
    await expect(estacao.sincronizarBindingsEstacao()).resolves.toBeDefined();
  });
});
