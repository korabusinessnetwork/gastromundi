// @vitest-environment jsdom
//
// Tarefa 2.1 do plano de refatoração: prova de redesenho desnecessário.
//
// O `AppContext` entrega cerca de 80 itens num único objeto, criado de novo a
// cada render e sem memorização. Qualquer mudança de estado (aqui, a taxa de
// serviço) redesenha TODA tela que usa `useApp()`, mesmo a que só lê o usuário
// logado. No PDV, isso é a tela inteira sendo refeita no meio da venda.
//
// O teste descreve o comportamento DESEJADO e está marcado com `it.fails`:
// hoje ele passa porque falha. Quando a fase 2 dividir o contexto e a tarefa
// 2.8 trocar o `useApp()` da sonda pelo hook específico (`useSessao`), ele
// passa a falhar de verdade, e aí vira um `it` comum. É de propósito: a
// suíte avisa no dia em que o problema estiver resolvido.
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
    signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao usado" } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
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
vi.mock("@/lib/tenant", () => ({
  buscarBootstrapTenant: vi.fn(() => Promise.resolve({ data: null, error: null })),
  moduloHabilitado: () => true,
  addonHabilitado: () => false,
}));

import { AppProvider, useApp } from "./AppContext";
import { useSessao } from "./SessaoContext";

beforeEach(() => {
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
});

describe("redesenho do contexto (tarefa 2.1)", () => {
  it.fails("tela que só lê o usuário logado não redesenha quando a taxa de serviço muda", async () => {
    const app = { current: null };
    let rendersDoLeitor = 0;

    function Sonda() {
      app.current = useApp();
      return null;
    }
    // Só lê `currentUser`. Na tarefa 2.8, troca `useApp()` por `useSessao()`.
    function LeitorDoUsuario() {
      const { currentUser } = useApp();
      rendersDoLeitor += 1;
      return currentUser ? currentUser.name : null;
    }

    render(<AppProvider><Sonda /><LeitorDoUsuario /></AppProvider>);
    await act(async () => {});

    const antes = rendersDoLeitor;
    await act(async () => { await app.current.setTaxaServico(true); });

    expect(app.current.taxaServico).toBe(true);
    expect(rendersDoLeitor).toBe(antes);
  });

  // Tarefa 2.2: a mesma tela, lendo pela fatia da sessão, já não é redesenhada.
  it("com useSessao, a tela do usuário logado não redesenha quando a taxa de serviço muda", async () => {
    const app = { current: null };
    let rendersDoLeitor = 0;

    function Sonda() {
      app.current = useApp();
      return null;
    }
    function LeitorDoUsuario() {
      const { currentUser } = useSessao();
      rendersDoLeitor += 1;
      return currentUser ? currentUser.name : null;
    }

    render(<AppProvider><Sonda /><LeitorDoUsuario /></AppProvider>);
    await act(async () => {});

    const antes = rendersDoLeitor;
    await act(async () => { await app.current.setTaxaServico(true); });

    expect(app.current.taxaServico).toBe(true);
    expect(rendersDoLeitor).toBe(antes);
  });

  it("useSessao entrega as mesmas ações do useApp, com identidade fixa entre renders", async () => {
    const app = { current: null };
    const sessoes = [];

    function Sonda() {
      app.current = useApp();
      sessoes.push(useSessao());
      return null;
    }

    render(<AppProvider><Sonda /></AppProvider>);
    await act(async () => {});
    await act(async () => { await app.current.setTaxaServico(true); });

    const primeira = sessoes[0];
    const ultima = sessoes[sessoes.length - 1];
    expect(sessoes.length).toBeGreaterThan(1);
    for (const acao of ["login", "logout", "addUser", "updateUser", "removeUser", "salvarPermissoesCargo", "moduloHabilitado", "addonHabilitado"]) {
      expect(typeof ultima[acao], acao).toBe("function");
      expect(ultima[acao], acao).toBe(primeira[acao]);
    }
  });

  it("useSessao fora do AppProvider avisa em vez de devolver vazio", () => {
    function SemProvider() {
      useSessao();
      return null;
    }
    const erroConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SemProvider />)).toThrow(/useSessao deve ser usado dentro de <AppProvider>/);
    erroConsole.mockRestore();
  });
});
