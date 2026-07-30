// @vitest-environment jsdom
//
// A2 da auditoria — `addSale` grava a venda no estado local ANTES de saber
// se o banco aceitou (otimista, para o Saldo do Dia responder na hora). Se o
// insert falha de verdade (RLS, constraint — não é queda de rede), a venda
// não existe em lugar nenhum e PRECISA sair do estado local: sem isso ela
// continuava somando no Saldo do Dia até alguém recarregar a página, e o
// caixa fechava o dia contando dinheiro que nunca foi gravado.
//
// O teste monta o AppProvider de verdade (não um mock do contexto) porque o
// defeito estava justamente na costura entre o otimista e o tratamento de
// erro. Só as folhas pesadas — tema, bridges, Jarvas, rede — são mockadas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

// `vi.mock` é içado para o topo do arquivo, então o mock precisa nascer em
// `vi.hoisted` para já existir quando a fábrica rodar.
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

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas que fazem efeito colateral e não têm nada a ver com o defeito.
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
vi.mock("@/lib/vendas", async (importOriginal) => ({
  ...(await importOriginal()),
  persistirVendaNormalizada: vi.fn(() => Promise.resolve()),
}));

import { AppProvider, useApp } from "./AppContext";

/** Expõe o contexto para o teste sem depender de nenhuma tela. */
function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

/** Faz `supabase.from(tabela).insert(...)` resolver com este resultado. */
function comInsertDeVendas(resultado) {
  mockSupabase.from.mockImplementation((tabela) => {
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (ok, falha) =>
      Promise.resolve(tabela === "sales" ? resultado : { data: [], error: null }).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
}

const venda = { id: "venda-1", comanda: "5", total: 30, items: [{ id: 1, name: "X", price: 30, qty: 1 }] };

function montar() {
  const app = { current: null };
  const Sonda = capturarApp(app);
  render(
    <AppProvider>
      <Sonda />
    </AppProvider>,
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("AppContext.addSale — otimista com desfazer (A2)", () => {
  it("venda gravada com sucesso entra no estado local e fica", async () => {
    comInsertDeVendas({ data: null, error: null });
    const app = montar();

    await act(async () => {
      await app.current.addSale(venda);
    });

    expect(app.current.sales.map((v) => v.id)).toContain("venda-1");
  });

  it("erro DURO (RLS/constraint) desfaz o otimista — nada de venda fantasma no Saldo do Dia", async () => {
    comInsertDeVendas({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
    const app = montar();

    await act(async () => {
      await expect(app.current.addSale(venda)).rejects.toBeTruthy();
    });

    expect(app.current.sales.map((v) => v.id)).not.toContain("venda-1");
  });

  it("erro duro não derruba vendas que já estavam no estado", async () => {
    comInsertDeVendas({ data: null, error: null });
    const app = montar();
    await act(async () => {
      await app.current.addSale({ ...venda, id: "venda-anterior" });
    });

    comInsertDeVendas({ data: null, error: { code: "23505", message: "duplicate key" } });
    await act(async () => {
      await expect(app.current.addSale(venda)).rejects.toBeTruthy();
    });

    const ids = app.current.sales.map((v) => v.id);
    expect(ids).toContain("venda-anterior");
    expect(ids).not.toContain("venda-1");
  });

  it("queda de REDE mantém a venda no estado e enfileira para reenvio", async () => {
    comInsertDeVendas({ data: null, error: { message: "TypeError: Failed to fetch" } });
    const app = montar();

    let retorno;
    await act(async () => {
      retorno = await app.current.addSale(venda);
    });

    expect(retorno).toMatchObject({ error: null, offline: true });
    // Offline a venda VALE: ela sobe sozinha quando a conexão voltar.
    expect(app.current.sales.map((v) => v.id)).toContain("venda-1");
    expect(app.current.pendenciasOffline).toBeGreaterThan(0);
  });

  it("sucesso devolve o mesmo contrato das demais actions ({ error })", async () => {
    comInsertDeVendas({ data: null, error: null });
    const app = montar();

    let retorno;
    await act(async () => {
      retorno = await app.current.addSale(venda);
    });

    expect(retorno).toEqual({ error: null });
  });
});
