import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  buscarTenantAtual,
  buscarModulosDoPlano,
  buscarBootstrapTenant,
  moduloHabilitado,
} from "./tenant";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("buscarTenantAtual", () => {
  it("retorna o tenant (com plano) quando a linha existe", async () => {
    mockSupabase.current.setTableResult("tenants", {
      data: { id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "avancado", created_at: "2026-07-16T00:00:00.000Z" },
      error: null,
    });

    const { data, error } = await buscarTenantAtual();

    expect(error).toBeNull();
    expect(data).toEqual({ id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "avancado", created_at: "2026-07-16T00:00:00.000Z" });
  });

  it("consulta apenas as colunas necessárias (sem select *)", async () => {
    mockSupabase.current.setTableResult("tenants", { data: null, error: null });

    await buscarTenantAtual();

    const select = mockSupabase.current.calls.find((c) => c.table === "tenants" && c.method === "select");
    expect(select).toBeDefined();
    expect(select.args[0]).not.toBe("*");
    expect(select.args[0]).toContain("nome");
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setTableError("tenants", { message: "falha de rede" });

    const { data, error } = await buscarTenantAtual();

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });

  it("nunca lança mesmo se o client rejeitar (rede fora do ar)", async () => {
    const originalFrom = mockSupabase.current.from;
    mockSupabase.current.from = () => { throw new Error("offline"); };

    const { data, error } = await buscarTenantAtual();

    mockSupabase.current.from = originalFrom; // restaura — reset() não desfaz esta troca

    expect(data).toBeNull();
    expect(error.message).toBe("offline");
  });
});

describe("buscarModulosDoPlano", () => {
  it("retorna os módulos do registro central para o plano informado", async () => {
    mockSupabase.current.setTableResult("planos_modulos", {
      data: [{ modulo_codigo: "cardapio" }, { modulo_codigo: "pdv" }, { modulo_codigo: "caixa" }],
      error: null,
    });

    const { data, error } = await buscarModulosDoPlano("basico");

    expect(error).toBeNull();
    expect(data).toEqual(["cardapio", "pdv", "caixa"]);
    const eq = mockSupabase.current.calls.find((c) => c.table === "planos_modulos" && c.method === "eq");
    expect(eq.args).toEqual(["plano_codigo", "basico"]);
  });

  it("retorna lista vazia sem consultar o Supabase quando não há plano", async () => {
    const { data, error } = await buscarModulosDoPlano(null);

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setTableError("planos_modulos", { message: "falha de rede" });

    const { data, error } = await buscarModulosDoPlano("alto");

    expect(data).toEqual([]);
    expect(error.message).toBe("falha de rede");
  });
});

describe("buscarBootstrapTenant", () => {
  it("combina tenant + módulos do plano num único objeto", async () => {
    mockSupabase.current.setTableResult("tenants", {
      data: { id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "medio", created_at: "2026-07-16T00:00:00.000Z" },
      error: null,
    });
    mockSupabase.current.setTableResult("planos_modulos", {
      data: [{ modulo_codigo: "cozinha" }, { modulo_codigo: "estoque" }],
      error: null,
    });

    const { data, error } = await buscarBootstrapTenant();

    expect(error).toBeNull();
    expect(data).toEqual({
      id: "t1",
      nome: "GastroMundi",
      tema: {},
      planoCodigo: "medio",
      modulosDisponiveis: ["cozinha", "estoque"],
    });
  });

  it("retorna módulos vazios (nunca inventados) se a busca do tenant falhar", async () => {
    mockSupabase.current.setTableError("tenants", { message: "falha de rede" });

    const { data, error } = await buscarBootstrapTenant();

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("moduloHabilitado (fonte única de gating no front)", () => {
  it("true quando o módulo está na lista disponível", () => {
    expect(moduloHabilitado(["pdv", "estoque"], "estoque")).toBe(true);
  });

  it("false quando o módulo não está na lista", () => {
    expect(moduloHabilitado(["pdv", "estoque"], "financeiro")).toBe(false);
  });

  it("false com segurança quando a lista ainda não carregou (undefined/null)", () => {
    expect(moduloHabilitado(undefined, "pdv")).toBe(false);
    expect(moduloHabilitado(null, "pdv")).toBe(false);
  });
});
