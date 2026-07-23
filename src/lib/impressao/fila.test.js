// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});
import * as fila from "./fila";
import { CHAVE_BINDINGS_CACHE, definirEstacaoAtual } from "../estacao";

const TABELA = "trabalhos_impressao";

function gravarBindings(estacaoId, impressoras) {
  localStorage.setItem(
    CHAVE_BINDINGS_CACHE,
    JSON.stringify({ estacaoId, impressoras })
  );
}

beforeEach(() => {
  mockSupabase.current.reset();
  localStorage.clear();
});

describe("STATUS / MAX_TENTATIVAS (contrato congelado)", () => {
  it("expõe os status e o teto de tentativas esperados", () => {
    expect(fila.STATUS).toEqual({
      PENDENTE: "pendente",
      PROCESSANDO: "processando",
      IMPRESSO: "impresso",
      ERRO: "erro",
    });
    expect(fila.MAX_TENTATIVAS).toBe(3);
  });
});

describe("locaisDaEstacaoAtual", () => {
  it("retorna só os locais com nome não-vazio", () => {
    gravarBindings("estacao-1", {
      "local-a": { nome: "Epson Cozinha" },
      "local-b": { nome: "Bematech Bar" },
      "local-c": { nome: "" },
    });
    const locais = fila.locaisDaEstacaoAtual();
    expect(locais.sort()).toEqual(["local-a", "local-b"]);
  });

  it("sem cache → []", () => {
    expect(fila.locaisDaEstacaoAtual()).toEqual([]);
  });

  it("cache corrompido → [] (não quebra)", () => {
    localStorage.setItem(CHAVE_BINDINGS_CACHE, "{ isso não é json");
    expect(fila.locaisDaEstacaoAtual()).toEqual([]);
  });
});

describe("enfileirarTrabalho", () => {
  it("sucesso retorna { data: {id}, error: null }", async () => {
    mockSupabase.current.setTableResult(TABELA, { data: { id: "job-1" }, error: null });
    const { data, error } = await fila.enfileirarTrabalho({
      localImpressaoId: "cozinha",
      documento: { tipo: "comanda" },
    });
    expect(error).toBeNull();
    expect(data).toEqual({ id: "job-1" });

    const insertCall = mockSupabase.current.calls.find(
      (c) => c.table === TABELA && c.method === "insert"
    );
    expect(insertCall.args[0]).toEqual({
      local_impressao_id: "cozinha",
      documento: { tipo: "comanda" },
    });
  });

  it("erro do Supabase retorna { data: null, error } sem lançar", async () => {
    mockSupabase.current.setTableError(TABELA, { message: "tabela não existe" });
    const { data, error } = await fila.enfileirarTrabalho({
      localImpressaoId: "bar",
      documento: {},
    });
    expect(data).toBeNull();
    expect(error).toEqual({ message: "tabela não existe" });
  });
});

describe("processarFilaImpressao", () => {
  it("sem locais (sem cache) → no-op { impressos:0, erros:0 } e nem consulta o banco", async () => {
    const imprimir = vi.fn();
    const resolverPerfil = vi.fn();
    const res = await fila.processarFilaImpressao({ imprimir, resolverPerfil });
    expect(res).toEqual({ impressos: 0, erros: 0, error: null });
    expect(imprimir).not.toHaveBeenCalled();
    expect(mockSupabase.current.calls.length).toBe(0);
  });

  it("guarda: imprimir/resolverPerfil não-função → no-op seguro", async () => {
    gravarBindings("estacao-1", { "local-a": { nome: "X" } });
    const res = await fila.processarFilaImpressao({ imprimir: null, resolverPerfil: null });
    expect(res).toEqual({ impressos: 0, erros: 0, error: null });
  });

  it("1 candidato que imprime ok → impressos:1 e chamou imprimir com o perfil de resolverPerfil", async () => {
    definirEstacaoAtual("estacao-1");
    gravarBindings("estacao-1", { cozinha: { nome: "Epson Cozinha" } });
    mockSupabase.current.setTableResult(TABELA, {
      data: [{ id: "job-1", local_impressao_id: "cozinha", documento: { x: 1 }, tentativas: 0 }],
      error: null,
    });

    const perfil = { impressora: "Epson Cozinha", largura: 80 };
    const resolverPerfil = vi.fn(() => perfil);
    const imprimir = vi.fn(async () => ({ error: null }));

    const res = await fila.processarFilaImpressao({
      imprimir,
      resolverPerfil,
      configImpressao: { algo: true },
    });

    expect(res).toEqual({ impressos: 1, erros: 0, error: null });
    expect(resolverPerfil).toHaveBeenCalledWith("cozinha", { algo: true });
    expect(imprimir).toHaveBeenCalledWith({ x: 1 }, perfil);
  });

  it("imprimir retorna erro com tentativas baixas → volta pendente (erros:1)", async () => {
    definirEstacaoAtual("estacao-1");
    gravarBindings("estacao-1", { cozinha: { nome: "Epson Cozinha" } });
    mockSupabase.current.setTableResult(TABELA, {
      data: [{ id: "job-1", local_impressao_id: "cozinha", documento: {}, tentativas: 0 }],
      error: null,
    });

    const resolverPerfil = vi.fn(() => ({}));
    const imprimir = vi.fn(async () => ({ error: { message: "impressora offline" } }));

    const res = await fila.processarFilaImpressao({ imprimir, resolverPerfil });

    expect(res).toEqual({ impressos: 0, erros: 1, error: null });

    // O último update deve devolver a linha para 'pendente' com tentativas incrementadas.
    const updates = mockSupabase.current.calls.filter(
      (c) => c.table === TABELA && c.method === "update"
    );
    const ultimoUpdate = updates[updates.length - 1].args[0];
    expect(ultimoUpdate.status).toBe(fila.STATUS.PENDENTE);
    expect(ultimoUpdate.tentativas).toBe(1);
    expect(ultimoUpdate.erro).toBe("impressora offline");
  });

  it("imprimir falha na última tentativa → marca 'erro' definitivo (erros:1)", async () => {
    definirEstacaoAtual("estacao-1");
    gravarBindings("estacao-1", { cozinha: { nome: "Epson Cozinha" } });
    mockSupabase.current.setTableResult(TABELA, {
      data: [{ id: "job-1", local_impressao_id: "cozinha", documento: {}, tentativas: 2 }],
      error: null,
    });

    const resolverPerfil = vi.fn(() => ({}));
    // erro sem `message` → deve cair no fallback "falha na impressão".
    const imprimir = vi.fn(async () => ({ error: {} }));

    const res = await fila.processarFilaImpressao({ imprimir, resolverPerfil });
    expect(res).toEqual({ impressos: 0, erros: 1, error: null });

    const updates = mockSupabase.current.calls.filter(
      (c) => c.table === TABELA && c.method === "update"
    );
    const ultimoUpdate = updates[updates.length - 1].args[0];
    expect(ultimoUpdate.status).toBe(fila.STATUS.ERRO);
    expect(ultimoUpdate.tentativas).toBe(3);
    expect(ultimoUpdate.erro).toBe("falha na impressão");
  });

  it("resiliência: erro do Supabase no select → { error } sem lançar", async () => {
    gravarBindings("estacao-1", { cozinha: { nome: "Epson Cozinha" } });
    mockSupabase.current.setTableError(TABELA, { message: "offline" });

    const imprimir = vi.fn();
    const resolverPerfil = vi.fn();
    const res = await fila.processarFilaImpressao({ imprimir, resolverPerfil });

    expect(res.impressos).toBe(0);
    expect(res.erros).toBe(0);
    expect(res.error).toEqual({ message: "offline" });
    expect(imprimir).not.toHaveBeenCalled();
  });
});
