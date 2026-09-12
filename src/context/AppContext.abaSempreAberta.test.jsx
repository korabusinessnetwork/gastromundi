// @vitest-environment jsdom
//
// A aba do PDV nunca fecha.
//
// O computador do balcão não é desligado e a aba do caixa fica aberta 24 horas
// por dia: ninguém recarrega a página, ninguém desloga, ninguém abre de manhã e
// fecha à noite. Todo comportamento do app que dependia desse ciclo de abertura
// diária estava, na prática, rodando uma vez na vida da aba e nunca mais.
//
// Este arquivo cobre justamente o que só quebra com a aba velha: a análise do
// Jarvas que nunca era refeita, a lista de vendas que só crescia, a lacuna de
// eventos de realtime que ninguém repunha depois de uma queda de rede, o
// computador que dorme e volta com os temporizadores atrasados, e o canal de
// realtime que morria em silêncio.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao usado" } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

const mockJarvasEngine = vi.hoisted(() => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/jarvasEngine", () => mockJarvasEngine);

// Folhas com efeito colateral, sem relação com o que está sendo medido.
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
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
import { saveSession } from "@/utils/session";

const usuario = { id: 7, name: "Fulano", username: "fulano", role: "gerente", auth_id: "auth-7" };
const T0 = new Date("2026-03-10T12:00:00.000Z").getTime();
const TRINTA_MIN = 30 * 60 * 1000;

function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

/**
 * Canais de realtime abertos pelo provider, por nome. Guarda os handlers de
 * `postgres_changes` e o callback de status do `subscribe`, para o teste poder
 * entregar um evento do banco ou um status de canal como o servidor entregaria.
 */
const canaisRealtime = new Map();
function comCanaisCapturados() {
  canaisRealtime.clear();
  mockSupabase.channel.mockImplementation((nome) => {
    const registro = { handlers: [], statusCb: null };
    canaisRealtime.set(nome, registro);
    const ch = {
      on: vi.fn((_evento, _filtro, handler) => { registro.handlers.push(handler); return ch; }),
      subscribe: vi.fn((cb) => {
        registro.statusCb = cb ?? null;
        // O supabase-js confirma a inscrição por este mesmo callback.
        if (cb) cb("SUBSCRIBED");
        return ch;
      }),
    };
    return ch;
  });
}

/** Entrega um evento de banco a um canal, como o realtime faria. */
async function emitirRealtime(nome, payload) {
  const registro = canaisRealtime.get(nome);
  if (!registro) throw new Error(`canal ${nome} não foi aberto`);
  await act(async () => {
    for (const handler of registro.handlers) handler(payload);
  });
}

/** Linhas por tabela: `{ users: [...] }`. Tabela não citada responde vazia. */
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

/** Sessão do Supabase Auth válida, o JWT que a RLS exige. */
function comSessaoNoAuth() {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "auth-7", app_metadata: { tenant_id: "t1" } } } },
  });
}

let onLineOriginal;
function comRede(online) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

/**
 * Mexe o mouse. Zera o cronômetro de inatividade (`useIdleTimer` escuta
 * `mousemove`), que é de 30 minutos, os mesmos 30 minutos do reagendamento do
 * Jarvas: sem isto o avanço do relógio derrubaria a sessão no mesmo instante
 * em que a análise deveria rodar, e o teste mediria outra coisa.
 */
function mexerNaTela() {
  window.dispatchEvent(new Event("mousemove"));
}

/**
 * Avança o relógio com gente trabalhando no balcão: de 10 em 10 minutos alguém
 * encosta na tela, o que zera a inatividade. Sem isso o teste não consegue
 * atravessar 30 minutos, porque a sessão cai por inatividade exatamente no
 * mesmo instante que se quer medir.
 */
async function passarTempoComGenteNaTela(ms) {
  const PASSO = 10 * 60 * 1000;
  let restante = ms;
  while (restante > 0) {
    const trecho = Math.min(PASSO, restante);
    await act(async () => { await vi.advanceTimersByTimeAsync(trecho); });
    mexerNaTela();
    restante -= trecho;
  }
}

/**
 * Quantas cargas completas do estabelecimento já aconteceram. Cada `bootstrap`
 * lê a tabela `products` exatamente uma vez, então contar essa leitura é contar
 * carga.
 */
function cargasFeitas() {
  return mockSupabase.from.mock.calls.filter(([tabela]) => tabela === "products").length;
}

/** Deixa as promessas da carga terminarem. */
async function deixarACargaTerminar() {
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}

async function montarLogado() {
  comRede(true);
  saveSession(usuario);
  comSessaoNoAuth();
  const app = { current: null };
  const Sonda = capturarApp(app);
  let tela;
  await act(async () => {
    tela = render(
      <AppProvider>
        <Sonda />
      </AppProvider>,
    );
  });
  return { app, tela };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  comDados({ users: [{ ...usuario, permissions: null }] });
  comCanaisCapturados();
  onLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  if (onLineOriginal) Object.defineProperty(window.navigator, "onLine", onLineOriginal);
  else delete window.navigator.onLine;
  vi.useRealTimers();
});

// ── C01 ──────────────────────────────────────────────────────────
// O motor do Jarvas era chamado por um efeito com dependências
// [loading, currentUser?.id]. Numa aba que nunca recarrega e onde ninguém
// desloga, essas duas dependências mudam uma única vez, então a análise rodava
// no primeiro dia e nunca mais: nenhum alerta novo de ruptura de estoque,
// divergência de caixa, conta vencida ou cancelamento recorrente. O motor tem
// throttle próprio de 6 horas, desenhado para aberturas repetidas de página que
// no balcão nunca acontecem, e deduplicação por dia, ou seja ele GERARIA o
// alerta de hoje se alguém o chamasse.
describe("Jarvas na aba que nunca recarrega (C01)", () => {
  it("a análise é refeita em intervalo, sem depender de recarregar a página", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    await montarLogado();
    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(1);

    await passarTempoComGenteNaTela(TRINTA_MIN + 10);
    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(2);

    // E segue reagendando, não é um tique único.
    await passarTempoComGenteNaTela(TRINTA_MIN);
    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(3);
  });

  it("a análise recebe os dados de agora, não os do momento em que a aba abriu", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    await montarLogado();
    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(1);

    // Chega uma venda pelo realtime depois da primeira análise.
    await emitirRealtime("sales-realtime", {
      eventType: "INSERT",
      new: { data: { id: "v-nova", total: 40, at: new Date(T0).toISOString(), items: [] } },
    });

    await passarTempoComGenteNaTela(TRINTA_MIN + 10);

    const ultima = mockJarvasEngine.executarAnaliseJarvas.mock.calls.at(-1)[0];
    expect(ultima.sales).toEqual([expect.objectContaining({ id: "v-nova" })]);
  });

  it("o temporizador da análise é limpo no desmonte", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    const { tela } = await montarLogado();
    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(1);

    await act(async () => { tela.unmount(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * TRINTA_MIN); });

    expect(mockJarvasEngine.executarAnaliseJarvas).toHaveBeenCalledTimes(1);
  });
});

// ── C02 ──────────────────────────────────────────────────────────
// `sales` só crescia. A janela de 90 dias era resolvida uma vez, no instante em
// que a aba abriu, e cada INSERT do realtime empilhava a venda na frente sem
// nada nunca podar. Numa aba aberta há semanas o array carrega os 90 dias da
// abertura mais tudo o que foi vendido desde então, cada venda com o blob de
// itens dentro, e Saldo do Dia, sidebar, relatório e fechamento varrem tudo a
// cada render. O sintoma no balcão é a lentidão que "melhora quando reiniciam o
// computador", porque reiniciar é o único momento em que a janela volta a valer.
describe("a janela de 90 dias das vendas na aba velha (C02)", () => {
  const diasAtras = (n, base = T0) => new Date(base - n * 24 * 60 * 60 * 1000).toISOString();

  async function chegarVenda(venda) {
    await emitirRealtime("sales-realtime", { eventType: "INSERT", new: { data: venda } });
  }

  it("venda mais antiga que a janela sai da lista quando chega uma venda nova", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    const { app } = await montarLogado();

    // A aba está aberta há muito tempo: entrou uma venda de ontem e uma venda
    // de 100 dias atrás, que já não cabe na janela do bootstrap.
    await chegarVenda({ id: "v-ontem", total: 30, at: diasAtras(1), items: [] });
    await chegarVenda({ id: "v-antiga", total: 10, at: diasAtras(100), items: [] });
    await chegarVenda({ id: "v-agora", total: 50, at: diasAtras(0), items: [] });

    const ids = app.current.sales.map((v) => v.id);
    expect(ids).toContain("v-agora");
    expect(ids).toContain("v-ontem");
    expect(ids).not.toContain("v-antiga");
  });

  it("venda sem data legível fica, porque não dá para afirmar que envelheceu", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    const { app } = await montarLogado();

    await chegarVenda({ id: "v-sem-data", total: 20, items: [] });
    await chegarVenda({ id: "v-agora", total: 50, at: diasAtras(0), items: [] });

    expect(app.current.sales.map((v) => v.id)).toContain("v-sem-data");
  });

  it("venda repetida pelo realtime não entra duas vezes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    const { app } = await montarLogado();

    await chegarVenda({ id: "v-agora", total: 50, at: diasAtras(0), items: [] });
    await chegarVenda({ id: "v-agora", total: 50, at: diasAtras(0), items: [] });

    expect(app.current.sales.filter((v) => v.id === "v-agora")).toHaveLength(1);
  });
});

// ── C03 ──────────────────────────────────────────────────────────
// A reconexão do websocket é da biblioteca e ela cuida disso. A LACUNA não: o
// que aconteceu no banco enquanto o socket esteve fora nunca era reposto, e
// nada refazia a carga na volta. Um Wi-Fi que troca de canal por 40 segundos às
// 19h30 significa que os pedidos lançados nesses 40 segundos não existem para a
// tela do caixa, e numa aba que nunca recarrega isso durava até alguém apertar
// F5, ou seja, podia durar para sempre.
describe("a lacuna de eventos quando a rede volta (C03)", () => {
  it("a volta da conexão refaz a carga", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    await montarLogado();
    const antes = cargasFeitas();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    await deixarACargaTerminar();

    expect(cargasFeitas()).toBe(antes + 1);
  });

  it("rajada de eventos de rede vira uma carga só", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    await montarLogado();
    const antes = cargasFeitas();

    // Link oscilando: o navegador emite `online` várias vezes em sequência.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    await deixarACargaTerminar();

    expect(cargasFeitas()).toBe(antes + 1);
  });

  it("passado o intervalo mínimo, uma nova queda e volta recarrega de novo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    await montarLogado();
    const antes = cargasFeitas();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    await deixarACargaTerminar();
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await deixarACargaTerminar();

    expect(cargasFeitas()).toBe(antes + 2);
  });

  it("sem sessão não há o que recarregar, a RLS devolveria tudo vazio", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    // Sem sessão local e sem JWT: o app abre na tela de login.
    const app = { current: null };
    const Sonda = capturarApp(app);
    comRede(true);
    await act(async () => {
      render(
        <AppProvider>
          <Sonda />
        </AppProvider>,
      );
    });
    const antes = cargasFeitas();

    await act(async () => { window.dispatchEvent(new Event("online")); });
    await deixarACargaTerminar();

    expect(cargasFeitas()).toBe(antes);
  });
});
