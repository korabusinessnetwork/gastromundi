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
  buscarAddonsAtivos,
  buscarBootstrapTenant,
  moduloHabilitado,
  addonHabilitado,
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

describe("buscarAddonsAtivos", () => {
  it("retorna os códigos de add-on ativos do tenant", async () => {
    mockSupabase.current.setTableResult("tenant_addons", {
      data: [{ addon_codigo: "nfe" }],
      error: null,
    });

    const { data, error } = await buscarAddonsAtivos("t1");

    expect(error).toBeNull();
    expect(data).toEqual(["nfe"]);
    const eq = mockSupabase.current.calls.filter((c) => c.table === "tenant_addons" && c.method === "eq");
    expect(eq).toEqual(expect.arrayContaining([
      expect.objectContaining({ args: ["tenant_id", "t1"] }),
      expect.objectContaining({ args: ["ativo", true] }),
    ]));
  });

  it("retorna lista vazia sem consultar o Supabase quando não há tenant", async () => {
    const { data, error } = await buscarAddonsAtivos(null);

    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setTableError("tenant_addons", { message: "falha de rede" });

    const { data, error } = await buscarAddonsAtivos("t1");

    expect(data).toEqual([]);
    expect(error.message).toBe("falha de rede");
  });
});

describe("buscarBootstrapTenant", () => {
  it("combina tenant + módulos do plano + add-ons ativos + assinatura calculada num único objeto", async () => {
    mockSupabase.current.setTableResult("tenants", {
      data: { id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "medio", created_at: "2026-07-16T00:00:00.000Z" },
      error: null,
    });
    mockSupabase.current.setTableResult("planos_modulos", {
      data: [{ modulo_codigo: "cozinha" }, { modulo_codigo: "estoque" }],
      error: null,
    });
    mockSupabase.current.setTableResult("tenant_addons", {
      data: [{ addon_codigo: "tef" }],
      error: null,
    });
    mockSupabase.current.setTableResult("assinaturas", {
      data: { data_vencimento: "2026-08-05", carencia_dias: 3, valor_mensal: 199, status: "ativo" },
      error: null,
    });

    const { data, error } = await buscarBootstrapTenant();

    expect(error).toBeNull();
    expect(data.id).toBe("t1");
    expect(data.nome).toBe("GastroMundi");
    expect(data.planoCodigo).toBe("medio");
    expect(data.modulosDisponiveis).toEqual(["cozinha", "estoque"]);
    expect(data.addonsAtivos).toEqual(["tef"]);
    expect(data.assinatura).toEqual({
      status: "ativo",
      diasParaVencer: expect.any(Number),
      carenciaDias: 3,
      valorMensal: 199,
      dataVencimento: "2026-08-05",
    });
  });

  it("nenhum add-on ativo por padrão (caso normal, não erro)", async () => {
    mockSupabase.current.setTableResult("tenants", {
      data: { id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "avancado", created_at: "2026-07-16T00:00:00.000Z" },
      error: null,
    });
    mockSupabase.current.setTableResult("planos_modulos", { data: [], error: null });
    mockSupabase.current.setTableResult("tenant_addons", { data: [], error: null });
    mockSupabase.current.setTableResult("assinaturas", { data: null, error: null });

    const { data, error } = await buscarBootstrapTenant();

    expect(error).toBeNull();
    expect(data.addonsAtivos).toEqual([]);
  });

  it("assinatura vem null (sem inventar dado) quando o tenant não tem linha em assinaturas", async () => {
    mockSupabase.current.setTableResult("tenants", {
      data: { id: "t1", nome: "GastroMundi", tema: {}, plano_codigo: "avancado", created_at: "2026-07-16T00:00:00.000Z" },
      error: null,
    });
    mockSupabase.current.setTableResult("planos_modulos", { data: [], error: null });
    mockSupabase.current.setTableResult("tenant_addons", { data: [], error: null });
    mockSupabase.current.setTableResult("assinaturas", { data: null, error: null });

    const { data, error } = await buscarBootstrapTenant();

    expect(error).toBeNull();
    expect(data.assinatura).toBeNull();
  });

  it("retorna módulos/add-ons vazios (nunca inventados) se a busca do tenant falhar", async () => {
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

describe("addonHabilitado (fonte única de gating de add-on no front)", () => {
  it("true quando o add-on está ativo", () => {
    expect(addonHabilitado(["nfe"], "nfe")).toBe(true);
  });

  it("false quando o add-on não está na lista (caso padrão — nenhum add-on ativo)", () => {
    expect(addonHabilitado([], "nfe")).toBe(false);
    expect(addonHabilitado(["tef"], "nfe")).toBe(false);
  });

  it("false com segurança quando a lista ainda não carregou (undefined/null)", () => {
    expect(addonHabilitado(undefined, "nfe")).toBe(false);
    expect(addonHabilitado(null, "tef")).toBe(false);
  });

  it("add-on não depende de plano — não existe checagem de tier aqui", () => {
    // mesma função serve pra qualquer tenant, independente do plano_codigo
    expect(addonHabilitado(["nfe", "tef"], "tef")).toBe(true);
  });
});
