// @vitest-environment jsdom
//
// TD009 etapa 3 — os dois caminhos de venda que sobraram fora do `addSale`.
//
// `cancelarVendaFechada` antes marcava `data.cancelada` no blob de `sales` e
// APAGAVA as linhas de `vendas`, `venda_itens` e `venda_pagamentos`. Sem o
// blob, apagar apagaria a venda cancelada do banco inteiro, auditoria junto.
// Agora ele marca as colunas novas e preserva as filhas.
//
// `reenviarVendaOffline` roda toda vez que o dreno passa. O `upsert` antigo
// protegia a LINHA e não o EVENTO: cada passada reemitia `venda.finalizada`.
// Com `jaExistia` no retorno, o evento só sai quando a venda gravou de fato
// (pendência 6 do ADR-013).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

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
const mockPersistir = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/vendas", async (importOriginal) => ({
  ...(await importOriginal()),
  persistirVendaNormalizada: mockPersistir,
}));

import { emitirEvento } from "@/lib/jarvas";
import { reportarInconsistencia } from "@/lib/observabilidade";
import { AppProvider, useApp } from "./AppContext";

/** Toda chamada `from(x).metodo(...)` registrada, para conferir o que o app fez. */
let chamadas;
/** Resposta do `update` em `vendas` — o que muda entre um teste e outro. */
let respostaUpdateVendas;

function montarSupabase() {
  chamadas = [];
  respostaUpdateVendas = { data: [{ id: "venda-1" }], error: null };

  mockSupabase.from.mockImplementation((tabela) => {
    const registrar = (metodo, payload) => chamadas.push({ tabela, metodo, payload });

    const criarBuilder = (resposta) => {
      const builder = {};
      for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
        builder[m] = vi.fn(() => builder);
      }
      builder.then = (ok, falha) => Promise.resolve(resposta()).then(ok, falha);
      return builder;
    };

    const api = {};
    for (const m of ["select", "insert", "delete", "upsert"]) {
      api[m] = vi.fn((payload) => {
        registrar(m, payload);
        return criarBuilder(() => ({ data: [], error: null }));
      });
    }
    api.update = vi.fn((payload) => {
      registrar("update", payload);
      return criarBuilder(() => (tabela === "vendas" ? respostaUpdateVendas : { data: [], error: null }));
    });
    return api;
  });
}

function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

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

const venda = { id: "venda-1", comanda: "5", total: 30, items: [{ id: 1, name: "X", price: 30, qty: 1 }] };

/** Semeia a venda no estado local pelo caminho normal, sem tocar no banco. */
async function comVendaFechada(app) {
  mockPersistir.mockResolvedValue({ ok: true, jaExistia: false, cabecalhoGravado: true, falhas: [] });
  await act(async () => {
    await app.current.addSale(venda);
  });
  chamadas.length = 0;
  vi.mocked(emitirEvento).mockClear();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  montarSupabase();
});

describe("cancelarVendaFechada — cancelar é marcar, não apagar (TD009 etapa 3)", () => {
  it("marca as colunas de cancelamento em vendas", async () => {
    const app = montar();
    await comVendaFechada(app);

    let retorno;
    await act(async () => {
      retorno = await app.current.cancelarVendaFechada("venda-1", "cliente desistiu");
    });

    expect(retorno).toEqual({ error: null });
    const update = chamadas.find((c) => c.tabela === "vendas" && c.metodo === "update");
    expect(update.payload).toMatchObject({ cancelada: true, motivo_cancelamento: "cliente desistiu" });
    expect(update.payload.cancelada_em).toEqual(expect.any(String));
  });

  it("não apaga venda_itens, venda_pagamentos nem a própria venda", async () => {
    const app = montar();
    await comVendaFechada(app);

    await act(async () => {
      await app.current.cancelarVendaFechada("venda-1", "erro do caixa");
    });

    const apagadas = chamadas.filter((c) => c.metodo === "delete").map((c) => c.tabela);
    expect(apagadas).not.toContain("venda_itens");
    expect(apagadas).not.toContain("venda_pagamentos");
    expect(apagadas).not.toContain("vendas");
    // Receita cancelada não é receita: o lançamento financeiro continua saindo.
    expect(apagadas).toContain("lancamentos");
  });

  it("a venda cancelada fica marcada no estado local", async () => {
    const app = montar();
    await comVendaFechada(app);

    await act(async () => {
      await app.current.cancelarVendaFechada("venda-1", "cliente desistiu");
    });

    const local = app.current.sales.find((s) => s.id === "venda-1");
    expect(local).toMatchObject({ cancelada: true, motivoCancelamento: "cliente desistiu" });
  });

  it("migration pendente (42703) falha com mensagem explícita, sem fingir sucesso", async () => {
    const app = montar();
    await comVendaFechada(app);
    respostaUpdateVendas = { data: null, error: { code: "42703", message: 'column "cancelada" does not exist' } };

    let retorno;
    await act(async () => {
      retorno = await app.current.cancelarVendaFechada("venda-1", "cliente desistiu");
    });

    expect(retorno.error.code).toBe("migration_pendente");
    expect(retorno.error.message).toContain("20260920_vendas_cancelamento");
    expect(reportarInconsistencia).toHaveBeenCalled();
    // Fingir que cancelou seria pior que o erro: a venda seguiria no relatório
    // e o operador não saberia. O estado local não muda.
    expect(app.current.sales.find((s) => s.id === "venda-1").cancelada).toBeFalsy();
  });

  it("update que não pega linha nenhuma (RLS) não vira cancelamento silencioso", async () => {
    const app = montar();
    await comVendaFechada(app);
    respostaUpdateVendas = { data: [], error: null };

    let retorno;
    await act(async () => {
      retorno = await app.current.cancelarVendaFechada("venda-1", "cliente desistiu");
    });

    expect(retorno.error.code).toBe("no_rows_updated");
    expect(app.current.sales.find((s) => s.id === "venda-1").cancelada).toBeFalsy();
  });
});

describe("reenviarVendaOffline — idempotência do evento (ADR-013 pendência 6)", () => {
  /** Enfileira a venda e deixa o dreno passar (o efeito dispara sozinho). */
  async function drenar(app) {
    await act(async () => {
      app.current.enfileirarOffline({ tipo: "insert_venda", payload: { id: venda.id, data: venda } });
    });
    await waitFor(() => expect(mockPersistir).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
  }

  it("venda que já existia no banco não reemite venda.finalizada", async () => {
    mockPersistir.mockResolvedValue({ ok: true, jaExistia: true, cabecalhoGravado: true, falhas: [] });
    const app = montar();
    await waitFor(() => expect(app.current.loading).toBe(false));

    await drenar(app);

    const finalizadas = vi.mocked(emitirEvento).mock.calls.filter((c) => c[0] === "venda.finalizada");
    expect(finalizadas).toHaveLength(0);
  });

  it("venda que gravou agora emite venda.finalizada uma vez", async () => {
    mockPersistir.mockResolvedValue({ ok: true, jaExistia: false, cabecalhoGravado: true, falhas: [] });
    const app = montar();
    await waitFor(() => expect(app.current.loading).toBe(false));

    await drenar(app);

    const finalizadas = vi.mocked(emitirEvento).mock.calls.filter((c) => c[0] === "venda.finalizada");
    expect(finalizadas).toHaveLength(1);
    expect(finalizadas[0][2]).toMatchObject({ venda_id: "venda-1" });
  });

  it("cabeçalho que não gravou devolve erro e a venda não sai da fila por sucesso falso", async () => {
    const erro = { message: "TypeError: Failed to fetch" };
    mockPersistir.mockResolvedValue({ ok: false, jaExistia: false, cabecalhoGravado: false, falhas: [{ etapa: "vendas", error: erro }] });
    const app = montar();
    await waitFor(() => expect(app.current.loading).toBe(false));

    await drenar(app);

    const finalizadas = vi.mocked(emitirEvento).mock.calls.filter((c) => c[0] === "venda.finalizada");
    expect(finalizadas).toHaveLength(0);
    // Erro de rede: o dreno para e a venda continua pendente.
    expect(app.current.pendenciasOffline).toBeGreaterThan(0);
  });

  it("o reenvio não escreve em sales", async () => {
    mockPersistir.mockResolvedValue({ ok: true, jaExistia: false, cabecalhoGravado: true, falhas: [] });
    const app = montar();
    await waitFor(() => expect(app.current.loading).toBe(false));

    await drenar(app);

    expect(chamadas.filter((c) => c.tabela === "sales" && c.metodo !== "select")).toHaveLength(0);
  });
});
