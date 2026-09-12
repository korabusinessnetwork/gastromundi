// @vitest-environment jsdom
//
// O dreno da fila offline precisa tentar de novo sozinho.
//
// Antes ele só era disparado por MUDANÇA de sinal: rede, fim da carga, ou o
// contador de pendências. Se ele parasse num erro de rede com o
// `navigator.onLine` ainda dizendo `true` (Wi-Fi conectado sem saída, portal
// cativo, Supabase fora do ar), nenhum desses três sinais voltava a mudar e
// NADA mais tentava: a venda ficava guardada até alguém enfileirar outra
// operação ou recarregar a página. Este teste tranca as duas pontas do
// reagendamento (ele acontece, e ele morre no desmonte) e a ponta que chega à
// tela (o indicador recebe que a última tentativa falhou).
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
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

// A fila falsa: o teste é quem diz o que está pendente.
const fila = vi.hoisted(() => ({ ops: [], assinantes: new Set() }));
// O dreno falso: o teste é quem diz como cada tentativa termina. O que está sob
// teste é o AGENDAMENTO das tentativas, não o que acontece dentro de cada uma
// (isso é `fila.test.js` e os testes de reenvio de venda).
const drenar = vi.hoisted(() => vi.fn());
// O que o indicador de rede recebe do provider.
const indicador = vi.hoisted(() => ({ props: null }));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/lib/jarvasEngine", () => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/observabilidade", () => ({
  reportarFalha: vi.fn(),
  reportarInconsistencia: vi.fn(),
  setTenantObservabilidade: vi.fn(),
}));
vi.mock("@/components/shared/IndicadorRede", () => ({
  default: (props) => {
    indicador.props = props;
    return null;
  },
}));
vi.mock("@/components/shared/PonteLocalBridge", () => ({ default: () => null }));
vi.mock("@/components/shared/ImpressaoLancamentosBridge", () => ({ default: () => null }));
vi.mock("@/lib/tenant", () => ({
  buscarBootstrapTenant: vi.fn(() => Promise.resolve({ data: null, error: null })),
  moduloHabilitado: () => true,
  addonHabilitado: () => false,
}));
vi.mock("@/lib/offline/fila", () => ({
  CHAVE_FILA_PENDING: "kora.fila.pending.v1",
  drenarFila: drenar,
}));
vi.mock("@/lib/offline/filaApp", () => ({
  filaOffline: {
    listar: () => fila.ops,
    tamanho: () => fila.ops.length,
    enfileirar: (op) => fila.ops.push(op),
    removerPorUid: vi.fn(),
    limpar: () => {
      fila.ops = [];
    },
  },
  contarPendenciasFiscais: () => fila.ops.filter((o) => o?.tipo === "emitir_nfce").length,
  assinarFilaOffline: (fn) => {
    fila.assinantes.add(fn);
    return () => fila.assinantes.delete(fn);
  },
  prontoOffline: Promise.resolve({ idb: true }),
}));

import { AppProvider, useApp } from "./AppContext";

const INTERVALO_MS = 45_000;

function comSupabaseNeutro() {
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

function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

async function montar() {
  const app = { current: null };
  const Sonda = capturarApp(app);
  let unmount;
  await act(async () => {
    ({ unmount } = render(
      <AppProvider>
        <Sonda />
      </AppProvider>,
    ));
  });
  return { app, unmount };
}

/** Quantas vezes o dreno da fila foi chamado até agora. */
const tentativas = () => drenar.mock.calls.length;

async function passar(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  fila.ops = [{ uid: "a", tipo: "insert_venda" }];
  fila.assinantes.clear();
  indicador.props = null;
  // Toda tentativa bate num erro de rede: a fila não anda e o
  // `navigator.onLine` continua dizendo `true`, que é exatamente o cenário em
  // que nada mais tentava.
  drenar.mockImplementation(async () => ({
    enviadas: 0,
    falhas: [],
    restantes: fila.ops.length,
    parouPorRede: true,
  }));
  comSupabaseNeutro();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AppContext, o dreno da fila offline tenta de novo sozinho", () => {
  it("com pendência e o navegador online, uma nova tentativa a cada intervalo", async () => {
    const { app, unmount } = await montar();
    expect(app.current.pendenciasOffline).toBe(1);

    const naSubida = tentativas();
    expect(naSubida).toBeGreaterThan(0);

    await passar(INTERVALO_MS);
    expect(tentativas()).toBe(naSubida + 1);

    await passar(INTERVALO_MS);
    expect(tentativas()).toBe(naSubida + 2);

    unmount();
  });

  it("o temporizador não empilha: um intervalo, uma tentativa", async () => {
    const { unmount } = await montar();

    const naSubida = tentativas();
    // Quatro intervalos de uma vez. Temporizador empilhado (um por render)
    // daria mais de quatro tentativas.
    await passar(INTERVALO_MS * 4);
    expect(tentativas()).toBe(naSubida + 4);

    unmount();
  });

  it("desmontar o provider para de tentar", async () => {
    const { unmount } = await montar();

    await passar(INTERVALO_MS);
    const antes = tentativas();

    unmount();
    await passar(INTERVALO_MS * 3);

    expect(tentativas()).toBe(antes);
  });

  it("sem pendência nenhuma não fica temporizador rodando", async () => {
    fila.ops = [];
    const { unmount } = await montar();

    await passar(INTERVALO_MS * 3);
    expect(tentativas()).toBe(0);

    unmount();
  });

  it("o indicador recebe que a última tentativa falhou, e que ela deixou de falhar", async () => {
    const { unmount } = await montar();

    await passar(INTERVALO_MS);
    expect(indicador.props.falhaEnvio).toBe(true);

    // A rede volta: a tentativa seguinte esvazia a fila.
    drenar.mockImplementation(async () => {
      fila.ops = [];
      return { enviadas: 1, falhas: [], restantes: 0, parouPorRede: false };
    });
    await passar(INTERVALO_MS);

    expect(indicador.props.falhaEnvio).toBe(false);
    expect(indicador.props.pendencias).toBe(0);

    unmount();
  });
});
