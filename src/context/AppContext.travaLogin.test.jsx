// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://casacoffee.kora.codes/" }
//
// Pré-venda §1.9 · TD008 — a trava de tentativas saiu do navegador.
//
// O bloqueio de "5 erros e 2 minutos" era decidido inteiro no cliente, com o
// contador em `localStorage`. Quem quer adivinhar a senha do gerente não usa a
// tela: chama a API do Auth direto, ou limpa o storage entre as tentativas.
//
// O que este arquivo prova é a LIGAÇÃO com o servidor — a regra em si mora na
// migração 20260920 e tem guard próprio. Aqui: que a consulta acontece ANTES
// de mandar a senha ao Auth (senão o bloqueio não bloqueia nada), que ela
// carrega o endereço e a senha (é o que faz o contador andar por falha real) e
// — o mais importante para um PDV — que uma falha da RPC deixa o login PASSAR.
// Uma trava que se fecha quando o servidor tosse deixa o restaurante inteiro
// fora do próprio caixa no meio do almoço.
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
    signInWithPassword: vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "Invalid login credentials" } }),
    ),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com a trava.
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
vi.mock("@/lib/tenant/tenant", () => ({
  buscarBootstrapTenant: vi.fn(() => Promise.resolve({ data: null, error: null })),
  moduloHabilitado: () => true,
  addonHabilitado: () => false,
}));

import { AppProvider, useApp } from "./AppContext";

const RPC = "registrar_tentativa_login";

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

/** Só a trava é dublada; as outras RPCs do bootstrap seguem inertes. */
function travaResponde(resposta) {
  mockSupabase.rpc.mockImplementation((nome) =>
    nome === RPC ? Promise.resolve(resposta) : Promise.resolve({ data: null, error: null }),
  );
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

const chamadaDaTrava = () => mockSupabase.rpc.mock.calls.find(([nome]) => nome === RPC);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  comTabelasVazias();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.signInWithPassword.mockResolvedValue({
    data: null,
    error: { message: "Invalid login credentials" },
  });
  travaResponde({ data: null, error: null });
});

describe("AppContext — trava de tentativas no servidor (TD008)", () => {
  it("pergunta ao servidor ANTES de mandar a senha ao Auth, com endereço e senha", async () => {
    const app = await montar();
    await act(async () => { await app.current.login("admin", "SenhaCerta#123"); });

    // O e-mail é o mesmo que vai ao Auth (`usuario@slug.local`): contar por
    // ele deixa a trava por usuário E por estabelecimento.
    expect(chamadaDaTrava()).toEqual([
      RPC,
      { p_email: "admin@casacoffee.local", p_senha: "SenhaCerta#123" },
    ]);

    // A ordem é o coração da coisa: consultar depois de tentar entrar seria
    // um bloqueio que nunca bloqueia.
    const ordemTrava = mockSupabase.rpc.mock.invocationCallOrder[
      mockSupabase.rpc.mock.calls.findIndex(([nome]) => nome === RPC)
    ];
    expect(ordemTrava).toBeLessThan(
      mockSupabase.auth.signInWithPassword.mock.invocationCallOrder[0],
    );
  });

  it("bloqueado pelo servidor: não vai ao Auth e diz quanto falta esperar", async () => {
    travaResponde({ data: { pode_tentar: false, segundos: 97 }, error: null });
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "SenhaCerta#123"); });

    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    // Espera sem prazo é a pior versão desta tela: a pessoa fica clicando.
    expect(r.error).toMatch(/Aguarde 97s/);
    expect(app.current.currentUser).toBeNull();
  });

  it("RPC devolvendo erro NÃO tranca ninguém — o login segue", async () => {
    travaResponde({ data: null, error: { message: "function does not exist" } });
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "SenhaCerta#123"); });

    // Banco de cliente sem a migração aplicada, rede oscilando, RPC fora do
    // ar: nada disso pode virar "conta bloqueada" para quem sabe a senha.
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled();
    expect(r.error).not.toMatch(/bloquead/i);
  });

  it("RPC explodindo também falha aberto", async () => {
    mockSupabase.rpc.mockImplementation((nome) => {
      if (nome === RPC) return Promise.reject(new Error("sem rede"));
      return Promise.resolve({ data: null, error: null });
    });
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "SenhaCerta#123"); });

    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalled();
    expect(r.error).not.toMatch(/bloquead/i);
  });

  it("o contador do navegador continua valendo — a trava do servidor SOMA, não substitui", async () => {
    const app = await montar();
    // Cinco senhas erradas: o Auth recusa todas e o contador local fecha a
    // porta na quinta, mesmo com o servidor liberando. Ele responde na hora e
    // funciona offline; é a primeira linha, não a única.
    let r;
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { r = await app.current.login("admin", "chute"); });
    }
    expect(r.error).toMatch(/Muitas tentativas/i);
  });
});
