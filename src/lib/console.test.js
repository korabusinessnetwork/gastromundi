import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  provisionarEstabelecimento,
  normalizarSlug,
  sugerirSlugLivre,
  MAX_SLUG,
  validarNovoEstabelecimento,
  resumirPlataforma,
  compararModulosDoPlano,
  definirMensalidade,
  listarAnalitico,
  resumirUso,
  PERIODOS_ANALYTICS,
  resumirAddonsDoTenant,
  contarAddonsPorTenant,
  montarMensagemPrimeiroAcesso,
  traduzirErroProvisionamento,
  mensagemDeErroDoConsole,
  ordenarPorUrgencia,
  filtrarEstabelecimentos,
  filtrarPorSituacao,
  normalizarFiltroSituacao,
  FILTROS_SITUACAO,
  normalizarAba,
  ABAS_CONSOLE,
  normalizarPeriodo,
  PERIODO_PADRAO,
  filtrarPorPlano,
  normalizarFiltroPlano,
  contarPorPlano,
  gerarSenhaProvisoria,
  forcaDaSenha,
  sugerirUsuarioLivre,
  usernameSugeridoDoNome,
  MAX_USERNAME,
  MIN_USERNAME,
  cadastroTemDados,
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
    slug: "restaurantedosul",
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
      ["adminNome", "adminPassword", "adminUsername", "nome", "planoCodigo", "slug"].sort()
    );
  });

  it("exige o endereço do cardápio quando o nome não gera nenhuma letra", () => {
    const { ok, erros } = validarNovoEstabelecimento({ ...valido, slug: "@@@" });
    expect(ok).toBe(false);
    expect(erros.slug).toContain("Informe o endereço");
  });

  it("recusa endereço já ocupado e diz qual usar", () => {
    const { ok, erros } = validarNovoEstabelecimento(
      { ...valido, slug: "bardoze" },
      ["bardoze", "outroqualquer"]
    );
    expect(ok).toBe(false);
    expect(erros.slug).toContain("bardoze2");
  });

  it("recusa endereço reservado pelo sistema", () => {
    const { ok, erros } = validarNovoEstabelecimento({ ...valido, slug: "console" });
    expect(ok).toBe(false);
    expect(erros.slug).toContain("reservado");
    expect(erros.slug).toContain("console2");
  });

  it("compara endereços já normalizados — 'Bar do Zé' ocupa 'bardoze'", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, slug: "Bar do Zé" }, ["bardoze"]);
    expect(erros.slug).toBeTruthy();
  });

  it("lista de ocupados vazia não inventa conflito", () => {
    const { ok } = validarNovoEstabelecimento({ ...valido, slug: "bardoze" }, []);
    expect(ok).toBe(true);
  });
});

describe("normalizarSlug", () => {
  it("tira acento, espaço e maiúscula — igual ao slugify_tenant do banco", () => {
    expect(normalizarSlug("Bar do Zé")).toBe("bardoze");
    expect(normalizarSlug("  Café ☕  ")).toBe("cafe");
  });

  it("apaga hífen e ponto — o banco não guarda separador nenhum", () => {
    expect(normalizarSlug("bar-do-ze")).toBe("bardoze");
    expect(normalizarSlug("bar.do.ze")).toBe("bardoze");
  });

  it("corta em MAX_SLUG caracteres", () => {
    expect(normalizarSlug("a".repeat(60))).toHaveLength(MAX_SLUG);
  });

  it("devolve vazio para entrada sem letra nem número", () => {
    expect(normalizarSlug("@@@ !!!")).toBe("");
    expect(normalizarSlug(null)).toBe("");
    expect(normalizarSlug(undefined)).toBe("");
  });
});

describe("sugerirSlugLivre", () => {
  it("devolve a própria base quando ela está livre", () => {
    expect(sugerirSlugLivre("bardoze", ["outro"])).toBe("bardoze");
  });

  it("pula os ocupados em cadeia", () => {
    expect(sugerirSlugLivre("bardoze", ["bardoze", "bardoze2"])).toBe("bardoze3");
  });

  it("pula rótulo reservado — mesmo laço da RPC provisionar_tenant", () => {
    expect(sugerirSlugLivre("console", [])).toBe("console2");
  });

  it("normaliza a base antes de sugerir", () => {
    expect(sugerirSlugLivre("Bar do Zé", ["bardoze"])).toBe("bardoze2");
  });

  it("devolve vazio quando não sobra nada da base", () => {
    expect(sugerirSlugLivre("@@@", [])).toBe("");
  });
});

describe("gerarSenhaProvisoria", () => {
  it("devolve 10 caracteres", () => {
    expect(gerarSenhaProvisoria()).toHaveLength(10);
  });

  it("não usa caractere que se confunde ao ditar (0 1 l i o O e maiúscula)", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(gerarSenhaProvisoria()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
    }
  });

  it("sempre tem ao menos uma letra e ao menos um dígito", () => {
    for (let i = 0; i < 200; i += 1) {
      const senha = gerarSenhaProvisoria();
      expect(senha).toMatch(/[a-z]/);
      expect(senha).toMatch(/\d/);
    }
  });

  it("não deixa a letra e o dígito obrigatórios sempre nas duas primeiras posições", () => {
    // Sem o embaralhamento, senha[0] seria letra e senha[1] dígito em 100% dos
    // sorteios — o que vazaria o formato para quem visse duas senhas.
    const amostras = Array.from({ length: 200 }, () => gerarSenhaProvisoria());
    expect(amostras.some((s) => /\d/.test(s[0]))).toBe(true);
    expect(amostras.some((s) => /[a-z]/.test(s[1]))).toBe(true);
  });

  it("sorteia com crypto.getRandomValues, nunca com Math.random", () => {
    const espiaoCrypto = vi.spyOn(globalThis.crypto, "getRandomValues");
    const espiaoMath = vi.spyOn(Math, "random");
    gerarSenhaProvisoria();
    expect(espiaoCrypto).toHaveBeenCalled();
    expect(espiaoMath).not.toHaveBeenCalled();
    espiaoCrypto.mockRestore();
    espiaoMath.mockRestore();
  });

  it("duas chamadas seguidas não devolvem a mesma senha", () => {
    const senhas = new Set(Array.from({ length: 50 }, () => gerarSenhaProvisoria()));
    expect(senhas.size).toBe(50);
  });

  it("passa na validação do formulário (mínimo de 6, máximo de 100)", () => {
    const { ok, erros } = validarNovoEstabelecimento({
      nome: "Restaurante do Sul",
      slug: "restaurantedosul",
      planoCodigo: "avancado",
      adminNome: "Maria",
      adminUsername: "maria",
      adminPassword: gerarSenhaProvisoria(),
    });
    expect(ok).toBe(true);
    expect(erros).toEqual({});
  });

  it("a senha gerada é lida como forte", () => {
    expect(forcaDaSenha(gerarSenhaProvisoria()).nivel).toBe("forte");
  });
});

describe("forcaDaSenha", () => {
  it("não avalia campo vazio", () => {
    expect(forcaDaSenha("")).toEqual({ nivel: "", motivo: "" });
    expect(forcaDaSenha(null).nivel).toBe("");
    expect(forcaDaSenha(undefined).nivel).toBe("");
  });

  it.each([
    ["123456", "senha óbvia"],
    ["senha", "senha óbvia"],
    ["admin123", "senha óbvia"],
    ["mudar123", "senha óbvia"],
    ["qwerty", "senha óbvia"],
    ["000000", "senha óbvia"],
    ["abc123", "senha óbvia"],
    ["ab1c", "curta demais"],
    ["987654321", "só dígitos"],
    ["abcdefghijkl", "só letras"],
  ])("marca %s como fraca (%s)", (senha) => {
    const { nivel, motivo } = forcaDaSenha(senha);
    expect(nivel).toBe("fraca");
    expect(motivo).toBeTruthy();
  });

  it("marca como fraca a senha igual ao usuário digitado", () => {
    const { nivel, motivo } = forcaDaSenha("bardozegrill", "bardozegrill");
    expect(nivel).toBe("fraca");
    expect(motivo).toContain("usuário");
  });

  it("compara com o usuário já normalizado", () => {
    // "Bar do Zé" normaliza para "bardoze" — a senha idêntica ao login é fraca
    // mesmo que o dono tenha digitado o usuário com acento e espaço.
    const { nivel, motivo } = forcaDaSenha("bardozegrill", "Bar do Zé Grill");
    expect(nivel).toBe("fraca");
    expect(motivo).toContain("usuário");
  });

  it("não confunde senha boa com o usuário quando o campo usuário está vazio", () => {
    expect(forcaDaSenha("kx7mrapqz4", "").nivel).toBe("forte");
  });

  it("aceita senha longa colada de gerenciador como forte, sem inventar regra", () => {
    expect(forcaDaSenha("Xk!9rTq#2wLm7vZp").nivel).toBe("forte");
  });

  it("chama de razoável a senha que só falta um empurrão", () => {
    const { nivel, motivo } = forcaDaSenha("casaverd1");
    expect(nivel).toBe("media");
    expect(motivo).toBeTruthy();
  });

  it("é pura: a mesma entrada devolve sempre o mesmo resultado", () => {
    expect(forcaDaSenha("casaverd1")).toEqual(forcaDaSenha("casaverd1"));
  });
});

describe("cadastroTemDados", () => {
  it("formulário recém-aberto não tem nada a perder", () => {
    expect(cadastroTemDados({})).toBe(false);
    expect(
      cadastroTemDados({
        nome: "", slug: "", endereco: "", mensalidade: "",
        adminNome: "", adminUsername: "", adminPassword: "",
      })
    ).toBe(false);
  });

  it("qualquer campo digitável preenchido conta", () => {
    expect(cadastroTemDados({ nome: "Bar do Zé" })).toBe(true);
    expect(cadastroTemDados({ slug: "bardoze" })).toBe(true);
    expect(cadastroTemDados({ endereco: "Rua A, 100" })).toBe(true);
    expect(cadastroTemDados({ mensalidade: "300,00" })).toBe(true);
    expect(cadastroTemDados({ adminNome: "José" })).toBe(true);
    expect(cadastroTemDados({ adminUsername: "jose" })).toBe(true);
    expect(cadastroTemDados({ adminPassword: "senha-forte" })).toBe(true);
  });

  it("o plano escolhido sozinho não conta — ele já vem selecionado", () => {
    expect(cadastroTemDados({ planoCodigo: "avancado" })).toBe(false);
  });

  it("espaço em branco não é dado que se lamente perder", () => {
    expect(cadastroTemDados({ nome: "   ", adminNome: "\t" })).toBe(false);
  });

  it("senha só de espaço conta — ali espaço é caractere de verdade", () => {
    expect(cadastroTemDados({ adminPassword: "  " })).toBe(true);
  });

  it("não olha nada além dos campos que conhece e não muda a entrada", () => {
    const form = { nome: "Bar do Zé", adminPassword: "abc" };
    const copia = { ...form };
    cadastroTemDados(form);
    expect(form).toEqual(copia);
    expect(cadastroTemDados({ enviando: true, erros: { nome: "x" } })).toBe(false);
  });
});

describe("usernameSugeridoDoNome", () => {
  it("transforma o nome do responsável num usuário válido", () => {
    expect(usernameSugeridoDoNome("José Maria")).toBe("josemaria");
    expect(usernameSugeridoDoNome("  Ana  Paula  ")).toBe("anapaula");
    expect(usernameSugeridoDoNome("MARIA OLIVEIRA")).toBe("mariaoliveira");
  });

  it("deixa em paz quem já digitou um usuário", () => {
    expect(usernameSugeridoDoNome("admin")).toBe("admin");
    expect(usernameSugeridoDoNome("bar.do.ze")).toBe("bar.do.ze");
  });

  it("respeita o limite do campo e não termina em separador", () => {
    const longo = usernameSugeridoDoNome(`${"a".repeat(29)}.${"b".repeat(20)}`);
    expect(longo.length).toBeLessThanOrEqual(MAX_USERNAME);
    expect(longo).toBe("a".repeat(29));

    const cortadoNoPonto = usernameSugeridoDoNome(`${"a".repeat(30)}.silva`);
    expect(cortadoNoPonto).toBe("a".repeat(30));
  });

  it("devolve vazio quando o nome não dá um usuário aceitável", () => {
    // Melhor campo vazio que campo com algo que a validação vai recusar.
    expect(usernameSugeridoDoNome("Zé")).toBe("");
    expect(usernameSugeridoDoNome("!!!")).toBe("");
    expect(usernameSugeridoDoNome("")).toBe("");
    expect(usernameSugeridoDoNome(null)).toBe("");
    expect(usernameSugeridoDoNome(undefined)).toBe("");
  });

  it("o que ele devolve passa na validação do formulário", () => {
    const base = {
      nome: "Bar do Zé", slug: "bardoze", planoCodigo: "avancado",
      adminNome: "José Maria", adminPassword: "senha123",
    };
    for (const nome of ["José Maria", "Ana", "MARIA OLIVEIRA", "a".repeat(90)]) {
      const usuario = usernameSugeridoDoNome(nome);
      expect(usuario.length).toBeGreaterThanOrEqual(MIN_USERNAME);
      expect(validarNovoEstabelecimento({ ...base, adminUsername: usuario }).ok).toBe(true);
    }
  });

  it("é pura — mesma entrada, mesma saída", () => {
    expect(usernameSugeridoDoNome("José Maria")).toBe(usernameSugeridoDoNome("José Maria"));
  });
});

describe("sugerirUsuarioLivre", () => {
  it("junta o usuário ao endereço da loja na primeira recusa", () => {
    expect(sugerirUsuarioLivre("admin", { slug: "bardoze", tentativa: 1 })).toBe("admin.bardoze");
  });

  it("muda o candidato a cada nova recusa do mesmo texto", () => {
    const opcoes = { slug: "bardoze" };
    const candidatos = [1, 2, 3, 4].map((t) =>
      sugerirUsuarioLivre("admin", { ...opcoes, tentativa: t })
    );
    expect(candidatos).toEqual(["admin.bardoze", "admin.bardoze2", "admin.bardoze3", "admin.bardoze4"]);
    expect(new Set(candidatos).size).toBe(4);
  });

  it("não repete a loja quando o usuário já termina nela", () => {
    expect(sugerirUsuarioLivre("admin.bardoze", { slug: "bardoze", tentativa: 1 })).toBe("admin.bardoze2");
    expect(sugerirUsuarioLivre("admin.bardoze", { slug: "bardoze", tentativa: 2 })).toBe("admin.bardoze3");
  });

  it("cai no número quando não há endereço utilizável", () => {
    expect(sugerirUsuarioLivre("admin", { slug: "", tentativa: 1 })).toBe("admin2");
    expect(sugerirUsuarioLivre("admin", { tentativa: 2 })).toBe("admin3");
    expect(sugerirUsuarioLivre("admin")).toBe("admin2");
  });

  it("normaliza o que recebe, como o servidor faria", () => {
    expect(sugerirUsuarioLivre("  José Maria ", { slug: "Bar do Zé", tentativa: 1 })).toBe(
      "josemaria.bardoze"
    );
  });

  it("respeita o limite do campo cortando a base, nunca o número", () => {
    const longo = "a".repeat(28);
    const candidato = sugerirUsuarioLivre(longo, { slug: "bardoze", tentativa: 3 });
    expect(candidato.length).toBeLessThanOrEqual(MAX_USERNAME);
    expect(candidato.endsWith("3")).toBe(true);
  });

  it("nunca devolve o usuário que acabou de ser recusado", () => {
    const casos = [
      ["admin", "bardoze"],
      ["a".repeat(30), "bardoze"],
      ["a".repeat(29) + "2", ""],
      ["admin.bardoze", "bardoze"],
    ];
    for (const [usuario, slug] of casos) {
      for (const tentativa of [1, 2, 3]) {
        const candidato = sugerirUsuarioLivre(usuario, { slug, tentativa });
        expect(candidato).not.toBe(normalizarUsername(usuario));
      }
    }
  });

  it("devolve candidato que passa na validação do formulário", () => {
    const candidato = sugerirUsuarioLivre("ana", { slug: "bardoze", tentativa: 1 });
    const { ok } = validarNovoEstabelecimento({
      nome: "Bar do Zé",
      slug: "bardoze",
      planoCodigo: "essencial",
      adminNome: "Ana",
      adminUsername: candidato,
      adminPassword: "senha-forte-123",
    });
    expect(ok).toBe(true);
  });

  it("devolve vazio quando não sobra nada do usuário", () => {
    expect(sugerirUsuarioLivre("", { slug: "bardoze" })).toBe("");
    expect(sugerirUsuarioLivre("!!!", { slug: "bardoze" })).toBe("");
    expect(sugerirUsuarioLivre(null)).toBe("");
  });

  it("é pura: a mesma entrada devolve sempre o mesmo candidato", () => {
    const opcoes = { slug: "bardoze", tentativa: 2 };
    expect(sugerirUsuarioLivre("admin", opcoes)).toBe(sugerirUsuarioLivre("admin", opcoes));
  });
});

describe("provisionarEstabelecimento — o endereço no corpo", () => {
  const base = {
    nome: "Bar do Zé",
    planoCodigo: "avancado",
    adminNome: "José",
    adminUsername: "barze",
    adminPassword: "senha123",
  };

  function corpoEnviado() {
    return JSON.parse(global.fetch.mock.calls[0][1].body);
  }

  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ tenant_id: "t-1" }) })
    );
  });

  it("manda o slug escolhido, normalizado", async () => {
    await provisionarEstabelecimento({ ...base, slug: "Bar do Zé" });
    expect(corpoEnviado().slug).toBe("bardoze");
  });

  it("sem slug, não manda o campo — a borda deriva do nome como sempre fez", async () => {
    await provisionarEstabelecimento(base);
    expect(corpoEnviado()).not.toHaveProperty("slug");
  });

  it("slug que vira vazio também não vai — não sobrescreve o fallback do servidor", async () => {
    await provisionarEstabelecimento({ ...base, slug: "@@@" });
    expect(corpoEnviado()).not.toHaveProperty("slug");
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

describe("filtrarEstabelecimentos", () => {
  const BASE = [
    { id: "a", nome: "Café Central" },
    { id: "b", nome: "Bar do Zé" },
    { id: "c", nome: "Padaria São João" },
  ];
  const ids = (lista) => lista.map((t) => t.id);

  it("ignora acento e caixa nos dois lados", () => {
    expect(ids(filtrarEstabelecimentos(BASE, "cafe"))).toEqual(["a"]);
    expect(ids(filtrarEstabelecimentos(BASE, "CAFÉ"))).toEqual(["a"]);
    expect(ids(filtrarEstabelecimentos(BASE, "sao joao"))).toEqual(["c"]);
    expect(ids(filtrarEstabelecimentos(BASE, "ZE"))).toEqual(["b"]);
  });

  it("casa com qualquer trecho do nome, não só com o começo", () => {
    expect(ids(filtrarEstabelecimentos(BASE, "central"))).toEqual(["a"]);
    expect(ids(filtrarEstabelecimentos(BASE, "do"))).toEqual(["b"]);
  });

  it("devolve a lista inteira, na ordem, com termo vazio ou só espaços", () => {
    expect(ids(filtrarEstabelecimentos(BASE, ""))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarEstabelecimentos(BASE, "   "))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarEstabelecimentos(BASE))).toEqual(["a", "b", "c"]);
  });

  it("ignora espaços nas pontas do termo", () => {
    expect(ids(filtrarEstabelecimentos(BASE, "  bar  "))).toEqual(["b"]);
  });

  it("devolve lista vazia quando nada casa", () => {
    expect(filtrarEstabelecimentos(BASE, "pizzaria")).toEqual([]);
  });

  it("não quebra com nome nulo, vazio ou item ausente", () => {
    const sujos = [{ id: "x", nome: null }, { id: "y" }, { id: "z", nome: "" }, null];
    expect(() => filtrarEstabelecimentos(sujos, "bar")).not.toThrow();
    expect(filtrarEstabelecimentos(sujos, "bar")).toEqual([]);
  });

  it("é pura: não muda o array recebido nem devolve a mesma referência", () => {
    const copia = [...BASE];
    const saida = filtrarEstabelecimentos(BASE, "");
    expect(BASE).toEqual(copia);
    expect(saida).not.toBe(BASE);
  });

  it("aguenta lista vazia e argumentos ausentes", () => {
    expect(filtrarEstabelecimentos([], "bar")).toEqual([]);
    expect(filtrarEstabelecimentos()).toEqual([]);
  });

  it("preserva a ordem que veio (a urgência da rodada 2 continua valendo)", () => {
    const ordenado = [BASE[2], BASE[0], BASE[1]];
    expect(ids(filtrarEstabelecimentos(ordenado, "a"))).toEqual(["c", "a", "b"]);
  });

  // CONSOLE-UX rodada 17 — o endereço (slug) também acha, porque é assim que o
  // cliente se identifica ao dono ("meu link é casacoffee").
  describe("busca pelo endereço (slug)", () => {
    const COM_SLUG = [
      { id: "a", nome: "Café Central", slug: "cafecentral" },
      { id: "b", nome: "Bar do Zé", slug: "bar-do-ze" },
      { id: "c", nome: "Padaria São João", slug: "padariasj" },
    ];

    it("casa qualquer trecho do endereço, ignorando caixa e espaço nas pontas", () => {
      expect(ids(filtrarEstabelecimentos(COM_SLUG, "sj"))).toEqual(["c"]);
      expect(ids(filtrarEstabelecimentos(COM_SLUG, "PADARIASJ"))).toEqual(["c"]);
      expect(ids(filtrarEstabelecimentos(COM_SLUG, "  bar-do  "))).toEqual(["b"]);
    });

    it("continua achando pelo nome quem tem endereço", () => {
      expect(ids(filtrarEstabelecimentos(COM_SLUG, "são joão"))).toEqual(["c"]);
    });

    it("traz os dois quando o termo casa o nome de um e o endereço de outro, sem duplicar", () => {
      const mistos = [
        { id: "a", nome: "Casa Coffee", slug: "cc" },
        { id: "b", nome: "Bar do Zé", slug: "casacoffee-2" },
        { id: "c", nome: "Casa Coffee", slug: "casacoffee" },
      ];
      expect(ids(filtrarEstabelecimentos(mistos, "casacoffee"))).toEqual(["b", "c"]);
      // nome e endereço iguais no mesmo item: aparece uma vez só
      expect(ids(filtrarEstabelecimentos(mistos, "casa"))).toEqual(["a", "b", "c"]);
    });

    it("item sem endereço não quebra e segue achável pelo nome", () => {
      const legado = [
        { id: "x", nome: "Sem Slug", slug: null },
        { id: "y", nome: "Outro" },
        { id: "z", nome: "Vazio", slug: "" },
      ];
      expect(() => filtrarEstabelecimentos(legado, "slug")).not.toThrow();
      expect(ids(filtrarEstabelecimentos(legado, "sem"))).toEqual(["x"]);
      expect(filtrarEstabelecimentos(legado, "cafecentral")).toEqual([]);
    });
  });
});

// CONSOLE-UX rodada 6 — o recorte por situação. A função NÃO decide quem está
// com problema: recebe o conjunto pronto da mesma régua que ordena a lista.
// O que ela precisa garantir é que filtro inválido não esconda ninguém e que
// os dois recortes somem exatamente a base.
describe("filtrarPorSituacao", () => {
  const BASE = [
    { id: "a", nome: "Café Central" },
    { id: "b", nome: "Bar do Zé" },
    { id: "c", nome: "Padaria São João" },
  ];
  const ids = (lista) => lista.map((t) => t.id);
  const pendentes = new Set(["a", "c"]);

  it("'atencao' devolve só quem está no conjunto", () => {
    expect(ids(filtrarPorSituacao(BASE, "atencao", pendentes))).toEqual(["a", "c"]);
  });

  it("'em_dia' devolve exatamente o complemento", () => {
    expect(ids(filtrarPorSituacao(BASE, "em_dia", pendentes))).toEqual(["b"]);
  });

  it("os dois recortes somam a base, sem sobra nem repetição", () => {
    const atencao = filtrarPorSituacao(BASE, "atencao", pendentes);
    const emDia = filtrarPorSituacao(BASE, "em_dia", pendentes);
    expect(atencao.length + emDia.length).toBe(BASE.length);
    expect(new Set([...ids(atencao), ...ids(emDia)]).size).toBe(BASE.length);
  });

  it("'todos' devolve a lista inteira, na ordem recebida", () => {
    expect(ids(filtrarPorSituacao(BASE, "todos", pendentes))).toEqual(["a", "b", "c"]);
  });

  it("filtro desconhecido, vazio ou ausente não esconde ninguém", () => {
    expect(ids(filtrarPorSituacao(BASE, "bloqueado", pendentes))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarPorSituacao(BASE, "", pendentes))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarPorSituacao(BASE))).toEqual(["a", "b", "c"]);
  });

  it("conjunto vazio: 'atencao' fica vazio e 'em_dia' fica com todos", () => {
    expect(filtrarPorSituacao(BASE, "atencao", new Set())).toEqual([]);
    expect(ids(filtrarPorSituacao(BASE, "em_dia", new Set()))).toEqual(["a", "b", "c"]);
  });

  it("conjunto ausente não quebra — trata como ninguém pendente", () => {
    expect(filtrarPorSituacao(BASE, "atencao", undefined)).toEqual([]);
    expect(ids(filtrarPorSituacao(BASE, "em_dia", undefined))).toEqual(["a", "b", "c"]);
  });

  it("é pura: não mexe no array recebido", () => {
    const original = [...BASE];
    filtrarPorSituacao(BASE, "atencao", pendentes);
    expect(BASE).toEqual(original);
    expect(filtrarPorSituacao(BASE, "todos", pendentes)).not.toBe(BASE);
  });

  it("lista vazia e argumentos ausentes devolvem vazio", () => {
    expect(filtrarPorSituacao([], "atencao", pendentes)).toEqual([]);
    expect(filtrarPorSituacao()).toEqual([]);
    expect(filtrarPorSituacao(null, "em_dia", pendentes)).toEqual([]);
  });

  it("preserva a ordem por urgência que veio da rodada 2", () => {
    const ordenado = [BASE[2], BASE[0], BASE[1]];
    expect(ids(filtrarPorSituacao(ordenado, "atencao", pendentes))).toEqual(["c", "a"]);
  });
});

describe("normalizarFiltroSituacao", () => {
  it("devolve os três recortes válidos como estão", () => {
    expect(normalizarFiltroSituacao("todos")).toBe("todos");
    expect(normalizarFiltroSituacao("atencao")).toBe("atencao");
    expect(normalizarFiltroSituacao("em_dia")).toBe("em_dia");
  });

  it("valor desconhecido vira 'todos' — URL editada à mão não esconde ninguém", () => {
    expect(normalizarFiltroSituacao("xpto")).toBe("todos");
    expect(normalizarFiltroSituacao("bloqueado")).toBe("todos");
  });

  it("não aceita caixa diferente: o parâmetro é código, não texto de tela", () => {
    expect(normalizarFiltroSituacao("ATENCAO")).toBe("todos");
    expect(normalizarFiltroSituacao("Em_Dia")).toBe("todos");
  });

  it("parâmetro ausente ou vazio vira 'todos'", () => {
    expect(normalizarFiltroSituacao(null)).toBe("todos");
    expect(normalizarFiltroSituacao(undefined)).toBe("todos");
    expect(normalizarFiltroSituacao("")).toBe("todos");
    expect(normalizarFiltroSituacao()).toBe("todos");
  });

  it("chave repetida (array) vira 'todos' — não há escolha honesta entre duas", () => {
    expect(normalizarFiltroSituacao(["atencao", "em_dia"])).toBe("todos");
    expect(normalizarFiltroSituacao(["atencao"])).toBe("todos");
  });

  it("tipo estranho não quebra", () => {
    expect(normalizarFiltroSituacao(3)).toBe("todos");
    expect(normalizarFiltroSituacao({})).toBe("todos");
    expect(normalizarFiltroSituacao(true)).toBe("todos");
  });

  it("o que ela devolve é sempre aceito por filtrarPorSituacao", () => {
    for (const bruto of ["atencao", "em_dia", "todos", "xpto", null]) {
      expect(FILTROS_SITUACAO).toContain(normalizarFiltroSituacao(bruto));
    }
  });
});

describe("normalizarAba", () => {
  it("deixa passar as seções do Console", () => {
    expect(normalizarAba("estabelecimentos")).toBe("estabelecimentos");
    expect(normalizarAba("planos")).toBe("planos");
    expect(normalizarAba("uso")).toBe("uso");
    expect(normalizarAba("leads")).toBe("leads");
  });

  it("valor desconhecido cai na primeira aba — Console nunca abre vazio", () => {
    expect(normalizarAba("xpto")).toBe("estabelecimentos");
    expect(normalizarAba("assinaturas")).toBe("estabelecimentos");
  });

  it("caixa diferente não passa: a URL é comparada como está escrita", () => {
    expect(normalizarAba("PLANOS")).toBe("estabelecimentos");
    expect(normalizarAba("Uso")).toBe("estabelecimentos");
  });

  it("ausente, vazio ou nulo cai na primeira aba", () => {
    expect(normalizarAba(null)).toBe("estabelecimentos");
    expect(normalizarAba(undefined)).toBe("estabelecimentos");
    expect(normalizarAba("")).toBe("estabelecimentos");
    expect(normalizarAba()).toBe("estabelecimentos");
  });

  it("parâmetro repetido (array) cai na primeira aba", () => {
    expect(normalizarAba(["planos", "uso"])).toBe("estabelecimentos");
    expect(normalizarAba(["planos"])).toBe("estabelecimentos");
  });

  it("o que ela devolve é sempre uma aba conhecida", () => {
    for (const bruto of ["planos", "uso", "leads", "xpto", null, 7, {}]) {
      expect(ABAS_CONSOLE).toContain(normalizarAba(bruto));
    }
  });
});

describe("normalizarPeriodo", () => {
  it("deixa passar os três períodos oferecidos", () => {
    expect(normalizarPeriodo("7")).toBe(7);
    expect(normalizarPeriodo("30")).toBe(30);
    expect(normalizarPeriodo("90")).toBe(90);
  });

  it("número fora do conjunto cai no padrão — senão nenhum botão ficaria marcado", () => {
    expect(normalizarPeriodo("45")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo("0")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo("365")).toBe(PERIODO_PADRAO);
  });

  it("texto que não é um inteiro puro cai no padrão", () => {
    expect(normalizarPeriodo("abc")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo("90.0")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo("-30")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo(" 90")).toBe(PERIODO_PADRAO);
  });

  it("ausente, vazio ou nulo cai no padrão", () => {
    expect(normalizarPeriodo(null)).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo(undefined)).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo("")).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo()).toBe(PERIODO_PADRAO);
  });

  it("parâmetro repetido (array) e tipos estranhos caem no padrão", () => {
    expect(normalizarPeriodo(["7", "90"])).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo(90)).toBe(PERIODO_PADRAO);
    expect(normalizarPeriodo({})).toBe(PERIODO_PADRAO);
  });

  it("o que ela devolve é sempre um período conhecido", () => {
    for (const bruto of ["7", "90", "45", "abc", null, ""]) {
      expect(PERIODOS_ANALYTICS).toContain(normalizarPeriodo(bruto));
    }
  });

  it("o padrão é o mesmo que a tela já abria antes de existir a URL", () => {
    expect(PERIODO_PADRAO).toBe(30);
    expect(PERIODOS_ANALYTICS).toContain(PERIODO_PADRAO);
  });
});

describe("filtrarPorPlano", () => {
  const BASE = [
    { id: "a", nome: "Café Central", plano_codigo: "basico" },
    { id: "b", nome: "Bar do Zé", plano_codigo: "avancado" },
    { id: "c", nome: "Padaria São João", plano_codigo: "basico" },
    { id: "d", nome: "Sem plano ainda", plano_codigo: null },
  ];
  const ids = (lista) => lista.map((t) => t.id);

  it("devolve só quem está no plano pedido, na ordem recebida", () => {
    expect(ids(filtrarPorPlano(BASE, "basico"))).toEqual(["a", "c"]);
    expect(ids(filtrarPorPlano(BASE, "avancado"))).toEqual(["b"]);
  });

  it("'todos' devolve a base inteira, inclusive quem não tem plano", () => {
    expect(ids(filtrarPorPlano(BASE, "todos"))).toEqual(["a", "b", "c", "d"]);
  });

  it("quem está sem plano não aparece em recorte nenhum de plano", () => {
    for (const codigo of ["basico", "avancado"]) {
      expect(ids(filtrarPorPlano(BASE, codigo))).not.toContain("d");
    }
  });

  it("plano do catálogo sem ninguém devolve lista vazia, não a base toda", () => {
    expect(filtrarPorPlano(BASE, "premium")).toEqual([]);
  });

  it("ausente, nulo e tipos estranhos não escondem ninguém", () => {
    expect(ids(filtrarPorPlano(BASE))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filtrarPorPlano(BASE, null))).toEqual(["a", "b", "c", "d"]);
    expect(filtrarPorPlano(null, "basico")).toEqual([]);
    expect(filtrarPorPlano()).toEqual([]);
  });

  it("não muda o array recebido", () => {
    const copia = [...BASE];
    filtrarPorPlano(BASE, "basico");
    filtrarPorPlano(BASE, "todos");
    expect(BASE).toEqual(copia);
  });
});

describe("normalizarFiltroPlano", () => {
  const CATALOGO = [
    { codigo: "basico", nome: "Básico" },
    { codigo: "avancado", nome: "Avançado" },
  ];

  it("código que existe no catálogo passa", () => {
    expect(normalizarFiltroPlano("basico", CATALOGO)).toBe("basico");
    expect(normalizarFiltroPlano("avancado", CATALOGO)).toBe("avancado");
  });

  it("valida contra o catálogo recebido, não contra lista fixa no código", () => {
    // Plano que só existe neste catálogo — se houvesse lista fixa, cairia fora.
    expect(normalizarFiltroPlano("food_truck", [{ codigo: "food_truck" }])).toBe("food_truck");
    // E o mesmo código, fora do catálogo, não vale.
    expect(normalizarFiltroPlano("food_truck", CATALOGO)).toBe("todos");
  });

  it("código inexistente, vazio ou ausente cai em 'todos'", () => {
    expect(normalizarFiltroPlano("xpto", CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano("", CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano(null, CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano(undefined, CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano()).toBe("todos");
  });

  it("caixa diferente não passa — o código do banco é exato", () => {
    expect(normalizarFiltroPlano("BASICO", CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano("Basico", CATALOGO)).toBe("todos");
  });

  it("parâmetro repetido (array) e tipos estranhos caem em 'todos'", () => {
    expect(normalizarFiltroPlano(["basico", "avancado"], CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano({ codigo: "basico" }, CATALOGO)).toBe("todos");
    expect(normalizarFiltroPlano(7, CATALOGO)).toBe("todos");
  });

  it("catálogo vazio ou que falhou ao carregar não recorta nada", () => {
    expect(normalizarFiltroPlano("basico", [])).toBe("todos");
    expect(normalizarFiltroPlano("basico", null)).toBe("todos");
    expect(normalizarFiltroPlano("basico")).toBe("todos");
  });

  it("o que ela devolve sempre serve de entrada para filtrarPorPlano", () => {
    const base = [{ id: "a", plano_codigo: "basico" }];
    for (const bruto of ["basico", "XPTO", "", null, ["a", "b"]]) {
      const codigo = normalizarFiltroPlano(bruto, CATALOGO);
      expect(codigo === "todos" || CATALOGO.some((p) => p.codigo === codigo)).toBe(true);
      expect(Array.isArray(filtrarPorPlano(base, codigo))).toBe(true);
    }
  });
});

describe("contarPorPlano", () => {
  const BASE = [
    { id: "a", plano_codigo: "basico" },
    { id: "b", plano_codigo: "avancado" },
    { id: "c", plano_codigo: "basico" },
    { id: "d", plano_codigo: null },
  ];

  it("conta quantos estão em cada plano", () => {
    expect(contarPorPlano(BASE)).toEqual({ basico: 2, avancado: 1 });
  });

  it("não inventa chave para quem está sem plano", () => {
    const contagem = contarPorPlano(BASE);
    expect(contagem).not.toHaveProperty("null");
    expect(contagem).not.toHaveProperty("undefined");
    expect(Object.values(contagem).reduce((s, n) => s + n, 0)).toBe(3);
  });

  it("plano sem ninguém simplesmente não aparece — quem lê usa zero", () => {
    const contagem = contarPorPlano(BASE);
    expect(contagem.premium ?? 0).toBe(0);
  });

  it("lista vazia, nula ou ausente devolve objeto vazio", () => {
    expect(contarPorPlano([])).toEqual({});
    expect(contarPorPlano(null)).toEqual({});
    expect(contarPorPlano()).toEqual({});
  });

  it("a contagem bate com o tamanho do recorte correspondente", () => {
    const contagem = contarPorPlano(BASE);
    for (const codigo of Object.keys(contagem)) {
      expect(filtrarPorPlano(BASE, codigo).length).toBe(contagem[codigo]);
    }
  });
});

// CONSOLE-UX 11 — a mensagem que o dono entrega ao cliente logo depois de
// vender. O que se prova aqui é o que ela NÃO diz tanto quanto o que diz:
// senha nunca, marca da plataforma nunca, campo faltando some.
describe("montarMensagemPrimeiroAcesso", () => {
  const COMPLETO = {
    estabelecimento: "Bar do Zé",
    plano: "Básico",
    endereco: "https://sistema.exemplo.com",
    usuario: "barze",
  };

  it("monta as três partes na ordem: quem, onde entrar, aviso da senha", () => {
    expect(montarMensagemPrimeiroAcesso(COMPLETO)).toBe(
      "Acesso do Bar do Zé\nPlano: Básico\n\n" +
        "Endereço: https://sistema.exemplo.com\nUsuário: barze\n\n" +
        "Senha: a que foi definida no cadastro.\n" +
        "Por segurança, envie a senha em uma mensagem separada desta."
    );
  });

  it("não carrega senha nenhuma além do aviso", () => {
    const texto = montarMensagemPrimeiroAcesso({ ...COMPLETO, senha: "s3nh4-secreta" });
    expect(texto).not.toContain("s3nh4-secreta");
  });

  it("não cita a plataforma — a mensagem é do estabelecimento (decisão 017)", () => {
    const texto = montarMensagemPrimeiroAcesso(COMPLETO);
    expect(texto).not.toMatch(/gastromundi/i);
    expect(texto).not.toMatch(/kora/i);
  });

  it("plano ausente não vira linha vazia nem 'undefined'", () => {
    const texto = montarMensagemPrimeiroAcesso({ ...COMPLETO, plano: undefined });
    expect(texto).not.toContain("undefined");
    expect(texto).not.toMatch(/^Plano:/m);
    expect(texto.startsWith("Acesso do Bar do Zé\n\nEndereço:")).toBe(true);
  });

  it("usuário ausente tira só a linha do usuário", () => {
    const texto = montarMensagemPrimeiroAcesso({ ...COMPLETO, usuario: "" });
    expect(texto).toContain("Endereço: https://sistema.exemplo.com");
    expect(texto).not.toMatch(/^Usuário:/m);
  });

  it("sem endereço e sem usuário, o bloco do meio some inteiro", () => {
    const texto = montarMensagemPrimeiroAcesso({ estabelecimento: "Bar do Zé", plano: "Básico" });
    expect(texto).toBe(
      "Acesso do Bar do Zé\nPlano: Básico\n\n" +
        "Senha: a que foi definida no cadastro.\n" +
        "Por segurança, envie a senha em uma mensagem separada desta."
    );
  });

  it("sem nome do estabelecimento ainda dá uma mensagem utilizável", () => {
    const texto = montarMensagemPrimeiroAcesso({ endereco: "https://x.com", usuario: "ana" });
    expect(texto.startsWith("Acesso ao sistema\n\n")).toBe(true);
    expect(texto).toContain("Usuário: ana");
  });

  it("espaço em volta some; valor que não é texto é tratado como ausente", () => {
    const texto = montarMensagemPrimeiroAcesso({
      estabelecimento: "  Café Central  ",
      usuario: 42,
      endereco: null,
    });
    expect(texto).toContain("Acesso do Café Central");
    expect(texto).not.toContain("42");
    expect(texto).not.toContain("null");
  });

  it("nome com aspas, acento ou emoji sai como está, sem escape inventado", () => {
    const texto = montarMensagemPrimeiroAcesso({ estabelecimento: 'Padaria "São João" 🥐' });
    expect(texto).toContain('Acesso do Padaria "São João" 🥐');
  });

  it("sem nenhum dado devolve o aviso da senha, não string vazia", () => {
    expect(montarMensagemPrimeiroAcesso()).toContain("Senha: a que foi definida no cadastro.");
    expect(montarMensagemPrimeiroAcesso(null)).toContain("Acesso ao sistema");
  });

  it("é pura: não altera o objeto recebido", () => {
    const entrada = { ...COMPLETO };
    montarMensagemPrimeiroAcesso(entrada);
    expect(entrada).toEqual(COMPLETO);
  });
});

// ── mensagemDeErroDoConsole (CONSOLE-UX 26) ────────────────────────
//
// O que estes testes protegem: que nenhuma frase técnica em inglês chegue à
// tela de quem está cobrando um cliente na rua, e que as recusas escritas de
// propósito — no banco ou na Edge Function — continuem chegando inteiras, que
// são elas que dizem o que corrigir.
describe("mensagemDeErroDoConsole", () => {
  const semRede = { message: "TypeError: Failed to fetch" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("erro de rede vira frase em português, sem o texto do navegador", () => {
    const texto = mensagemDeErroDoConsole(semRede, "Não foi possível alterar o plano.");

    expect(texto).toBe("Não foi possível alterar o plano.");
    expect(texto).not.toMatch(/fetch|TypeError/i);
  });

  it("outras marcas técnicas caem na mesma regra", () => {
    for (const m of ["NetworkError when attempting to fetch resource", "Load failed", "net::ERR_NAME_NOT_RESOLVED", "<!DOCTYPE html>"]) {
      expect(mensagemDeErroDoConsole({ message: m }, "Falhou.")).toBe("Falhou.");
    }
  });

  // A regressão que este bloco existe para impedir: as RPCs do Console
  // levantam recusa em português reusando ERRCODE de infraestrutura (42501 em
  // "Somente a plataforma pode...", 23505 na competência repetida). Filtrar
  // por código engoliria justamente a frase que diz o que corrigir.
  it("recusa em português passa inteira mesmo com código de infraestrutura", () => {
    const rls = { code: "42501", message: "Somente a plataforma pode confirmar renovação de assinatura." };
    const dup = { code: "23505", message: "A competência 08/2026 já foi confirmada para este estabelecimento." };

    expect(mensagemDeErroDoConsole(rls, "Falhou.")).toBe(rls.message);
    expect(mensagemDeErroDoConsole(dup, "Falhou.")).toBe(dup.message);
  });

  it("recusa deliberada do banco (P0001) passa inteira", () => {
    const erro = { code: "P0001", message: "Este estabelecimento já tem pagamento nesta competência." };

    expect(mensagemDeErroDoConsole(erro, "Não foi possível registrar o pagamento.")).toBe(
      "Este estabelecimento já tem pagamento nesta competência."
    );
  });

  it("CHECK violado (23514) também passa inteiro", () => {
    const erro = { code: "23514", message: "O valor precisa ser maior que zero." };

    expect(mensagemDeErroDoConsole(erro, "Falhou.")).toBe("O valor precisa ser maior que zero.");
  });

  it("texto cru do Postgres não vaza: RLS e função ausente viram a frase do modal", () => {
    const rls = { code: "42501", message: "new row violates row-level security policy" };
    const ausente = { code: "PGRST202", message: "Could not find the function public.x in the schema cache" };

    expect(mensagemDeErroDoConsole(rls, "Não foi possível salvar.")).toBe("Não foi possível salvar.");
    expect(mensagemDeErroDoConsole(ausente, "Não foi possível salvar.")).toBe("Não foi possível salvar.");
  });

  it("frase que o próprio sistema escreveu, sem código, passa inteira", () => {
    expect(mensagemDeErroDoConsole({ message: "Sessão expirada. Entre novamente." }, "Falhou.")).toBe(
      "Sessão expirada. Entre novamente."
    );
    expect(mensagemDeErroDoConsole("Estabelecimento não identificado.", "Falhou.")).toBe(
      "Estabelecimento não identificado."
    );
  });

  it("navegador offline diz que é a internet, não o servidor", () => {
    vi.stubGlobal("navigator", { onLine: false });

    const texto = mensagemDeErroDoConsole(semRede, "Não foi possível alterar o plano.");

    expect(texto).toMatch(/sem conex/i);
    expect(texto).toMatch(/reconecte/i);
  });

  it("nunca devolve vazio: sem erro e sem frase do chamador, ainda fala português", () => {
    for (const entrada of [null, undefined, {}, { message: "   " }, ""]) {
      const texto = mensagemDeErroDoConsole(entrada);
      expect(texto.length).toBeGreaterThan(10);
      expect(texto).toMatch(/servidor/i);
    }
  });

  it("é pura quanto ao erro recebido: não altera o objeto", () => {
    const entrada = { code: "P0001", message: "Recusa." };
    mensagemDeErroDoConsole(entrada, "Falhou.");

    expect(entrada).toEqual({ code: "P0001", message: "Recusa." });
  });

  it("o provisionamento herda a regra: rede vira frase, recusa da borda passa", () => {
    expect(traduzirErroProvisionamento("TypeError: Failed to fetch").mensagem).toBe(
      "Falha ao criar o estabelecimento."
    );
    expect(traduzirErroProvisionamento("Sessão expirada. Entre novamente.").mensagem).toBe(
      "Sessão expirada. Entre novamente."
    );
  });
});
