// @vitest-environment jsdom
//
// Run 5, leva 1 — sessão local órfã.
//
// O `currentUser` nasce semeado do sessionStorage (`loadSession()`) só para a
// tela abrir já logada, sem piscar. Mas quem autoriza qualquer leitura é o JWT
// do Supabase: sem ele a RLS devolve tudo vazio. Quando o refresh token morre
// (expirou, foi revogado, o usuário foi desativado), o `getSession()` volta sem
// sessão — e nada limpava a sessão local, porque num carregamento sem sessão o
// supabase-js emite `INITIAL_SESSION`, não `SIGNED_OUT`, e o
// `onAuthStateChange` do provider só reage a `SIGNED_OUT`. Resultado: o app
// abria "logado" com produtos, mesas e comandas todos vazios, e a pessoa não
// tinha como chegar ao login para consertar.
//
// A exceção é ficar sem internet: aí o `getSession()` também pode voltar vazio
// só porque não conseguiu renovar o token, e a sessão local é justamente o que
// mantém o PDV operando do snapshot. Esse caminho tem que continuar de pé.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { saveSession, loadSession, lerSessao, SESSION_MS, IDLE_MS, MAX_ATTEMPTS, getAttempts } from "@/utils/session";

function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

/** Toda tabela responde vazia — o bootstrap roda até o fim sem erro. */
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

/**
 * Como `comTabelasVazias`, mas com linhas por tabela: `{ users: [...] }`. É o
 * que permite o efeito [users] do provider encontrar o usuário logado e
 * refinar o `currentUser` — o caminho que renovava a sessão sem querer.
 */
function comDados(dados) {
  mockSupabase.from.mockImplementation((tabela) => {
    const linhas = dados[tabela] ?? [];
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve({ data: linhas[0] ?? null, error: null }));
    builder.maybeSingle = builder.single;
    builder.then = (ok, falha) => Promise.resolve({ data: linhas, error: null }).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
}

/** Sessão do Supabase Auth válida — o JWT que a RLS exige. */
function comSessaoNoAuth() {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "auth-7", app_metadata: { tenant_id: "t1" } } } },
  });
}

/** Grava a sessão local com um `at` escolhido (a hora do login). */
function comSessaoLocalDe(at) {
  window.sessionStorage.setItem("kora_session", JSON.stringify({ user: usuario, at }));
}

let onLineOriginal;
function comRede(online) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

async function montar() {
  const app = { current: null };
  const Sonda = capturarApp(app);
  await act(async () => {
    render(
      <AppProvider>
        <Sonda />
      </AppProvider>,
    );
  });
  return app;
}

const usuario = { id: 7, name: "Fulano", username: "fulano", role: "gerente", auth_id: "auth-7" };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  comTabelasVazias();
  onLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  if (onLineOriginal) Object.defineProperty(window.navigator, "onLine", onLineOriginal);
  else delete window.navigator.onLine;
  vi.useRealTimers();
});

describe("AppContext — sessão local órfã sem JWT (Run 5, leva 1)", () => {
  it("sessão local sem sessão no Auth, com internet, é descartada — cai no login", async () => {
    saveSession(usuario);
    comRede(true);

    const app = await montar();

    expect(app.current.currentUser).toBeNull();
    expect(loadSession()).toBeNull();
    expect(window.sessionStorage.getItem("kora_session")).toBeNull();
    expect(app.current.loading).toBe(false);
  });

  it("sem internet a sessão local FICA e o app hidrata do snapshot", async () => {
    saveSession(usuario);
    comRede(false);

    const app = await montar();

    expect(app.current.currentUser).toMatchObject({ id: 7, username: "fulano" });
    expect(loadSession()).toMatchObject({ id: 7 });
  });

  it("com sessão válida no Auth o usuário do banco assume e a sessão local é criada", async () => {
    comRede(true);
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "auth-7", app_metadata: { tenant_id: "t1" } } } },
    });
    mockSupabase.from.mockImplementation((tabela) => {
      const builder = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
        builder[m] = vi.fn(() => builder);
      }
      builder.single = vi.fn(() =>
        Promise.resolve(
          tabela === "users"
            ? { data: { ...usuario, permissions: null }, error: null }
            : { data: null, error: null },
        ),
      );
      builder.maybeSingle = builder.single;
      builder.then = (ok, falha) => Promise.resolve({ data: [], error: null }).then(ok, falha);
      const api = {};
      for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
      return api;
    });

    const app = await montar();

    expect(app.current.currentUser).toMatchObject({ id: 7, role: "gerente" });
    expect(loadSession()).toMatchObject({ id: 7 });
  });

  it("sem sessão local e sem sessão no Auth continua deslogado, sem erro", async () => {
    comRede(true);

    const app = await montar();

    expect(app.current.currentUser).toBeNull();
    expect(app.current.loading).toBe(false);
  });
});

// Desativar alguém em `public.users` NÃO revoga o JWT que já está no navegador
// dele — só o `signOut` faz isso. O único sinal da desativação é a busca do
// perfil (filtrada por `active = true`) voltar sem linha; antes esse ramo só
// desligava o `loading` e a pessoa seguia com a tela montada e as permissões
// antigas do sessionStorage até fechar a aba. O contraponto é não confundir
// "sem linha" com "não consegui ler": um soluço de rede não pode derrubar o
// caixa no meio do turno.
describe("AppContext — conta desativada com JWT ainda vivo", () => {
  /** `users.single()` responde o que o teste mandar; o resto vem vazio. */
  function comPerfilRespondendo(resposta) {
    mockSupabase.from.mockImplementation((tabela) => {
      const builder = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
        builder[m] = vi.fn(() => builder);
      }
      builder.single = vi.fn(() =>
        Promise.resolve(tabela === "users" ? resposta : { data: null, error: null }),
      );
      builder.maybeSingle = builder.single;
      builder.then = (ok, falha) => Promise.resolve({ data: [], error: null }).then(ok, falha);
      const api = {};
      for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
      return api;
    });
  }

  it("perfil sem linha ativa derruba a sessão local E o token do Auth", async () => {
    comRede(true);
    saveSession(usuario);
    comSessaoNoAuth();
    // PGRST116 = `.single()` sem resultado: o banco respondeu com certeza.
    comPerfilRespondendo({ data: null, error: { code: "PGRST116", message: "0 rows" } });

    const app = await montar();

    expect(app.current.currentUser).toBeNull();
    expect(loadSession()).toBeNull();
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(app.current.loading).toBe(false);
  });

  it("leitura do perfil que falha NÃO derruba ninguém — rede ruim não é desativação", async () => {
    comRede(true);
    saveSession(usuario);
    comSessaoNoAuth();
    comPerfilRespondendo({ data: null, error: { message: "Failed to fetch" } });

    const app = await montar();

    expect(app.current.currentUser).toMatchObject({ id: 7, username: "fulano" });
    expect(loadSession()).toMatchObject({ id: 7 });
    expect(mockSupabase.auth.signOut).not.toHaveBeenCalled();
  });
});

// Run 5, levas 4 e 5 — os dois cronômetros de segurança que a tela de login
// promete ("expira após 30 min de inatividade", teto de 8 horas) não podiam
// disparar durante o uso normal do PDV:
//   • o `at` da sessão (a hora do login) era reescrito no F5 e a cada refresh
//     da lista de usuários, então o teto de 8 horas nunca chegava;
//   • o teto só era conferido ao carregar a página — numa aba aberta o turno
//     inteiro, ninguém conferia;
//   • o callback de logout dependia de `currentUser`, cuja identidade troca a
//     cada refresh da lista de usuários: o efeito do `useIdleTimer` remontava e
//     a contagem de 30 minutos voltava ao zero.
describe("AppContext — relógio da sessão e inatividade (Run 5, levas 4 e 5)", () => {
  const usuarioComPerms = { ...usuario, permissions: null };

  it("o F5 não renova o relógio da sessão", async () => {
    const nascimento = Date.now() - 7 * 60 * 60 * 1000; // 7h de turno já corridas
    comRede(true);
    comSessaoLocalDe(nascimento);
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });

    const app = await montar();

    expect(app.current.currentUser).toMatchObject({ id: 7 });
    expect(lerSessao().at).toBe(nascimento);
  });

  it("refresh da lista de usuários atualiza os dados sem renovar o relógio", async () => {
    comRede(true);
    comSessaoLocalDe(Date.now() - 7 * 60 * 60 * 1000);
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });

    const app = await montar();
    const antes = lerSessao().at;

    await act(async () => {
      await app.current.updateUser(7, { name: "Fulano Souza" });
    });

    expect(lerSessao().at).toBe(antes);
    expect(lerSessao().user.name).toBe("Fulano Souza");
  });

  it("sessão vencida derruba também a sessão do Auth — o F5 não reabre", async () => {
    comRede(true);
    comSessaoLocalDe(Date.now() - SESSION_MS - 1);
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });

    const app = await montar();

    expect(app.current.currentUser).toBeNull();
    expect(window.sessionStorage.getItem("kora_session")).toBeNull();
    expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    expect(app.current.loading).toBe(false);
  });

  it("o teto de 8 horas vence com a aba aberta, sem precisar de F5", async () => {
    const T0 = new Date("2026-07-29T12:00:00-03:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    comRede(true);
    comSessaoLocalDe(T0 - (SESSION_MS - 5 * 60 * 1000)); // faltam 5 min
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });

    const app = await montar();
    expect(app.current.currentUser).toMatchObject({ id: 7 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10);
    });

    expect(app.current.currentUser).toBeNull();
    expect(window.sessionStorage.getItem("kora_session")).toBeNull();
  });

  it("refresh da lista de usuários não zera a contagem de inatividade", async () => {
    const T0 = new Date("2026-07-29T12:00:00-03:00").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    comRede(true);
    comSessaoLocalDe(T0);
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });

    const app = await montar();
    expect(app.current.currentUser).toMatchObject({ id: 7 });

    // 25 min sem ninguém tocar na tela.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000);
    });
    expect(app.current.currentUser).toMatchObject({ id: 7 });

    // A lista de usuários recarrega (realtime, edição em Configurações): troca a
    // identidade do `currentUser`, mas NÃO é atividade de gente na tela.
    await act(async () => {
      await app.current.updateUser(7, { name: "Fulano Souza" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_MS - 25 * 60 * 1000 + 10);
    });

    expect(app.current.currentUser).toBeNull();
  });
});

// Run 5, leva 6 — o "Sair" mentia quando a rede estava fora.
//
// O `logout` limpava a tela e a sessão local e depois chamava
// `supabase.auth.signOut()` ignorando o retorno. O gotrue-js, quando o POST
// /logout falha na rede, devolve `{ error }` e sai ANTES de apagar o token do
// localStorage — inclusive o refresh token. No próximo carregamento o
// supabase-js religava a sessão sozinho, sem senha: num PDV compartilhado, o
// turno seguinte entrava como o anterior.
describe("AppContext — logout (Run 5, leva 6)", () => {
  const usuarioComPerms = { ...usuario, permissions: null };
  const CHAVE_TOKEN = "sb-abcdefgh-auth-token";

  async function montarLogado() {
    comRede(true);
    comSessaoLocalDe(Date.now());
    comSessaoNoAuth();
    comDados({ users: [usuarioComPerms] });
    const app = await montar();
    expect(app.current.currentUser).toMatchObject({ id: 7 });
    return app;
  }

  it("com o servidor confirmando, o logout deixa o supabase-js apagar o token", async () => {
    const app = await montarLogado();
    window.localStorage.setItem(CHAVE_TOKEN, "token");

    let r;
    await act(async () => { r = await app.current.logout(); });

    expect(r).toEqual({ error: null });
    expect(app.current.currentUser).toBeNull();
    expect(window.sessionStorage.getItem("kora_session")).toBeNull();
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1);
    // Sem argumento = escopo global: é o que revoga o refresh token no servidor.
    expect(mockSupabase.auth.signOut).toHaveBeenCalledWith();
  });

  it("signOut que falha não deixa o token no navegador — o F5 não religa a sessão", async () => {
    const app = await montarLogado();
    window.localStorage.setItem(CHAVE_TOKEN, "token valido");
    window.localStorage.setItem("kora.snapshot.bootstrap.v1", "dados do PDV");
    mockSupabase.auth.signOut.mockResolvedValueOnce({ error: { message: "Failed to fetch" } });

    let r;
    await act(async () => { r = await app.current.logout(); });

    expect(app.current.currentUser).toBeNull();
    expect(window.sessionStorage.getItem("kora_session")).toBeNull();
    expect(window.localStorage.getItem(CHAVE_TOKEN)).toBeNull();
    expect(r.error).toMatchObject({ message: "Failed to fetch" });
    // O snapshot offline continua: quem falhou foi a rede, não o cache — e é
    // dele que o PDV vive quando volta a abrir sem internet.
    expect(window.localStorage.getItem("kora.snapshot.bootstrap.v1")).toBe("dados do PDV");
  });
});

// Run 5, leva 8 — o bloqueio por tentativas contava por ABA.
//
// A tela de login promete "Bloqueio após 5 tentativas", mas o contador morava no
// sessionStorage: fechar a aba zerava. Num terminal de PDV compartilhado dava
// para chutar a senha do gerente indefinidamente, cinco de cada vez.
describe("AppContext — bloqueio por tentativas (Run 5, leva 8)", () => {
  it("cinco senhas erradas bloqueiam, e fechar a aba não solta o bloqueio", async () => {
    comRede(true);
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" },
    });

    const app = await montar();

    let r;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { r = await app.current.login("gerente", "chute"); });
    }
    expect(r.error).toMatch(/bloquead/i);
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(MAX_ATTEMPTS);

    // Aba nova: o navegador joga fora o sessionStorage, e só ele.
    window.sessionStorage.clear();
    const app2 = await montar();

    await act(async () => { r = await app2.current.login("gerente", "chute"); });

    expect(r.error).toMatch(/Aguarde/);
    // A 6ª tentativa nem foi ao servidor: o bloqueio segurou antes.
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("login certo limpa o contador — o próximo turno começa do zero", async () => {
    comRede(true);
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid login credentials" },
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: { id: "auth-7", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });
    comDados({ users: [{ ...usuario, permissions: null }] });

    const app = await montar();

    await act(async () => { await app.current.login("fulano", "errada"); });
    expect(getAttempts("fulano").count).toBe(1);

    await act(async () => { await app.current.login("fulano", "certa"); });

    expect(getAttempts("fulano")).toEqual({});
    expect(app.current.currentUser).toMatchObject({ id: 7 });
  });
});
