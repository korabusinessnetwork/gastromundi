// @vitest-environment jsdom
//
// L01 — servidor inalcançável no login não é senha errada.
//
// Medido no navegador com o Supabase fora do ar (`net::ERR_CONNECTION_REFUSED`):
// a tela escrevia "Usuário ou senha incorretos. 4 tentativa(s) restante(s)" e
// ainda queimava uma tentativa. Ou seja, falha de INFRAESTRUTURA chegava ao
// operador como credencial errada: no meio do serviço, com a internet do salão
// caída, ele troca a senha certa por chute e se bloqueia sozinho, justamente
// quando o problema não estava nele.
//
// O contrapeso importa tanto quanto a correção: senha errada de verdade
// continua contando tentativa e dizendo o que sempre disse.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockSupabase = vi.hoisted(() => ({
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
    signInWithPassword: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com o defeito.
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
vi.mock("@/lib/tenant", () => ({
  buscarBootstrapTenant: vi.fn(() => Promise.resolve({ data: null, error: null })),
  moduloHabilitado: () => true,
  addonHabilitado: () => false,
}));

// O contador do SERVIDOR é dublado para ficar observável: o teste precisa
// provar que a falha de rede não chega nem a somar lá.
const { mockRegistrarFalha } = vi.hoisted(() => ({
  mockRegistrarFalha: vi.fn(() => Promise.resolve({ disponivel: false, bloqueado: false, restantes: null, segundos: 0 })),
}));
vi.mock("@/lib/loginTentativas", () => ({
  consultarBloqueio: vi.fn(() => Promise.resolve({ disponivel: false, bloqueado: false, restantes: null, segundos: 0 })),
  registrarFalha: mockRegistrarFalha,
  registrarSucesso: vi.fn(),
}));

import { AppProvider, useApp } from "./AppContext";
import { getAttempts } from "@/utils/session";

function comTabelasVazias() {
  mockSupabase.from.mockImplementation(() => {
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (ok, falha) => Promise.resolve({ data: [], error: null }).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
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
  comTabelasVazias();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe("AppContext, login com o servidor inalcançável (L01)", () => {
  // Foi assim que o erro chegou no navegador: o supabase-js não lança, ele
  // resolve com { error } embrulhando a falha do fetch.
  const erroDeRede = { message: "TypeError: Failed to fetch", name: "AuthRetryableFetchError" };

  it("a mensagem fala do servidor, não da senha, e não promete tentativas restantes", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: erroDeRede });
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("maria", "SenhaCerta#123"); });

    expect(r.error).toMatch(/servidor/i);
    expect(r.error).not.toMatch(/senha incorret/i);
    expect(r.error).not.toMatch(/tentativa/i);
  });

  it("não gasta tentativa: nem o contador do navegador nem o do servidor sobem", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: erroDeRede });
    const app = await montar();

    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await app.current.login("maria", "SenhaCerta#123"); });
    }

    expect(getAttempts("maria").count ?? 0).toBe(0);
    expect(mockRegistrarFalha).not.toHaveBeenCalled();

    // E, o mais importante, ninguém se bloqueia por causa da internet.
    let r;
    await act(async () => { r = await app.current.login("maria", "SenhaCerta#123"); });
    expect(r.error).not.toMatch(/bloquead/i);
  });

  it("senha errada de verdade continua contando e dizendo o que sempre disse", async () => {
    // Contrapeso: sem ele, tratar TODO erro de auth como rede passaria no teste
    // acima e deixaria o bloqueio de força bruta sem contador na tela.
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials", name: "AuthApiError" },
    });
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("maria", "chute"); });

    expect(r.error).toMatch(/Usuário ou senha incorretos/i);
    expect(r.error).toMatch(/tentativa\(s\) restante\(s\)/i);
    expect(getAttempts("maria").count).toBe(1);
    expect(mockRegistrarFalha).toHaveBeenCalled();
  });
});
