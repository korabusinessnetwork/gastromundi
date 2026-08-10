// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

/**
 * Run 5, leva 10 — o gating de plano mentindo para quem paga.
 *
 * `useApp().moduloHabilitado` é a única fonte de gating por plano no front
 * (ADR-005): quem consulta é a rota (`PrivateRoute` → tela de upgrade), a
 * Sidebar (item travado), o hub do Palm (cartão some) e o escolhedor da
 * primeira tela do usuário. Era `moduloHabilitado(tenant?.modulosDisponiveis)`,
 * e a função pura recusa tudo que não é array — então com `tenant` ainda null
 * a resposta era "não está no seu plano".
 *
 * E `tenant` fica null em três situações banais: bootstrap em voo, erro ao ler
 * `tenants` (RLS/rede) e abertura sem internet — o snapshot offline guarda
 * produtos, comandas, estoque e config, nunca o plano. Quem paga pelo plano
 * completo via, nesse intervalo, Cozinha/Estoque/Financeiro/Clientes/Produtos/
 * Delivery/Relatórios todos convidando a fazer upgrade. Pior no caso offline,
 * que é exatamente o cenário que o app promete atender.
 *
 * A regra agora: só responde "não" quando o plano é CONHECIDO. Enquanto não é,
 * libera — a mesma escolha já feita para a assinatura, que só bloqueia depois
 * de carregada. O que NÃO muda: plano conhecido e sem o módulo continua "não",
 * e add-on pago (NF-e/TEF) continua fechado sem tenant.
 */

const { mockSupabase, mockBootstrapTenant } = vi.hoisted(() => ({
  mockBootstrapTenant: vi.fn(),
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao deveria ser chamado" } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com o defeito.
vi.mock("@/lib/jarvas/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/lib/jarvas/jarvasEngine", () => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/infra/observabilidade", () => ({
  reportarFalha: vi.fn(),
  reportarInconsistencia: vi.fn(),
  setTenantObservabilidade: vi.fn(),
}));
vi.mock("@/components/ui/feedback/IndicadorRede", () => ({ default: () => null }));
vi.mock("@/components/ui/pontes/PonteLocalBridge", () => ({ default: () => null }));
vi.mock("@/components/ui/pontes/ImpressaoLancamentosBridge", () => ({ default: () => null }));

// Só a BUSCA do tenant é dublê. `moduloHabilitado`/`addonHabilitado` seguem
// reais de propósito: o defeito está na composição das duas, não em nenhuma
// delas isolada — um stub aqui esconderia justamente o que se quer medir.
vi.mock("@/lib/tenant/tenant", async () => {
  const real = await vi.importActual("@/lib/tenant/tenant");
  return { ...real, buscarBootstrapTenant: mockBootstrapTenant };
});

import { AppProvider, useApp } from "./AppContext";
import { saveSession } from "@/utils/session";

const SESSAO_AUTH = { data: { session: { user: { id: "AUTH1", app_metadata: { tenant_id: "t1" } } } } };

const LINHA_USUARIO = {
  id: 7, name: "Gerente Teste", username: "gerente1",
  role: "gerente", auth_id: "AUTH1", permissions: null,
};

const TENANT_COMPLETO = {
  id: "t1", nome: "Casa Teste", tema: {}, planoCodigo: "avancado",
  modulosDisponiveis: ["pdv", "cozinha", "estoque"],
  addonsAtivos: ["nfe"],
  assinatura: null,
};

const ERRO_REDE = { message: "TypeError: Failed to fetch" };

/**
 * Dublê de tabela do Supabase. `resultados` responde às leituras em lista;
 * `singles` responde a quem termina em `.single()`/`.maybeSingle()` — é como
 * `buscarDadosUsuario` (uma linha) se distingue de `buscarUsers` (lista) na
 * MESMA tabela `users`.
 */
function comTabelas({ resultados = {}, singles = {}, padrao = { data: [], error: null } } = {}) {
  mockSupabase.from.mockImplementation((tabela) => {
    let ehSingle = false;
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => { ehSingle = true; return builder; });
    builder.maybeSingle = builder.single;
    builder.then = (ok, falha) => Promise.resolve(
      ehSingle
        ? (singles[tabela] ?? { data: null, error: null })
        : (resultados[tabela] ?? padrao)
    ).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
}

/** jsdom nasce online; o `afterEach` desfaz apagando a propriedade própria. */
function porOffline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
}

async function montar() {
  const app = { current: null };
  const Sonda = () => {
    app.current = useApp();
    return null;
  };
  await act(async () => {
    render(
      <AppProvider>
        <Sonda />
      </AppProvider>,
    );
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  comTabelas({ singles: { users: { data: LINHA_USUARIO, error: null } } });
  mockSupabase.auth.getSession.mockResolvedValue(SESSAO_AUTH);
  mockBootstrapTenant.mockResolvedValue({ data: TENANT_COMPLETO, error: null });
});

afterEach(() => {
  delete window.navigator.onLine;
  expect(window.navigator.onLine).toBe(true);
});

describe("AppContext — gating de módulo por plano (Run 5, leva 10)", () => {
  it("plano carregado: libera o que está no plano e recusa o que não está", async () => {
    const app = await montar();

    expect(app.current.tenant?.planoCodigo).toBe("avancado");
    expect(app.current.moduloHabilitado("cozinha")).toBe(true);
    expect(app.current.moduloHabilitado("estoque")).toBe(true);
    // Fora do plano continua fora — o conserto do falso negativo não podia
    // virar "libera sempre".
    expect(app.current.moduloHabilitado("financeiro")).toBe(false);
    expect(app.current.moduloHabilitado("delivery")).toBe(false);
  });

  it("plano com lista VAZIA recusa tudo — plano sem módulo não é plano desconhecido", async () => {
    // Discriminação que importa: a correção olha se o tenant CARREGOU, não se a
    // lista tem itens. Trocar por "lista vazia também libera" daria o plano
    // inteiro de graça a um tenant recém-provisionado, sem plano montado ainda.
    mockBootstrapTenant.mockResolvedValue({
      data: { ...TENANT_COMPLETO, planoCodigo: "basico", modulosDisponiveis: [] },
      error: null,
    });
    const app = await montar();

    expect(app.current.tenant?.modulosDisponiveis).toEqual([]);
    expect(app.current.moduloHabilitado("cozinha")).toBe(false);
    expect(app.current.moduloHabilitado("pdv")).toBe(false);
  });

  it("erro ao ler o tenant não bloqueia módulo nenhum", async () => {
    // Este é o defeito da leva. Uma falha de RLS/rede na leitura de `tenants`
    // apagava do app todos os módulos que o estabelecimento paga.
    mockBootstrapTenant.mockResolvedValue({
      data: null,
      error: { message: "permission denied for table tenants" },
    });
    const app = await montar();

    expect(app.current.tenant).toBeNull();
    expect(app.current.moduloHabilitado("cozinha")).toBe(true);
    expect(app.current.moduloHabilitado("financeiro")).toBe(true);
    expect(app.current.moduloHabilitado("relatorios")).toBe(true);
  });

  it("abertura sem internet: sem plano em mãos, a Cozinha continua abrindo", async () => {
    // O caminho real do restaurante com a internet caída: o bootstrap hidrata
    // do snapshot local, que nunca guardou o plano. Antes disso, a tela da
    // Cozinha (e Estoque, e o hub do Palm) dizia "não está no seu plano" — no
    // exato cenário que o modo offline existe para atender.
    porOffline();
    saveSession(LINHA_USUARIO);
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    comTabelas({
      padrao: { data: null, error: ERRO_REDE },
      singles: { users: { data: null, error: ERRO_REDE } },
    });
    mockBootstrapTenant.mockResolvedValue({ data: null, error: ERRO_REDE });

    const app = await montar();

    expect(app.current.tenant).toBeNull();
    expect(app.current.currentUser?.username).toBe("gerente1");
    expect(app.current.moduloHabilitado("cozinha")).toBe(true);
    expect(app.current.moduloHabilitado("estoque")).toBe(true);
  });

  it("add-on pago continua fechado sem tenant — NF-e não se libera por engano", async () => {
    // Assimetria deliberada: módulo é tela (liberar por engano só mostra tela),
    // add-on é documento fiscal e transação no servidor. Sem saber, não emite.
    mockBootstrapTenant.mockResolvedValue({ data: null, error: ERRO_REDE });
    const semTenant = await montar();

    expect(semTenant.current.addonHabilitado("nfe")).toBe(false);
    expect(semTenant.current.addonHabilitado("tef")).toBe(false);

    mockBootstrapTenant.mockResolvedValue({ data: TENANT_COMPLETO, error: null });
    const comTenant = await montar();

    expect(comTenant.current.addonHabilitado("nfe")).toBe(true);
    expect(comTenant.current.addonHabilitado("tef")).toBe(false);
  });
});
