// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://casacoffee.kora.codes/" }
//
// TD008 — o bloqueio de tentativas de login passa a morar no servidor.
//
// Antes, quem contava as cinco tentativas era o `localStorage` do navegador de
// quem estava tentando entrar: duas linhas no console apagavam o contador e o
// "Bloqueio após 5 tentativas" prometido na tela de login não bloqueava nada.
// Agora quem conta é `public.login_tentativas` (migration 20260927), e o
// contador local sobrou como eco, para a tela responder na hora.
//
// Este arquivo cobre a fiação: quem `login` consulta, em que ordem, e o que
// acontece quando o banco não responde. A regra do contador em si (5 falhas,
// janela de 15 min, 2 min de bloqueio) mora no SQL; o cliente das RPCs tem
// testes próprios em `src/lib/loginTentativas.test.js`.
//
// A URL deste arquivo é um subdomínio VÁLIDO de propósito: sem isso o login
// para antes de chegar às RPCs, que é justamente o cenário do arquivo vizinho
// `AppContext.login.test.jsx`.
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
    signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "Invalid login credentials" } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com o que está sendo medido.
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

const EMAIL = "admin@casacoffee.local";

/** Respostas das RPCs de tentativa, por nome. O resto do app segue vazio. */
let respostas;

function comTabelasVazias() {
  mockSupabase.from.mockImplementation(() => {
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    // Perfil "não encontrado": corta o login logo depois do Auth, sem arrastar
    // o bootstrap inteiro para dentro de um teste que é sobre o contador.
    builder.single      = vi.fn(() => Promise.resolve({ data: null, error: { code: "PGRST116" } }));
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
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

const chamadas = (nome) => mockSupabase.rpc.mock.calls.filter(([n]) => n === nome);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  comTabelasVazias();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: "Invalid login credentials" } });

  respostas = {
    login_tentativas_estado:  { data: { bloqueado: false, restantes: 5, segundos: 0 }, error: null },
    login_tentativas_falha:   { data: { bloqueado: false, restantes: 4, segundos: 0 }, error: null },
    login_tentativas_sucesso: { data: null, error: null },
  };
  mockSupabase.rpc.mockImplementation((nome) =>
    Promise.resolve(respostas[nome] ?? { data: null, error: null }),
  );
});

describe("AppContext — o bloqueio de login vem do servidor (TD008)", () => {
  it("o cenário tem um subdomínio válido, senão o login pararia antes das RPCs", () => {
    expect(window.location.hostname).toBe("casacoffee.kora.codes");
  });

  it("servidor bloqueado: recusa sem gastar viagem à rede de auth", async () => {
    respostas.login_tentativas_estado = { data: { bloqueado: true, restantes: 0, segundos: 97 }, error: null };
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "SenhaCerta#123"); });

    expect(chamadas("login_tentativas_estado")[0][1]).toEqual({ p_chave: EMAIL });
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(r.error).toMatch(/bloquead/i);
    expect(r.error).toContain("97");
  });

  it("limpar o localStorage não destrava mais o bloqueio", async () => {
    respostas.login_tentativas_estado = { data: { bloqueado: true, restantes: 0, segundos: 60 }, error: null };
    const app = await montar();

    await act(async () => { await app.current.login("admin", "x"); });
    // Exatamente o que o console do navegador faz, e que antes devolvia as
    // cinco tentativas.
    window.localStorage.clear();
    expect(getAttempts("admin")).toEqual({});

    let r;
    await act(async () => { r = await app.current.login("admin", "x"); });
    expect(r.error).toMatch(/bloquead/i);
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("senha errada: registra a falha no servidor e o número mostrado vem de lá", async () => {
    respostas.login_tentativas_falha = { data: { bloqueado: false, restantes: 2, segundos: 0 }, error: null };
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "errada"); });

    expect(chamadas("login_tentativas_falha")[0][1]).toEqual({ p_chave: EMAIL });
    expect(r.error).toMatch(/2 tentativa\(s\) restante\(s\)/);
    // O eco local guarda o mesmo número, para os pips da tela.
    expect(getAttempts("admin").count).toBe(3);
  });

  it("quando o servidor fecha a porta na falha, a mensagem é a de bloqueio", async () => {
    respostas.login_tentativas_falha = { data: { bloqueado: true, restantes: 0, segundos: 120 }, error: null };
    const app = await montar();

    let r;
    await act(async () => { r = await app.current.login("admin", "errada"); });

    expect(r.error).toMatch(/Muitas tentativas/i);
    expect(getAttempts("admin").lockedUntil).toBeGreaterThan(Date.now());
  });

  it("RPC indisponível: o login continua e o contador local volta a valer (falha aberta)", async () => {
    // Migration ainda não aplicada é exatamente isto.
    respostas.login_tentativas_estado = { data: null, error: { message: "function does not exist" } };
    respostas.login_tentativas_falha  = { data: null, error: { message: "function does not exist" } };
    const app = await montar();

    let r;
    for (let i = 0; i < 4; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { r = await app.current.login("admin", "errada"); });
    }
    // Foi à rede de auth todas as vezes: sem resposta do servidor, ninguém é
    // barrado na porta.
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(4);
    expect(r.error).toMatch(/1 tentativa\(s\) restante\(s\)/);

    await act(async () => { r = await app.current.login("admin", "errada"); });
    expect(r.error).toMatch(/Muitas tentativas/i);
  });

  it("senha certa: zera o contador do servidor, e sem mandar chave nenhuma", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "auth-1", app_metadata: {} } },
      error: null,
    });
    const app = await montar();

    // O perfil não é encontrado (mock acima), então o login termina recusado —
    // mas isso acontece DEPOIS, e o que importa aqui é que o contador do
    // servidor já foi zerado assim que a senha foi aceita.
    await act(async () => { await app.current.login("admin", "SenhaCerta#123"); });

    expect(chamadas("login_tentativas_sucesso")).toHaveLength(1);
    // Sem segundo argumento: a identidade sai do JWT, dentro do banco. Uma
    // chave por parâmetro faria a função virar alcançável por quem não entrou.
    expect(chamadas("login_tentativas_sucesso")[0]).toHaveLength(1);
  });

  it("a consulta ao servidor vem ANTES do signInWithPassword", async () => {
    const ordem = [];
    mockSupabase.rpc.mockImplementation((nome) => {
      ordem.push(`rpc:${nome}`);
      return Promise.resolve(respostas[nome] ?? { data: null, error: null });
    });
    mockSupabase.auth.signInWithPassword.mockImplementation(() => {
      ordem.push("auth");
      return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } });
    });
    const app = await montar();
    ordem.length = 0;

    await act(async () => { await app.current.login("admin", "errada"); });

    expect(ordem).toEqual(["rpc:login_tentativas_estado", "auth", "rpc:login_tentativas_falha"]);
  });
});
