// @vitest-environment jsdom
//
// F021 fatia 2, critério 11 do lado do `AppContext`.
//
// A fila pendente mora no IndexedDB, que responde depois do primeiro render.
// O inicializador preguiçoso do `useState` lê o espelho ainda vazio, então o
// número da sessão anterior só chega pela assinatura da hidratação. Este teste
// tranca as duas pontas: o contador sobe quando a hidratação termina, e a
// assinatura é cancelada no desmonte (senão o provider vira vazamento a cada
// remontagem dentro do mesmo processo).
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
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

// A fila falsa no lugar do IndexedDB: o teste é quem diz quando a hidratação
// termina e o que ela trouxe.
const fila = vi.hoisted(() => ({ ops: [], assinantes: new Set() }));

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
}));

import { AppProvider, useApp } from "./AppContext";

function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

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

function montar() {
  const app = { current: null };
  const Sonda = capturarApp(app);
  const { unmount } = render(
    <AppProvider>
      <Sonda />
    </AppProvider>,
  );
  return { app, unmount };
}

/** O que o adaptador faz quando o banco finalmente responde. */
async function hidratacaoTermina(ops) {
  fila.ops = ops;
  await act(async () => {
    for (const fn of [...fila.assinantes]) fn();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  fila.ops = [];
  fila.assinantes.clear();
  comSupabaseNeutro();
});

describe("AppContext — contador de pendências e a hidratação do IndexedDB", () => {
  it("o número da sessão anterior chega quando a hidratação termina", async () => {
    const { app, unmount } = montar();

    // Primeiro render: o espelho do banco ainda está vazio.
    expect(app.current.pendenciasOffline).toBe(0);

    await hidratacaoTermina([
      { uid: "a", tipo: "baixa_estoque" },
      { uid: "b", tipo: "emitir_nfce" },
    ]);

    expect(app.current.pendenciasOffline).toBe(2);
    // A pendência fiscal deriva do contador, então ela também acompanha.
    expect(app.current.pendenciasFiscais).toBe(1);

    unmount();
  });

  it("desmontar cancela a assinatura da hidratação", async () => {
    const { unmount } = montar();

    expect(fila.assinantes.size).toBe(1);
    unmount();
    expect(fila.assinantes.size).toBe(0);
  });
});
