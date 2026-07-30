import { describe, it, expect, vi, beforeEach } from "vitest";

// console.js importa ./supabase (que exige VITE_* no import). Como estes
// testes exercitam só as funções PURAS, mockamos o módulo para não
// disparar a checagem de env — mesmo padrão de assinatura.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { supabase } from "./supabase";
import {
  normalizarUsername,
  validarNovoEstabelecimento,
  resumirPlataforma,
  compararModulosDoPlano,
  definirMensalidade,
} from "./console";

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

  it("monta o alerta de validade ordenado por urgência (sem assinatura→bloqueado→carência→vencendo)", () => {
    const { precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).toEqual(["t-sem", "t-bloq", "t-carenc", "t-vence"]);
    // t-ativo (vence em 20 dias) e t-cancel ficam de fora
  });

  // R7L2: quem não tem linha de assinatura não é bloqueado por policy
  // nenhuma, não soma no MRR e não aparecia em lugar algum da tela — o
  // cliente vendido operava de graça para sempre, em silêncio. É o pior
  // caso comercial, então vem antes até do bloqueado.
  it("põe quem não tem assinatura no alerta, e no topo dele", () => {
    const { precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).toContain("t-sem");
    expect(precisamAtencao[0].tenantId).toBe("t-sem");
    expect(precisamAtencao[0].status).toBe("sem_assinatura");
    expect(precisamAtencao[0].nome).toBe("Novo Cliente");
  });

  it("põe todos os sem-assinatura antes do bloqueado, sem embaralhar com quem tem data", () => {
    const maisUm = [...tenants, { id: "t-sem2", nome: "Outro Novo", plano_codigo: "basico" }];
    const { precisamAtencao } = resumirPlataforma(maisUm, planos, assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).toEqual([
      "t-sem", "t-sem2", "t-bloq", "t-carenc", "t-vence",
    ]);
    // sem assinatura não tem dataVencimento: o alerta não pode inventar uma
    expect(precisamAtencao[0].dataVencimento).toBeNull();
    expect(precisamAtencao[0].diasParaVencer).toBeNull();
    expect(precisamAtencao[0].valorMensal).toBe(0);
  });

  it("mantém o cancelado fora do alerta (é decisão manual, não pendência)", () => {
    const { precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).not.toContain("t-cancel");
    expect(precisamAtencao.map((l) => l.status)).not.toContain("cancelado");
  });

  it("não cria alerta quando a base toda está paga e longe do vencimento", () => {
    const so = [{ id: "t-ok", nome: "Bar OK", plano_codigo: "basico" }];
    const ass = [
      { tenant_id: "t-ok", valor_mensal: 100, data_vencimento: "2026-08-13", carencia_dias: 3, status: "ativo" },
    ];
    const { precisamAtencao } = resumirPlataforma(so, planos, ass, HOJE);
    expect(precisamAtencao).toEqual([]);
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

// R7L3: trocar de plano tem efeito imediato e invisível do Console — o
// estabelecimento perde o módulo na hora e, sem `delivery`, o site público
// de pedidos dele sai do ar (20260906). Esta função é o que permite a tela
// NOMEAR a perda antes do clique.
describe("compararModulosDoPlano", () => {
  const BASICO = ["cardapio", "pdv", "caixa", "pedidos"];
  const AVANCADO = ["cardapio", "pdv", "caixa", "pedidos", "estoque", "delivery", "relatorios", "financeiro"];

  it("nomeia o que se perde no downgrade, em português, sem código cru", () => {
    const { perdidos, ganhos } = compararModulosDoPlano(AVANCADO, BASICO);
    expect(perdidos.map((m) => m.nome)).toEqual([
      "Estoque", "Financeiro", "Relatórios", "Delivery (site de pedidos)",
    ]);
    expect(ganhos).toEqual([]);
  });

  it("nomeia o que se ganha no upgrade e não inventa perda", () => {
    const { perdidos, ganhos } = compararModulosDoPlano(BASICO, AVANCADO);
    expect(perdidos).toEqual([]);
    expect(ganhos.map((m) => m.codigo)).toEqual(["estoque", "financeiro", "relatorios", "delivery"]);
  });

  it("devolve as duas listas vazias quando os planos liberam o mesmo", () => {
    const { perdidos, ganhos } = compararModulosDoPlano(AVANCADO, [...AVANCADO].reverse());
    expect(perdidos).toEqual([]);
    expect(ganhos).toEqual([]);
  });

  it("ordena pelo registro central, não pela ordem que o banco devolveu", () => {
    // Mesma perda, ordens de entrada opostas: a saída tem de ser idêntica.
    const uma = compararModulosDoPlano(["delivery", "estoque", "cardapio"], ["cardapio"]);
    const outra = compararModulosDoPlano(["cardapio", "estoque", "delivery"], ["cardapio"]);
    expect(uma.perdidos.map((m) => m.codigo)).toEqual(["estoque", "delivery"]);
    expect(outra.perdidos.map((m) => m.codigo)).toEqual(uma.perdidos.map((m) => m.codigo));
  });

  it("mostra código sem rótulo no fim da lista, mas nunca o esconde", () => {
    const { perdidos } = compararModulosDoPlano(["modulo_novo_do_banco", "delivery"], []);
    expect(perdidos.map((m) => m.codigo)).toEqual(["delivery", "modulo_novo_do_banco"]);
    expect(perdidos[1].nome).toBe("modulo_novo_do_banco");
  });

  it("troca em que perde uma coisa e ganha outra devolve as duas listas", () => {
    const { perdidos, ganhos } = compararModulosDoPlano(["delivery", "pdv"], ["jarvas", "pdv"]);
    expect(perdidos.map((m) => m.codigo)).toEqual(["delivery"]);
    expect(ganhos.map((m) => m.codigo)).toEqual(["jarvas"]);
  });

  it("não quebra com nulo/indefinido (leitura vazia não é erro)", () => {
    expect(compararModulosDoPlano(null, undefined)).toEqual({ perdidos: [], ganhos: [] });
    expect(compararModulosDoPlano(["pdv"], null).perdidos.map((m) => m.codigo)).toEqual(["pdv"]);
  });
});

// R7L8: `assinaturas.valor_mensal` nasce em 0 e, até a 20260911, NENHUM
// caminho do sistema escrevia esse campo. O MRR somava zero com clientes
// reais na base e o cartão "Receita mensal" do Console afirmava R$ 0,00 como
// se fosse fato apurado — sem como distinguir "não fatura nada" de "ninguém
// preencheu o preço". `semPreco` é o que permite à tela dizer POR QUE.
describe("resumirPlataforma — mensalidade não definida", () => {
  const HOJE = new Date("2026-07-24T12:00:00Z");
  const planos = [{ codigo: "basico", nome: "Básico" }];
  // Datas iguais às do describe acima (status já conferido lá): 08-13 = ativo
  // tranquilo, 07-23 com carência 3 = carência, 07-14 = bloqueado.
  const ass = (id, valor, vencimento, status = "ativo") => ({
    tenant_id: id, valor_mensal: valor, data_vencimento: vencimento,
    carencia_dias: 3, status,
  });

  const tenants = [
    { id: "t-zero",   nome: "Sem Preço",     plano_codigo: "basico" },
    { id: "t-carenc", nome: "Atrasado Zero", plano_codigo: "basico" },
    { id: "t-pago",   nome: "Paga 100",      plano_codigo: "basico" },
    { id: "t-bloq",   nome: "Bloqueado",     plano_codigo: "basico" },
    { id: "t-cancel", nome: "Cancelado",     plano_codigo: "basico" },
    { id: "t-sem",    nome: "Sem Assinatura", plano_codigo: "basico" },
  ];
  const assinaturas = [
    ass("t-zero",   0,   "2026-08-13"),
    ass("t-carenc", 0,   "2026-07-23"),
    ass("t-pago",   100, "2026-08-13"),
    ass("t-bloq",   0,   "2026-07-14"),
    ass("t-cancel", 0,   "2026-08-13", "cancelado"),
    // t-sem: sem linha de assinatura de propósito
  ];

  it("conta só a base que PAGA e está sem preço definido", () => {
    const { kpis } = resumirPlataforma(tenants, planos, assinaturas, HOJE);
    // ativo zerado + carência zerada = 2. Bloqueado, cancelado e
    // sem-assinatura não entram: eles já aparecem no alerta com o nome
    // deles, e contá-los aqui viraria aviso duplicado sobre o mesmo cliente.
    expect(kpis.semPreco).toBe(2);
    // E não se confunde com o MRR nem com o total sem assinatura.
    expect(kpis.mrr).toBe(100);
    expect(kpis.semAssinatura).toBe(1);
  });

  it("NULL na coluna também é 'sem mensalidade definida'", () => {
    // valor_mensal é NOT NULL hoje, mas a leitura não pode depender disso:
    // um NULL somaria NaN no MRR e passaria batido pela contagem.
    const { kpis } = resumirPlataforma(
      [{ id: "t1", nome: "Bar", plano_codigo: "basico" }],
      planos,
      [ass("t1", null, "2026-08-13")],
      HOJE
    );
    expect(kpis.semPreco).toBe(1);
    expect(kpis.mrr).toBe(0);
  });

  it("é zero quando toda a base que paga tem preço (a nota sai da tela)", () => {
    const { kpis } = resumirPlataforma(
      [{ id: "t1", nome: "Bar", plano_codigo: "basico" }],
      planos,
      [ass("t1", 300, "2026-08-13")],
      HOJE
    );
    expect(kpis.semPreco).toBe(0);
  });

  it("quem não tem assinatura nenhuma não vira 'sem preço'", () => {
    // São problemas diferentes com soluções diferentes: sem assinatura se
    // resolve criando a assinatura, sem preço se resolve definindo o valor.
    const { kpis } = resumirPlataforma(
      [{ id: "t1", nome: "Novo", plano_codigo: "basico" }],
      planos,
      [],
      HOJE
    );
    expect(kpis.semPreco).toBe(0);
    expect(kpis.semAssinatura).toBe(1);
  });
});

// R7L8: a ÚNICA via de escrita de valor_mensal. `assinaturas` não tem policy
// de UPDATE (20260719/20260726), então isto tem de passar pela RPC — um
// `.from("assinaturas").update(...)` aqui responderia sucesso sem gravar nada.
describe("definirMensalidade", () => {
  beforeEach(() => {
    supabase.reset();
    supabase.rpc.mockClear();
  });

  it("chama a RPC do banco com os nomes de parâmetro do contrato", async () => {
    supabase.setRpcResult("definir_mensalidade_tenant", {
      data: { tenant_id: "t1", valor_mensal: 300 },
      error: null,
    });
    const { data, error } = await definirMensalidade("t1", 300);
    expect(error).toBeNull();
    expect(data).toEqual({ tenant_id: "t1", valor_mensal: 300 });
    // Nome da RPC e das chaves são contrato com a 20260911: errar aqui
    // devolve 42883 ("function does not exist") na cara do dono.
    expect(supabase.rpc).toHaveBeenCalledWith("definir_mensalidade_tenant", {
      p_tenant_id: "t1",
      p_valor: 300,
    });
  });

  it("manda zero como zero — cortesia é valor válido, não campo vazio", async () => {
    await definirMensalidade("t1", 0);
    expect(supabase.rpc).toHaveBeenCalledWith("definir_mensalidade_tenant", {
      p_tenant_id: "t1",
      p_valor: 0,
    });
  });

  it("devolve a recusa do banco em vez de inventar sucesso", async () => {
    supabase.setRpcError("definir_mensalidade_tenant", {
      code: "42501",
      message: "Apenas a plataforma pode definir a mensalidade de um estabelecimento.",
    });
    const { data, error } = await definirMensalidade("t1", 300);
    expect(data).toBeNull();
    expect(error.code).toBe("42501");
    // A recusa deliberada chega literal na tela: é ela que explica o motivo.
    expect(error.message).toMatch(/Apenas a plataforma/);
  });

  it("não lança quando a chamada explode (queda de rede)", async () => {
    supabase.rpc.mockImplementationOnce(() => {
      throw new Error("Failed to fetch");
    });
    const { data, error } = await definirMensalidade("t1", 300);
    expect(data).toBeNull();
    expect(error.message).toBe("Failed to fetch");
  });
});
