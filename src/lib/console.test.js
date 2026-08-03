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
  listarAnalitico,
  resumirUso,
  PERIODOS_ANALYTICS,
  resumirAddonsDoTenant,
  contarAddonsPorTenant,
  traduzirErroProvisionamento,
  ordenarPorUrgencia,
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

describe("listarAnalitico", () => {
  beforeEach(() => {
    supabase.reset();
    supabase.rpc.mockClear();
  });

  it("chama a RPC com o nome de parâmetro do contrato da 20260912", async () => {
    supabase.setRpcResult("analytics_plataforma", {
      data: [{ tenant_id: "t1", faturamento_centavos: 12345, pedidos: 3, ultima_venda: "2026-08-01T10:00:00Z" }],
      error: null,
    });
    const { data, error } = await listarAnalitico(7);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    // Errar o nome do parâmetro devolve 42883 na cara do dono.
    expect(supabase.rpc).toHaveBeenCalledWith("analytics_plataforma", { p_dias: 7 });
  });

  it("usa 30 dias quando ninguém escolhe período", async () => {
    await listarAnalitico();
    expect(supabase.rpc).toHaveBeenCalledWith("analytics_plataforma", { p_dias: 30 });
  });

  it("só oferece os três períodos que o banco aceita", () => {
    // A lista fechada da tela tem que bater com o `NOT IN (7, 30, 90)` da
    // RPC — divergir aqui vira check_violation na cara do dono.
    expect(PERIODOS_ANALYTICS).toEqual([7, 30, 90]);
  });

  it("devolve a recusa do banco com lista vazia, sem inventar sucesso", async () => {
    supabase.setRpcError("analytics_plataforma", {
      code: "42501",
      message: "Apenas a plataforma pode ver o uso dos estabelecimentos.",
    });
    const { data, error } = await listarAnalitico(30);
    expect(data).toEqual([]);
    expect(error.code).toBe("42501");
  });

  it("não lança quando a chamada explode (queda de rede)", async () => {
    supabase.rpc.mockImplementationOnce(() => {
      throw new Error("Failed to fetch");
    });
    const { data, error } = await listarAnalitico(30);
    expect(data).toEqual([]);
    expect(error.message).toBe("Failed to fetch");
  });
});

describe("resumirUso", () => {
  const HOJE = new Date("2026-08-01T12:00:00Z");
  const tenants = [
    { id: "t-forte",  nome: "Bar do Zé" },
    { id: "t-fraco",  nome: "Café Central" },
    { id: "t-parado", nome: "Pizza Nostra" },
    { id: "t-novo",   nome: "Novo Cliente" },
  ];
  // Todos pagam em dia, menos onde o teste disser o contrário.
  const assinaturas = [
    { tenant_id: "t-forte",  data_vencimento: "2026-08-20", carencia_dias: 3, status: "ativo" },
    { tenant_id: "t-fraco",  data_vencimento: "2026-08-20", carencia_dias: 3, status: "ativo" },
    { tenant_id: "t-parado", data_vencimento: "2026-08-20", carencia_dias: 3, status: "ativo" },
    { tenant_id: "t-novo",   data_vencimento: "2026-08-20", carencia_dias: 3, status: "ativo" },
  ];
  const analitico = [
    { tenant_id: "t-forte",  faturamento_centavos: 250075, pedidos: 25, ultima_venda: "2026-08-01T09:00:00Z" },
    { tenant_id: "t-fraco",  faturamento_centavos: 4050,   pedidos: 2,  ultima_venda: "2026-07-31T09:00:00Z" },
    // vendeu no passado, nada no período → zero com data antiga
    { tenant_id: "t-parado", faturamento_centavos: 0,      pedidos: 0,  ultima_venda: "2026-06-12T09:00:00Z" },
    // t-novo: a RPC não devolve linha para quem nunca vendeu
  ];

  it("devolve base vazia sem NaN nem divisão por zero", () => {
    const { linhas, kpis, pagandoSemUso } = resumirUso([], [], [], HOJE);
    expect(linhas).toEqual([]);
    expect(pagandoSemUso).toEqual([]);
    expect(kpis).toEqual({
      faturamentoCentavos: 0,
      pedidos: 0,
      ticketMedioCentavos: null,
      operando: 0,
      semUso: 0,
    });
  });

  it("ordena por faturamento e soma os KPIs em centavos inteiros", () => {
    const { linhas, kpis } = resumirUso(tenants, assinaturas, analitico, HOJE);
    // Empatados em zero (t-novo e t-parado) desempatam pelo nome, para a
    // ordem não dançar entre uma leitura e outra.
    expect(linhas.map((l) => l.tenantId)).toEqual(["t-forte", "t-fraco", "t-novo", "t-parado"]);
    // 250075 + 4050 = 254125 centavos. Em float (2500,75 + 40,50) o teste
    // continuaria passando; o ponto é que a conta nunca sai do inteiro.
    expect(kpis.faturamentoCentavos).toBe(254125);
    expect(Number.isInteger(kpis.faturamentoCentavos)).toBe(true);
    expect(kpis.pedidos).toBe(27);
    expect(kpis.ticketMedioCentavos).toBe(Math.round(254125 / 27));
    expect(Number.isInteger(kpis.ticketMedioCentavos)).toBe(true);
    expect(kpis.operando).toBe(2);
  });

  it("dá ticket médio nulo — nunca NaN — para quem não teve pedido", () => {
    const { linhas } = resumirUso(tenants, assinaturas, analitico, HOJE);
    const porId = Object.fromEntries(linhas.map((l) => [l.tenantId, l]));
    expect(porId["t-forte"].ticketMedioCentavos).toBe(Math.round(250075 / 25));
    expect(porId["t-parado"].ticketMedioCentavos).toBeNull();
    expect(porId["t-novo"].ticketMedioCentavos).toBeNull();
  });

  it("mantém na tabela quem não aparece na RPC, com zeros e sem última venda", () => {
    const { linhas } = resumirUso(tenants, assinaturas, analitico, HOJE);
    const novo = linhas.find((l) => l.tenantId === "t-novo");
    expect(novo).toBeDefined();
    expect(novo.faturamentoCentavos).toBe(0);
    expect(novo.pedidos).toBe(0);
    expect(novo.ultimaVenda).toBeNull();
    // null é o que a tela lê como "nunca vendeu" — diferente de 50 dias parado.
    expect(novo.diasSemVender).toBeNull();
  });

  it("conta há quantos dias foi a última venda, mesmo fora do período", () => {
    const { linhas } = resumirUso(tenants, assinaturas, analitico, HOJE);
    const porId = Object.fromEntries(linhas.map((l) => [l.tenantId, l]));
    expect(porId["t-forte"].diasSemVender).toBe(0);
    expect(porId["t-fraco"].diasSemVender).toBe(1);
    expect(porId["t-parado"].diasSemVender).toBe(50);
  });

  // A conta é de dias de CALENDÁRIO, não de intervalo decorrido. Uma venda das
  // 22h de ontem, lida às 9h de hoje, tem 11 horas de intervalo — se a conta
  // fosse `floor(decorrido/24h)` a tela diria "Hoje" para um estabelecimento
  // que ainda nem abriu o caixa, e o dono não veria que ele parou de vender.
  it("vira o dia na virada do calendário, não a cada 24 horas cheias", () => {
    const hoje = new Date("2026-08-01T09:00:00-03:00");
    const ontemANoite = [
      { tenant_id: "t-forte", faturamento_centavos: 1000, pedidos: 1, ultima_venda: "2026-07-31T22:00:00-03:00" },
    ];
    const { linhas } = resumirUso([tenants[0]], assinaturas, ontemANoite, hoje);
    expect(linhas[0].diasSemVender).toBe(1);
  });

  it("data de venda ilegível vira 'nunca vendeu', não NaN na tela", () => {
    const quebrado = [{ tenant_id: "t-forte", faturamento_centavos: 1000, pedidos: 1, ultima_venda: "ontem" }];
    const { linhas } = resumirUso([tenants[0]], assinaturas, quebrado, HOJE);
    expect(linhas[0].diasSemVender).toBeNull();
  });

  it("ignora tenant que veio na RPC e não está mais na lista de estabelecimentos", () => {
    const orfao = [...analitico, { tenant_id: "t-sumiu", faturamento_centavos: 999999, pedidos: 9, ultima_venda: null }];
    const { linhas, kpis } = resumirUso(tenants, assinaturas, orfao, HOJE);
    expect(linhas.map((l) => l.tenantId)).not.toContain("t-sumiu");
    expect(kpis.faturamentoCentavos).toBe(254125); // o órfão não entra na soma
  });

  it("lista quem paga e não vendeu, do parado há mais tempo para o menos", () => {
    const { pagandoSemUso, kpis } = resumirUso(tenants, assinaturas, analitico, HOJE);
    // t-novo nunca vendeu (o pior caso) vem antes de t-parado, parado há 50 dias.
    expect(pagandoSemUso.map((l) => l.tenantId)).toEqual(["t-novo", "t-parado"]);
    expect(kpis.semUso).toBe(2);
  });

  it("não trava a ordem quando dois nunca venderam", () => {
    const doisNovos = [
      { id: "t-a", nome: "A" },
      { id: "t-b", nome: "B" },
    ];
    const pagam = doisNovos.map((t) => ({
      tenant_id: t.id, data_vencimento: "2026-08-20", carencia_dias: 3, status: "ativo",
    }));
    const { pagandoSemUso } = resumirUso(doisNovos, pagam, [], HOJE);
    expect(pagandoSemUso).toHaveLength(2);
    expect(pagandoSemUso.every((l) => l.diasSemVender === null)).toBe(true);
  });

  it("mantém em carência no bloco de atenção — ainda é cliente que paga", () => {
    const emCarencia = [
      { tenant_id: "t-parado", data_vencimento: "2026-07-31", carencia_dias: 3, status: "ativo" },
    ];
    const { pagandoSemUso } = resumirUso(
      [{ id: "t-parado", nome: "Pizza Nostra" }], emCarencia, analitico, HOJE
    );
    expect(pagandoSemUso.map((l) => l.tenantId)).toEqual(["t-parado"]);
  });

  it("tira do bloco de atenção quem cancelou, bloqueou ou nunca teve assinatura", () => {
    const naoPagam = [
      { tenant_id: "t-parado", data_vencimento: "2026-08-20", carencia_dias: 3, status: "cancelado" },
      // venceu há 20 dias com carência de 3 → bloqueado, já parou de pagar
      { tenant_id: "t-fraco",  data_vencimento: "2026-07-12", carencia_dias: 3, status: "ativo" },
      // t-novo sem linha nenhuma de assinatura
    ];
    const semPedido = [
      { tenant_id: "t-fraco", faturamento_centavos: 0, pedidos: 0, ultima_venda: "2026-06-01T09:00:00Z" },
      { tenant_id: "t-parado", faturamento_centavos: 0, pedidos: 0, ultima_venda: "2026-06-12T09:00:00Z" },
    ];
    const { pagandoSemUso, kpis } = resumirUso(tenants, naoPagam, semPedido, HOJE);
    expect(pagandoSemUso).toEqual([]);
    expect(kpis.semUso).toBe(0);
  });

  it("aguenta faturamento negativo (estorno) sem quebrar a conta", () => {
    const estornado = [{ tenant_id: "t-forte", faturamento_centavos: -1500, pedidos: 2, ultima_venda: "2026-08-01T09:00:00Z" }];
    const { linhas, kpis } = resumirUso([tenants[0]], assinaturas, estornado, HOJE);
    expect(linhas[0].faturamentoCentavos).toBe(-1500);
    expect(linhas[0].ticketMedioCentavos).toBe(-750);
    expect(kpis.faturamentoCentavos).toBe(-1500);
  });

  it("trata listas ausentes como vazias em vez de explodir", () => {
    expect(() => resumirUso(undefined, undefined, undefined, HOJE)).not.toThrow();
    const { linhas } = resumirUso(tenants, null, null, HOJE);
    expect(linhas).toHaveLength(4);
    expect(linhas.every((l) => l.pedidos === 0)).toBe(true);
  });
});

// F022-ADDONS — o Console precisa distinguir três estados que o banco guarda
// de formas parecidas: nunca contratou (não tem linha), contratou e está
// ligado (`ativo = true`) e contratou e desligou (`ativo = false`, linha
// preservada). Confundir o terceiro com o primeiro faria a tela dizer
// "Desligado" para todo mundo — o que é verdade, mas apaga a informação de
// que aquele cliente já pagou por aquilo um dia.
describe("resumirAddonsDoTenant", () => {
  const catalogo = [
    { codigo: "nfe", nome: "Nota fiscal eletrônica", descricao: "Emite NFC-e no pagamento." },
    { codigo: "tef", nome: "Maquininha integrada", descricao: "Cartão direto pelo PDV." },
  ];

  it("marca como ligado só o que está ativo para AQUELE tenant", () => {
    const linhas = [
      { tenant_id: "t-1", addon_codigo: "nfe", ativo: true },
      { tenant_id: "t-2", addon_codigo: "tef", ativo: true },
    ];
    const r = resumirAddonsDoTenant(catalogo, linhas, "t-1");
    expect(r.map((a) => [a.codigo, a.ativo])).toEqual([["nfe", true], ["tef", false]]);
  });

  it("linha do outro tenant nunca vaza para o resumo", () => {
    const linhas = [{ tenant_id: "t-vizinho", addon_codigo: "nfe", ativo: true }];
    const r = resumirAddonsDoTenant(catalogo, linhas, "t-1");
    expect(r.every((a) => a.ativo === false)).toBe(true);
  });

  it("contratado e desligado conta como desligado (a linha existe, ativo é false)", () => {
    const linhas = [{ tenant_id: "t-1", addon_codigo: "nfe", ativo: false }];
    const [nfe] = resumirAddonsDoTenant(catalogo, linhas, "t-1");
    expect(nfe.ativo).toBe(false);
  });

  it("sai sempre o catálogo inteiro, na ordem do catálogo", () => {
    const r = resumirAddonsDoTenant(catalogo, [], "t-1");
    expect(r.map((a) => a.codigo)).toEqual(["nfe", "tef"]);
  });

  it("add-on do banco sem nome cai no código — a linha nunca fica sem rótulo", () => {
    const [a] = resumirAddonsDoTenant([{ codigo: "novo" }], [], "t-1");
    expect(a.nome).toBe("novo");
    expect(a.descricao).toBeNull();
  });

  it("tenant nulo não liga nada por acidente", () => {
    const linhas = [{ tenant_id: null, addon_codigo: "nfe", ativo: true }];
    expect(resumirAddonsDoTenant(catalogo, linhas, null).every((a) => !a.ativo)).toBe(true);
  });

  it("`ativo` fora do formato booleano não vale como ligado", () => {
    const linhas = [
      { tenant_id: "t-1", addon_codigo: "nfe", ativo: "true" },
      { tenant_id: "t-1", addon_codigo: "tef", ativo: 1 },
    ];
    expect(resumirAddonsDoTenant(catalogo, linhas, "t-1").every((a) => !a.ativo)).toBe(true);
  });

  it("trata listas ausentes como vazias em vez de explodir", () => {
    expect(resumirAddonsDoTenant(undefined, undefined, "t-1")).toEqual([]);
    expect(resumirAddonsDoTenant(catalogo, null, "t-1")).toHaveLength(2);
  });
});

describe("contarAddonsPorTenant", () => {
  it("conta um por tenant, só os ativos", () => {
    const linhas = [
      { tenant_id: "t-1", addon_codigo: "nfe", ativo: true },
      { tenant_id: "t-1", addon_codigo: "tef", ativo: true },
      { tenant_id: "t-2", addon_codigo: "nfe", ativo: true },
      { tenant_id: "t-3", addon_codigo: "nfe", ativo: false },
    ];
    expect(contarAddonsPorTenant(linhas)).toEqual({ "t-1": 2, "t-2": 1 });
  });

  it("tenant sem nada ligado simplesmente não aparece no mapa", () => {
    const c = contarAddonsPorTenant([{ tenant_id: "t-9", addon_codigo: "nfe", ativo: false }]);
    expect(c["t-9"]).toBeUndefined();
  });

  it("ignora linha sem tenant em vez de criar uma chave vazia", () => {
    expect(contarAddonsPorTenant([{ tenant_id: null, addon_codigo: "nfe", ativo: true }])).toEqual({});
  });

  it("trata lista ausente como vazia", () => {
    expect(contarAddonsPorTenant(undefined)).toEqual({});
    expect(contarAddonsPorTenant(null)).toEqual({});
  });
});

describe("traduzirErroProvisionamento", () => {
  it("traduz a colisão de credencial do Auth e aponta o campo do usuário", () => {
    const r = traduzirErroProvisionamento(
      "A user with this email address has already been registered"
    );
    expect(r.campo).toBe("adminUsername");
    expect(r.mensagem).toMatch(/já existe na plataforma/i);
    // Nada de inglês nem de "email" na tela: o dono digitou um USUÁRIO.
    expect(r.mensagem).not.toMatch(/email|registered/i);
    expect(r.aviso).toBe("");
  });

  it("reconhece as outras formas que o Auth usa para o mesmo erro", () => {
    for (const bruto of [
      "email_exists",
      "user_already_exists",
      'duplicate key value violates unique constraint "users_tenant_id_username_key"',
    ]) {
      expect(traduzirErroProvisionamento(bruto).campo).toBe("adminUsername");
    }
  });

  it("separa o aviso de compensação da mensagem do campo", () => {
    const r = traduzirErroProvisionamento(
      'A user with this email address has already been registered ATENÇÃO: o estabelecimento "Casa Coffee" (casacoffee) foi criado e NÃO pôde ser removido automaticamente: sem permissão. Remova antes de tentar de novo.'
    );
    expect(r.campo).toBe("adminUsername");
    expect(r.mensagem).not.toMatch(/ATENÇÃO/);
    // O órfão exige ação manual — o aviso não pode sumir junto com a tradução.
    expect(r.aviso).toMatch(/^ATENÇÃO:/);
    expect(r.aviso).toMatch(/Casa Coffee/);
  });

  it("deixa passar intacto o erro que não conhece", () => {
    const r = traduzirErroProvisionamento("Plano inexistente no catálogo.");
    expect(r).toEqual({
      campo: null,
      mensagem: "Plano inexistente no catálogo.",
      aviso: "",
    });
  });

  it("nunca devolve mensagem vazia", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      expect(traduzirErroProvisionamento(vazio)).toEqual({
        campo: null,
        mensagem: "Falha ao criar o estabelecimento.",
        aviso: "",
      });
    }
  });
});

describe("ordenarPorUrgencia", () => {
  const linha = (tenantId, status, diasParaVencer = null) => ({ tenantId, status, diasParaVencer });
  const ids = (lista) => lista.map((t) => t.id);

  it("põe quem precisa de ação no topo, na ordem sem assinatura → bloqueado → carência → vencendo", () => {
    const tenants = [
      { id: "folgado" },
      { id: "vencendo" },
      { id: "carencia" },
      { id: "bloqueado" },
      { id: "sem" },
    ];
    const linhas = [
      linha("folgado", "ativo", 40),
      linha("vencendo", "ativo", 3),
      linha("carencia", "carencia", -2),
      linha("bloqueado", "bloqueado", -30),
      linha("sem", "sem_assinatura"),
    ];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual([
      "sem",
      "bloqueado",
      "carencia",
      "vencendo",
      "folgado",
    ]);
  });

  it("dentro do mesmo status, quem vence antes vem primeiro", () => {
    const tenants = [{ id: "b" }, { id: "a" }, { id: "c" }];
    const linhas = [
      linha("b", "ativo", 4),
      linha("a", "ativo", 0),
      linha("c", "ativo", 2),
    ];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["a", "c", "b"]);
  });

  it("mantém a ordem original de quem não precisa de atenção", () => {
    const tenants = [{ id: "x" }, { id: "y" }, { id: "urgente" }, { id: "z" }];
    const linhas = [
      linha("x", "ativo", 30),
      linha("y", "cancelado", -100),
      linha("urgente", "bloqueado", -9),
      linha("z", "ativo", 60),
    ];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["urgente", "x", "y", "z"]);
  });

  it("empate total cai na ordem original — a lista não dança entre renders", () => {
    const tenants = [{ id: "primeiro" }, { id: "segundo" }];
    const linhas = [linha("primeiro", "carencia", -3), linha("segundo", "carencia", -3)];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["primeiro", "segundo"]);
    // e ao contrário, para provar que é a ordem de entrada e não o id
    expect(ids(ordenarPorUrgencia([...tenants].reverse(), linhas))).toEqual([
      "segundo",
      "primeiro",
    ]);
  });

  it("cancelado não sobe: é decisão já resolvida, não pendência", () => {
    const tenants = [{ id: "ativo" }, { id: "cancelado" }];
    const linhas = [linha("ativo", "ativo", 20), linha("cancelado", "cancelado", -50)];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["ativo", "cancelado"]);
  });

  it("tenant sem linha de situação fica onde estava, sem quebrar", () => {
    const tenants = [{ id: "orfao" }, { id: "sem" }];
    const linhas = [linha("sem", "sem_assinatura")];
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["sem", "orfao"]);
  });

  it("é pura: não altera os arrays recebidos", () => {
    const tenants = [{ id: "a" }, { id: "b" }];
    const linhas = [linha("a", "ativo", 40), linha("b", "bloqueado", -1)];
    const copia = [...tenants];
    ordenarPorUrgencia(tenants, linhas);
    expect(tenants).toEqual(copia);
    expect(tenants[0].id).toBe("a");
  });

  it("aguenta lista vazia, um só item e argumentos ausentes", () => {
    expect(ordenarPorUrgencia([], [])).toEqual([]);
    expect(ordenarPorUrgencia()).toEqual([]);
    expect(ids(ordenarPorUrgencia([{ id: "unico" }], []))).toEqual(["unico"]);
  });

  it("usa a mesma régua do alerta de validade de resumirPlataforma", () => {
    const HOJE = new Date("2026-03-10T12:00:00Z");
    const tenants = [
      { id: "t1", nome: "Folgado", plano_codigo: "basico" },
      { id: "t2", nome: "Vencendo", plano_codigo: "basico" },
    ];
    const assinaturas = [
      { tenant_id: "t1", valor_mensal: 100, data_vencimento: "2026-12-01", carencia_dias: 5, status: "ativo" },
      { tenant_id: "t2", valor_mensal: 100, data_vencimento: "2026-03-12", carencia_dias: 5, status: "ativo" },
    ];
    const { linhas, precisamAtencao } = resumirPlataforma(tenants, [], assinaturas, HOJE);
    expect(precisamAtencao.map((l) => l.tenantId)).toEqual(["t2"]);
    expect(ids(ordenarPorUrgencia(tenants, linhas))).toEqual(["t2", "t1"]);
  });
});
