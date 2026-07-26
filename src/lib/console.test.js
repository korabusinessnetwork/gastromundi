import { describe, it, expect, vi } from "vitest";

// console.js importa ./supabase (que exige VITE_* no import). Como estes
// testes exercitam só as funções PURAS, mockamos o módulo para não
// disparar a checagem de env — mesmo padrão de assinatura.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { normalizarUsername, validarNovoEstabelecimento, resumirPlataforma } from "./console";

describe("normalizarUsername", () => {
  it("baixa a caixa e remove espaços", () => {
    expect(normalizarUsername("  João Silva ")).toBe("joaosilva");
  });

  it("remove acentos (login global é ASCII)", () => {
    expect(normalizarUsername("Ação")).toBe("acao");
    expect(normalizarUsername("münchen")).toBe("munchen");
  });

  it("mantém ponto, hífen e sublinhado, descarta o resto", () => {
    expect(normalizarUsername("bar.do_zé-01!@#")).toBe("bar.do_ze-01");
  });

  it("é idempotente — normalizar duas vezes dá o mesmo resultado", () => {
    const uma = normalizarUsername("Café Central 42");
    expect(normalizarUsername(uma)).toBe(uma);
  });

  it("trata nulo/indefinido como string vazia", () => {
    expect(normalizarUsername(null)).toBe("");
    expect(normalizarUsername(undefined)).toBe("");
  });
});

describe("validarNovoEstabelecimento", () => {
  const valido = {
    nome: "Restaurante do Sul",
    planoCodigo: "avancado",
    adminNome: "Maria",
    adminUsername: "maria",
    adminPassword: "senha123",
  };

  it("aprova um formulário completo e válido", () => {
    const { ok, erros } = validarNovoEstabelecimento(valido);
    expect(ok).toBe(true);
    expect(erros).toEqual({});
  });

  it("exige o nome do estabelecimento", () => {
    const { ok, erros } = validarNovoEstabelecimento({ ...valido, nome: "   " });
    expect(ok).toBe(false);
    expect(erros.nome).toBeTruthy();
  });

  it("exige um plano", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, planoCodigo: "" });
    expect(erros.planoCodigo).toBeTruthy();
  });

  it("exige o nome do responsável", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminNome: "" });
    expect(erros.adminNome).toBeTruthy();
  });

  it("rejeita username que vira vazio após normalizar", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminUsername: "!!!" });
    expect(erros.adminUsername).toBeTruthy();
  });

  it("rejeita username curto demais (< 3 após normalizar)", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminUsername: "ab" });
    expect(erros.adminUsername).toBeTruthy();
  });

  it("rejeita senha com menos de 6 caracteres", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminPassword: "123" });
    expect(erros.adminPassword).toBeTruthy();
  });

  it("acumula múltiplos erros de uma vez", () => {
    const { ok, erros } = validarNovoEstabelecimento({});
    expect(ok).toBe(false);
    expect(Object.keys(erros).sort()).toEqual(
      ["adminNome", "adminPassword", "adminUsername", "nome", "planoCodigo"].sort()
    );
  });
});

describe("resumirPlataforma", () => {
  // Data de referência fixa para status/dias determinísticos.
  const HOJE = new Date("2026-07-24T12:00:00Z");
  const planos = [
    { codigo: "basico", nome: "Básico" },
    { codigo: "avancado", nome: "Avançado" },
  ];
  const tenants = [
    { id: "t-ativo",   nome: "Bar do Zé",     plano_codigo: "basico" },
    { id: "t-vence",   nome: "Café Central",  plano_codigo: "avancado" },
    { id: "t-carenc",  nome: "Pizza Nostra",  plano_codigo: "avancado" },
    { id: "t-bloq",    nome: "Sushi Yamas",   plano_codigo: "basico" },
    { id: "t-cancel",  nome: "Lanches Real",  plano_codigo: "basico" },
    { id: "t-sem",     nome: "Novo Cliente",  plano_codigo: "basico" },
  ];
  const assinaturas = [
    // ativo tranquilo — vence daqui a 20 dias
    { tenant_id: "t-ativo",  valor_mensal: 100, data_vencimento: "2026-08-13", carencia_dias: 3, status: "ativo" },
    // ativo mas vencendo em 3 dias → entra no alerta
    { tenant_id: "t-vence",  valor_mensal: 200, data_vencimento: "2026-07-27", carencia_dias: 3, status: "ativo" },
    // venceu há 1 dia, carência 3 → status calculado 'carencia'
    { tenant_id: "t-carenc", valor_mensal: 200, data_vencimento: "2026-07-23", carencia_dias: 3, status: "ativo" },
    // venceu há 10 dias, carência 3 → status calculado 'bloqueado'
    { tenant_id: "t-bloq",   valor_mensal: 100, data_vencimento: "2026-07-14", carencia_dias: 3, status: "ativo" },
    // cancelado manual — nunca recalculado, mesmo com data futura
    { tenant_id: "t-cancel", valor_mensal: 100, data_vencimento: "2026-08-13", carencia_dias: 3, status: "cancelado" },
    // t-sem: sem linha de assinatura de propósito
  ];

  it("recalcula o status por tenant (não usa o cache do banco)", () => {
    const { linhas } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    const porId = Object.fromEntries(linhas.map((l) => [l.tenantId, l]));
    expect(porId["t-ativo"].status).toBe("ativo");
    expect(porId["t-vence"].status).toBe("ativo");
    expect(porId["t-carenc"].status).toBe("carencia"); // cache dizia 'ativo'
    expect(porId["t-bloq"].status).toBe("bloqueado");  // cache dizia 'ativo'
    expect(porId["t-cancel"].status).toBe("cancelado"); // manual, preservado
    expect(porId["t-sem"].status).toBe("sem_assinatura");
  });

  it("conta os KPIs por status e o MRR só da base que paga (ativo+carência)", () => {
    const { kpis } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(kpis.totalTenants).toBe(6);
    expect(kpis.ativos).toBe(2);
    expect(kpis.emCarencia).toBe(1);
    expect(kpis.bloqueados).toBe(1);
    expect(kpis.cancelados).toBe(1);
    expect(kpis.semAssinatura).toBe(1);
    // 100 (ativo) + 200 (ativo vencendo) + 200 (carência) = 500
    expect(kpis.mrr).toBe(500);
  });

  it("monta o alerta de validade ordenado por urgência (bloqueado→carência→vencendo)", () => {
    const { precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).toEqual(["t-bloq", "t-carenc", "t-vence"]);
    // t-ativo (vence em 20 dias), t-cancel e t-sem ficam de fora
  });

  it("distribui por plano só os planos com tenant, na ordem do catálogo", () => {
    const { distribuicaoPlano } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(distribuicaoPlano).toEqual([
      // básico: t-ativo, t-bloq, t-cancel, t-sem = 4 · avançado: t-vence, t-carenc = 2
      { codigo: "basico", nome: "Básico", quantidade: 4 },
      { codigo: "avancado", nome: "Avançado", quantidade: 2 },
    ]);
  });

  it("não quebra com listas vazias", () => {
    const r = resumirPlataforma([], [], [], HOJE);
    expect(r.linhas).toEqual([]);
    expect(r.kpis.totalTenants).toBe(0);
    expect(r.kpis.mrr).toBe(0);
    expect(r.precisamAtencao).toEqual([]);
    expect(r.distribuicaoPlano).toEqual([]);
  });
});
