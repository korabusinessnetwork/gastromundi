// @vitest-environment jsdom
//
// Quando o banco local não abre, a tela tem de contar isso.
//
// `storageIdb.js` cai para memória quando o IndexedDB não abre (aba anônima,
// dados de site bloqueados, outra aba segurando uma versão antiga do banco) e
// avisa por `prontoOffline`, que resolve com `{ idb: false }`. Esse sinal
// existia desde a fatia 2 do F021 e NÃO TINHA UM CONSUMIDOR SEQUER: a fila
// passava a viver só na memória da aba, fechar o navegador apagava venda que já
// saiu para o cliente, e o indicador seguia prometendo "pedidos guardados".
//
// Aqui o teste roda no jsdom SEM `indexedDB` (é o ambiente padrão do jsdom, e
// nada neste arquivo o injeta), então a fila de verdade cai para memória, que é
// exatamente o caso que precisa chegar à tela.
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

import { AppProvider, useApp } from "./AppContext";
// A fila de verdade, com o storage de verdade: é ele quem decide que não há
// banco, e é esse veredito que o provider precisa ler.
import { filaOffline, prontoOffline } from "@/lib/offline/filaApp";

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
  // A hidratação resolve fora do render: o aviso chega depois do primeiro
  // desenho, como acontece no app.
  await act(async () => {
    await prontoOffline;
  });
  return { app, unmount };
}

let onLineOriginal;
/** O aparelho sem rede: o dreno não roda, então a pendência semeada continua lá. */
function semRede() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
}

beforeEach(() => {
  vi.clearAllMocks();
  onLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  window.localStorage.clear();
  window.sessionStorage.clear();
  filaOffline.limpar();
  indicador.props = null;
  comSupabaseNeutro();
});

afterEach(() => {
  if (onLineOriginal) Object.defineProperty(window.navigator, "onLine", onLineOriginal);
  else delete window.navigator.onLine;
});

describe("AppContext, o banco local que não abriu chega à tela", () => {
  it("o ambiente não tem IndexedDB, então a fila é só desta aba", async () => {
    // Trava a premissa do arquivo: sem isso o teste passaria por engano num
    // ambiente que tivesse banco.
    expect(window.indexedDB).toBeUndefined();
    await expect(prontoOffline).resolves.toMatchObject({ idb: false });
  });

  it("o provider avisa o indicador de que os pedidos ficam só nesta aba", async () => {
    const { unmount } = await montar();

    expect(indicador.props.semArmazenamento).toBe(true);

    unmount();
  });

  it("com pendência na fila o aviso continua de pé, junto do número", async () => {
    semRede();
    filaOffline.enfileirar({ tipo: "insert_venda", payload: { id: "v1" } });

    const { app, unmount } = await montar();

    expect(app.current.pendenciasOffline).toBe(1);
    expect(indicador.props.pendencias).toBe(1);
    expect(indicador.props.semArmazenamento).toBe(true);

    unmount();
  });
});
