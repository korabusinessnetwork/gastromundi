// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://casa_coffee.kora.codes/" }
//
// Run 5, leva 7 — link do estabelecimento com endereço torto.
//
// O login monta o e-mail do Supabase Auth como `${username}@${slug}.local`, e o
// slug vem do subdomínio da URL. Um rótulo que não é um subdomínio válido
// (`casa_coffee`, `-casa`, `casa-`) montava `admin@casa_coffee.local`, o
// servidor recusava com "Unable to validate email address: invalid format" e a
// tela de login mostrava isso na cara de quem digitou a senha certa — pior, cada
// tentativa contava para o bloqueio de 5, então a pessoa acabava "bloqueada" por
// um problema que estava no link, não na senha dela.
//
// A URL deste arquivo é justamente um endereço torto (veja o docblock acima).
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
    signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao deveria ser chamado" } })),
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

describe("AppContext — login com endereço de acesso torto (Run 5, leva 7)", () => {
  it("o cenário é um subdomínio inválido de verdade na URL", () => {
    // Se este assert cair, o docblock de opções do ambiente parou de valer e os
    // testes abaixo estariam medindo o host de dev, não o endereço torto.
    expect(window.location.hostname).toBe("casa_coffee.kora.codes");
  });

  it("não vai à rede e a mensagem fala do endereço, não da senha", async () => {
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "SenhaCerta#123"); });

    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(r.error).toMatch(/endereço/i);
    expect(r.error).not.toMatch(/senha/i);
    expect(app.current.currentUser).toBeNull();
  });

  it("não consome tentativa — link torto não bloqueia a conta de ninguém", async () => {
    const app = await montar();

    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { await app.current.login("admin", "SenhaCerta#123"); });
    }

    expect(getAttempts("admin")).toEqual({});
    const r = await app.current.login("admin", "SenhaCerta#123");
    expect(r.error).not.toMatch(/bloquead/i);
  });
});
