import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  calcularStatusAssinatura,
  calcularDiasParaVencimento,
  assinaturaPermiteOperacao,
  buscarAssinaturaAtual,
  sincronizarStatusAssinatura,
  confirmarRenovacaoAssinatura,
} from "./assinatura";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("calcularStatusAssinatura (fronteiras de data — carência de 3 dias)", () => {
  const vencimento = "2026-07-20";
  const carenciaDias = 3;

  it("véspera do vencimento → ativo", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-19")).toBe("ativo");
  });

  it("dia do vencimento → ainda ativo (inclusive)", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-20")).toBe("ativo");
  });

  it("um dia após o vencimento → carência", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-21")).toBe("carencia");
  });

  it("último dia da carência (vencimento + 3) → ainda carência (inclusive)", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-23")).toBe("carencia");
  });

  it("um dia depois de esgotada a carência (vencimento + 4) → bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-24")).toBe("bloqueado");
  });

  it("muito tempo depois → continua bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-09-01")).toBe("bloqueado");
  });

  it("carência 0 dias: um dia após o vencimento já bloqueia", () => {
    expect(calcularStatusAssinatura(vencimento, 0, "2026-07-21")).toBe("bloqueado");
  });
});

describe("calcularDiasParaVencimento", () => {
  const vencimento = "2026-07-20";

  it("positivo quando ainda faltam dias", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-17")).toBe(3);
  });

  it("zero no dia do vencimento", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-20")).toBe(0);
  });

  it("negativo quando já venceu", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-23")).toBe(-3);
  });
});

describe("buscarAssinaturaAtual", () => {
  it("retorna a assinatura (camelCase) quando a linha existe", async () => {
    mockSupabase.current.setTableResult("assinaturas", {
      data: { data_vencimento: "2026-08-05", carencia_dias: 3, valor_mensal: 199, status: "ativo" },
      error: null,
    });

    const { data, error } = await buscarAssinaturaAtual("t1");

    expect(error).toBeNull();
    expect(data).toEqual({ dataVencimento: "2026-08-05", carenciaDias: 3, valorMensal: 199, statusCache: "ativo" });
  });

  it("consulta apenas as colunas necessárias (sem select *)", async () => {
    mockSupabase.current.setTableResult("assinaturas", { data: null, error: null });

    await buscarAssinaturaAtual("t1");

    const select = mockSupabase.current.calls.find((c) => c.table === "assinaturas" && c.method === "select");
    expect(select.args[0]).not.toBe("*");
    expect(select.args[0]).toContain("data_vencimento");
  });

  it("retorna null sem consultar quando não há tenantId", async () => {
    const { data, error } = await buscarAssinaturaAtual(null);

    expect(data).toBeNull();
    expect(error).toBeNull();
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setTableError("assinaturas", { message: "falha de rede" });

    const { data, error } = await buscarAssinaturaAtual("t1");

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("sincronizarStatusAssinatura", () => {
  it("chama a RPC e retorna o status calculado", async () => {
    mockSupabase.current.setRpcResult("sincronizar_status_assinatura", { data: "carencia", error: null });

    const { data, error } = await sincronizarStatusAssinatura("t1");

    expect(error).toBeNull();
    expect(data).toBe("carencia");
    const chamada = mockSupabase.current.calls.find((c) => c.rpc === "sincronizar_status_assinatura");
    expect(chamada.args[0]).toEqual({ p_tenant_id: "t1" });
  });

  it("propaga erro sem lançar (nunca deve travar o bootstrap)", async () => {
    mockSupabase.current.setRpcError("sincronizar_status_assinatura", { message: "falha de rede" });

    const { data, error } = await sincronizarStatusAssinatura("t1");

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("confirmarRenovacaoAssinatura", () => {
  it("valida valor e competência antes de chamar o Supabase", async () => {
    const { data, error } = await confirmarRenovacaoAssinatura({ tenantId: "t1", competencia: "2026-08-01", valor: 0, metodo: "pix", confirmadoPor: "gerente1" });

    expect(data).toBeNull();
    expect(error.message).toMatch(/valor/i);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("chama a RPC com os parâmetros corretos quando os dados são válidos", async () => {
    mockSupabase.current.setRpcResult("confirmar_renovacao_assinatura", {
      data: { tenant_id: "t1", data_vencimento: "2026-09-04", status: "ativo" },
      error: null,
    });

    const { data, error } = await confirmarRenovacaoAssinatura({
      tenantId: "t1", competencia: "2026-08-05", valor: 199, metodo: "pix", confirmadoPor: "gerente1",
    });

    expect(error).toBeNull();
    expect(data).toEqual({ tenant_id: "t1", data_vencimento: "2026-09-04", status: "ativo" });
    const chamada = mockSupabase.current.calls.find((c) => c.rpc === "confirmar_renovacao_assinatura");
    expect(chamada.args[0]).toEqual({
      p_tenant_id: "t1", p_competencia: "2026-08-05", p_valor: 199, p_metodo: "pix", p_confirmado_por: "gerente1",
    });
  });

  it("propaga erro do Supabase (ex.: role sem permissão) sem lançar exceção", async () => {
    mockSupabase.current.setRpcError("confirmar_renovacao_assinatura", { message: "Sem permissão para confirmar renovação de assinatura." });

    const { data, error } = await confirmarRenovacaoAssinatura({
      tenantId: "t1", competencia: "2026-08-05", valor: 199, metodo: "pix", confirmadoPor: "caixa1",
    });

    expect(data).toBeNull();
    expect(error.message).toMatch(/permissão/i);
  });
});

describe("assinaturaPermiteOperacao (Fase 5 — espelha assinatura_ativa/assinatura_atual_ativa do Postgres)", () => {
  it("'ativo' permite operar", () => {
    expect(assinaturaPermiteOperacao("ativo")).toBe(true);
  });

  it("'carencia' ainda permite operar", () => {
    expect(assinaturaPermiteOperacao("carencia")).toBe(true);
  });

  it("'bloqueado' NÃO permite operar", () => {
    expect(assinaturaPermiteOperacao("bloqueado")).toBe(false);
  });

  it("'cancelado' NÃO permite operar", () => {
    expect(assinaturaPermiteOperacao("cancelado")).toBe(false);
  });

  it("status ausente/inválido não permite operar (seguro por padrão)", () => {
    expect(assinaturaPermiteOperacao(undefined)).toBe(false);
    expect(assinaturaPermiteOperacao(null)).toBe(false);
  });

  it("integra com o cálculo de status: renovar (novo vencimento futuro) volta a permitir operar", () => {
    const vencimentoVencido = "2026-07-01";
    const statusAntes = calcularStatusAssinatura(vencimentoVencido, 3, "2026-07-10"); // bem depois da carência
    expect(assinaturaPermiteOperacao(statusAntes)).toBe(false);

    // confirmar_renovacao_assinatura empurra data_vencimento += ciclo_dias e volta pro presente/futuro
    const vencimentoRenovado = "2026-08-01";
    const statusDepois = calcularStatusAssinatura(vencimentoRenovado, 3, "2026-07-10");
    expect(assinaturaPermiteOperacao(statusDepois)).toBe(true);
  });
});
