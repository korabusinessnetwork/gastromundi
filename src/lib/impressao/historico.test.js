// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  registrarImpressaoLocal,
  listarHistoricoImpressao,
  reimprimirTrabalho,
} from "./historico";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  localStorage.clear();
});

function ultimoInsert(table) {
  const inserts = mockSupabase.current.calls.filter((c) => c.table === table && c.method === "insert");
  return inserts.length ? inserts[inserts.length - 1].args[0] : null;
}

describe("registrarImpressaoLocal (Fase 4 — trilha de auditoria da impressão local)", () => {
  it("grava uma linha `impresso` com local, documento e carimbo de hora", async () => {
    const documento = { tipo: "via_producao", comanda: "5", itens: [{ nome: "Fritas", qty: 1 }] };

    const { error } = await registrarImpressaoLocal({ localImpressaoId: "loc-cozinha", documento });

    expect(error).toBeNull();
    const linha = ultimoInsert("trabalhos_impressao");
    expect(linha).toMatchObject({
      local_impressao_id: "loc-cozinha",
      documento,
      status: "impresso",
    });
    expect(linha.impresso_em).toEqual(expect.any(String));
  });

  it("carrega a estação atual desta máquina no registro", async () => {
    localStorage.setItem("gastromundi:estacao_id", "est-42");

    await registrarImpressaoLocal({ localImpressaoId: "loc-bar", documento: { tipo: "via_producao" } });

    expect(ultimoInsert("trabalhos_impressao").estacao_id).toBe("est-42");
  });

  it("sem local (fallback de via única) → no-op, não insere nada", async () => {
    const { error } = await registrarImpressaoLocal({ documento: { tipo: "via_producao" } });

    expect(error).toBeNull();
    expect(ultimoInsert("trabalhos_impressao")).toBeNull();
  });

  it("erro do banco volta no retorno, sem lançar", async () => {
    mockSupabase.current.setTableError("trabalhos_impressao", { message: "sem rede" });

    const { error } = await registrarImpressaoLocal({ localImpressaoId: "loc-cozinha", documento: {} });

    expect(error).toMatchObject({ message: "sem rede" });
  });
});

describe("listarHistoricoImpressao (Fase 4 — histórico recente)", () => {
  it("devolve os trabalhos com o nome do local resolvido", async () => {
    mockSupabase.current.setTableResult("trabalhos_impressao", {
      data: [
        { id: "t1", local_impressao_id: "loc-cozinha", status: "impresso", documento: {}, criado_em: "2026-07-23T12:00:00Z" },
        { id: "t2", local_impressao_id: "loc-bar", status: "pendente", documento: {}, criado_em: "2026-07-23T11:00:00Z" },
      ],
      error: null,
    });
    mockSupabase.current.setTableResult("locais_impressao", {
      data: [
        { id: "loc-cozinha", nome: "Cozinha" },
        { id: "loc-bar", nome: "Bar" },
      ],
      error: null,
    });

    const { data, error } = await listarHistoricoImpressao();

    expect(error).toBeNull();
    expect(data.map((t) => t.local_nome)).toEqual(["Cozinha", "Bar"]);
  });

  it("lista vazia → [] sem erro e sem buscar nomes", async () => {
    mockSupabase.current.setTableResult("trabalhos_impressao", { data: [], error: null });

    const { data, error } = await listarHistoricoImpressao();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("erro na consulta principal → [] + erro, sem lançar", async () => {
    mockSupabase.current.setTableError("trabalhos_impressao", { message: "timeout" });

    const { data, error } = await listarHistoricoImpressao();

    expect(data).toEqual([]);
    expect(error).toMatchObject({ message: "timeout" });
  });
});

describe("reimprimirTrabalho (Fase 4 — reenvio manual)", () => {
  it("resolve o perfil do local e reimprime o documento guardado", async () => {
    const imprimir = vi.fn(async () => ({ error: null }));
    const resolverPerfil = vi.fn(() => ({ driver: "browser-raster" }));
    const trabalho = { local_impressao_id: "loc-cozinha", documento: { tipo: "via_producao", comanda: "9" } };

    const { error } = await reimprimirTrabalho(trabalho, {
      configImpressao: { perfilImpressora: {} },
      imprimir,
      resolverPerfil,
    });

    expect(error).toBeNull();
    expect(resolverPerfil).toHaveBeenCalledWith("loc-cozinha", { perfilImpressora: {} });
    expect(imprimir).toHaveBeenCalledWith(trabalho.documento, { driver: "browser-raster" });
  });

  it("propaga o erro de impressão do driver", async () => {
    const imprimir = vi.fn(async () => ({ error: { message: "sem papel" } }));
    const resolverPerfil = vi.fn(() => ({}));

    const { error } = await reimprimirTrabalho(
      { local_impressao_id: "loc-x", documento: {} },
      { imprimir, resolverPerfil },
    );

    expect(error).toMatchObject({ message: "sem papel" });
  });

  it("sem funções de impressão injetadas → erro claro, não tenta imprimir", async () => {
    const { error } = await reimprimirTrabalho({ documento: {} }, {});
    expect(error.message).toMatch(/indispon/i);
  });

  it("sem documento → erro claro", async () => {
    const imprimir = vi.fn();
    const resolverPerfil = vi.fn();

    const { error } = await reimprimirTrabalho({ local_impressao_id: "loc-x" }, { imprimir, resolverPerfil });

    expect(error.message).toMatch(/reimprimir/i);
    expect(imprimir).not.toHaveBeenCalled();
  });
});
