// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

/**
 * A marca de um estabelecimento vazando na sessão da PLATAFORMA.
 *
 * O super-admin não opera estabelecimento, mas o bootstrap dele passa por
 * `buscarTenantAtual()`, e a policy de `tenants` tem o ramo `is_super_admin()`:
 * o `limit(1)` devolve o estabelecimento mais antigo, que é um cliente real. A
 * guarda que mantém a marca neutra só olhava `ehConsoleHost()`, e esse switch
 * nasce desligado (precisa de VITE_CONSOLE_SUBDOMAIN mais VITE_ROOT_DOMAIN).
 *
 * No estado default, portanto: o Console era pintado com a paleta daquele
 * cliente, a aba recebia o nome dele e, pior, a marca era gravada no cache POR
 * ORIGEM, então o próximo funcionário que abrisse o login naquele endereço veria
 * a marca de OUTRO estabelecimento na primeira pintura. É exatamente o que a
 * decisão 017 (white-label multi-estabelecimento) proíbe.
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
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/lib/jarvasEngine", () => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/observabilidade", () => ({
  reportarFalha: vi.fn(),
  reportarInconsistencia: vi.fn(),
  setTenantObservabilidade: vi.fn(),
}));
vi.mock("@/components/shared/IndicadorRede", () => ({ default: () => null }));
vi.mock("@/components/shared/PonteLocalBridge", () => ({ default: () => null }));
vi.mock("@/components/shared/ImpressaoLancamentosBridge", () => ({ default: () => null }));

// O cache de marca é o pior efeito do defeito (atravessa sessões), então ele
// é observado, não simulado por dentro.
vi.mock("@/lib/brandingCache", async () => {
  const real = await vi.importActual("@/lib/brandingCache");
  return { ...real, salvarBrandingCache: vi.fn() };
});

vi.mock("@/lib/tenant", async () => {
  const real = await vi.importActual("@/lib/tenant");
  return { ...real, buscarBootstrapTenant: mockBootstrapTenant };
});

import { AppProvider, useApp } from "./AppContext";
import { salvarBrandingCache } from "@/lib/brandingCache";

const SESSAO_AUTH = { data: { session: { user: { id: "AUTH9", app_metadata: {} } } } };

/** O super-admin da plataforma: sem tenant próprio. */
const LINHA_PLATAFORMA = {
  id: 99, name: "Dono da Plataforma", username: "plataforma",
  role: "plataforma", auth_id: "AUTH9", permissions: null,
};

const LINHA_GERENTE = {
  id: 7, name: "Gerente Teste", username: "gerente1",
  role: "gerente", auth_id: "AUTH9", permissions: null,
};

/** O estabelecimento mais antigo da base, que é quem o limit(1) devolve. */
const TENANT_DE_OUTRO_CLIENTE = {
  id: "t1", nome: "Casa Coffee Colab",
  tema: { nome_exibicao: "CASA COFFEE", accent: "#8b5a2b" },
  planoCodigo: "avancado", modulosDisponiveis: ["pdv"], addonsAtivos: [], assinatura: null,
};

function comTabelas({ singles = {}, padrao = { data: [], error: null } } = {}) {
  mockSupabase.from.mockImplementation((tabela) => {
    let ehSingle = false;
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => { ehSingle = true; return builder; });
    builder.maybeSingle = builder.single;
    builder.then = (ok, falha) => Promise.resolve(
      ehSingle ? (singles[tabela] ?? { data: null, error: null }) : padrao
    ).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
}

async function montarCom(linhaUsuario) {
  comTabelas({ singles: { users: { data: linhaUsuario, error: null } } });
  const app = { current: null };
  const Sonda = () => { app.current = useApp(); return null; };
  await act(async () => {
    render(<AppProvider><Sonda /></AppProvider>);
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.documentElement.removeAttribute("style");
  document.title = "Kora";
  mockSupabase.auth.getSession.mockResolvedValue(SESSAO_AUTH);
  mockBootstrapTenant.mockResolvedValue({ data: TENANT_DE_OUTRO_CLIENTE, error: null });
});

/** O token de destaque é o que a paleta do tenant pinta em toda a tela. */
const corDeDestaque = () =>
  document.documentElement.style.getPropertyValue("--gm-accent");

describe("AppContext, marca na sessão da plataforma", () => {
  it("não veste a marca do estabelecimento que o bootstrap devolveu", async () => {
    await montarCom(LINHA_PLATAFORMA);

    expect(document.title).toBe("KORA · Console");
    expect(document.title).not.toContain("CASA COFFEE");
    expect(corDeDestaque()).toBe("");
  });

  it("não grava a marca desse estabelecimento no cache da origem", async () => {
    await montarCom(LINHA_PLATAFORMA);

    expect(salvarBrandingCache).not.toHaveBeenCalled();
  });

  it("para quem opera o estabelecimento, a marca dele continua sendo aplicada", async () => {
    await montarCom(LINHA_GERENTE);

    expect(document.title).toContain("CASA COFFEE");
    expect(salvarBrandingCache).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "CASA COFFEE" }),
    );
    expect(corDeDestaque()).toBe("#8b5a2b");
  });
});
