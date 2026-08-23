// @vitest-environment jsdom
//
// TD013 — gravação atômica dos itens da comanda.
//
// `pending.items` é um jsonb gravado inteiro. Para não apagar o item que
// outro aparelho lançou, o app fazia três passos separados: lia o banco,
// mesclava no cliente e gravava. Entre a leitura e a gravação existe uma
// janela de rede, e o Palm do garçom gravando dentro dela tinha o item
// sobrescrito — a cerveja sumia da conta no horário de pico.
//
// Agora quem lê, mescla e grava é o Postgres, numa transação só e com a
// linha travada (função `gravar_itens_comanda`, migration 20260922). O que
// estes testes prendem é o lado JavaScript do contrato: que a chamada saia
// com o snapshot certo, que a tela mostre o que o banco mesclou, e que o app
// continue funcionando enquanto a migration não é rodada à mão em produção.
//
// Monta o AppProvider de verdade porque o defeito mora na costura entre a
// gravação, o estado da tela e a fila offline.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { CHAVE_FILA_PENDING } from "@/lib/offline/fila";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
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

// Folhas com efeito colateral, sem relação com o que se testa aqui.
vi.mock("@/lib/jarvas", () => ({
  emitirEvento: vi.fn(),
  registrarInsight: vi.fn(() => Promise.resolve({ error: null })),
  buscarInsights: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));
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

/** Expõe o contexto para o teste sem depender de nenhuma tela. */
function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

/** Tudo que foi direto para tabela (não RPC), na ordem. */
let chamadasTabela = [];

/** O que o banco devolve na leitura de `pending` do caminho antigo. */
let itensNoBanco = null;

/** Resultado da próxima escrita em tabela (update/insert/delete). */
let resultadoEscrita = { data: null, error: null };

function comTabelas() {
  mockSupabase.from.mockImplementation((tabela) => {
    const builder = { escrita: false };
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    // O caminho antigo lê os itens atuais com .select("items").eq(...).maybeSingle().
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: itensNoBanco === null ? null : { items: itensNoBanco }, error: null }),
    );
    builder.single = builder.maybeSingle;
    builder.then = (ok, falha) =>
      Promise.resolve(builder.escrita ? resultadoEscrita : { data: [], error: null }).then(ok, falha);

    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) {
      api[m] = vi.fn((...args) => {
        chamadasTabela.push({ tabela, metodo: m, args });
        builder.escrita = m !== "select";
        return builder;
      });
    }
    return api;
  });
}

/** Chamadas a um método numa tabela, na ordem. */
const naTabela = (tabela, metodo) =>
  chamadasTabela.filter((c) => c.tabela === tabela && c.metodo === metodo);

/** Argumentos de cada chamada a uma RPC específica, na ordem. */
const argsRpc = (nome) =>
  mockSupabase.rpc.mock.calls.filter(([fn]) => fn === nome).map(([, args]) => args);

const comRpc = (resultado) => mockSupabase.rpc.mockImplementation(() => Promise.resolve(resultado));

const SEM_MIGRATION = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
const SEM_REDE = { data: null, error: { message: "TypeError: Failed to fetch" } };
const RLS_NEGOU = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };

const filaGravada = () => JSON.parse(window.localStorage.getItem(CHAVE_FILA_PENDING) ?? "[]");

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

const CERVEJA = { uid: "u-cerveja", name: "Cerveja", price: 10, qty: 1 };
const PORCAO = { uid: "u-porcao", name: "Porção", price: 30, qty: 1 };
/** Lançado pelo Palm do garçom enquanto o PDV estava com a conta aberta. */
const CAIPIRINHA = { uid: "u-caipirinha", name: "Caipirinha", price: 20, qty: 2 };

/** Deixa uma comanda aberta no estado, como depois de um lançamento. */
async function comComandaAberta(app, items = [CERVEJA]) {
  await act(async () => {
    await app.current.addPending({ id: "c1", comanda: "1", items, status: "open", total: 10 });
  });
  chamadasTabela = [];
}

const comandaNaTela = (app) => app.current.pending.find((p) => p.id === "c1");

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  chamadasTabela = [];
  itensNoBanco = null;
  resultadoEscrita = { data: null, error: null };
  comTabelas();
  comRpc({ data: { items: [], total: null, houve_mescla: false }, error: null });
});

describe("AppContext — gravação atômica dos itens da comanda (TD013)", () => {
  it("lançar item grava pela função do banco, sem a leitura separada de antes", async () => {
    const app = montar();
    await comComandaAberta(app);
    const novos = [CERVEJA, PORCAO];

    await act(async () => {
      await app.current.updatePending("c1", { items: novos, total: 40 }, { baseItems: [CERVEJA] });
    });

    expect(argsRpc("gravar_itens_comanda")).toEqual([
      { p_id: "c1", p_items: novos, p_base_uids: ["u-cerveja"], p_total: 40 },
    ]);
    // A leitura do caminho antigo era o primeiro dos três passos da corrida.
    expect(naTabela("pending", "select")).toEqual([]);
    expect(naTabela("pending", "update")).toEqual([]);
  });

  it("o item que o outro aparelho lançou aparece na conta na hora, sem esperar o realtime", async () => {
    const mesclado = [CERVEJA, PORCAO, CAIPIRINHA];
    comRpc({ data: { items: mesclado, total: 80, houve_mescla: true }, error: null });
    const app = montar();
    await comComandaAberta(app);

    await act(async () => {
      await app.current.updatePending("c1", { items: [CERVEJA, PORCAO], total: 40 }, { baseItems: [CERVEJA] });
    });

    // Sem isto, o garçom fecha a conta em R$ 40 e a caipirinha vai de graça.
    expect(comandaNaTela(app).items).toEqual(mesclado);
    expect(comandaNaTela(app).total).toBe(80);
  });

  it("mudança que não é de itens (mesa, apelido) segue no update comum", async () => {
    const app = montar();
    await comComandaAberta(app);

    await act(async () => {
      await app.current.updatePending("c1", { mesa: "7", apelido: "Janela" });
    });

    expect(argsRpc("gravar_itens_comanda")).toEqual([]);
    expect(naTabela("pending", "update")[0].args[0]).toMatchObject({ mesa: "7", apelido: "Janela" });
  });

  it("sem snapshot do chamador, não há o que mesclar — grava como sempre foi", async () => {
    const app = montar();
    await comComandaAberta(app);

    await act(async () => {
      await app.current.updatePending("c1", { items: [CERVEJA], total: 10 });
    });

    expect(argsRpc("gravar_itens_comanda")).toEqual([]);
    expect(naTabela("pending", "update")).toHaveLength(1);
  });

  it("itens junto com outro campo saem do caminho atômico — a função só sabe gravar itens e total", async () => {
    const app = montar();
    await comComandaAberta(app);
    itensNoBanco = [CERVEJA];

    await act(async () => {
      await app.current.updatePending(
        "c1",
        { items: [CERVEJA, PORCAO], total: 40, status: "closed" },
        { baseItems: [CERVEJA] },
      );
    });

    expect(argsRpc("gravar_itens_comanda")).toEqual([]);
    // Cai no caminho antigo inteiro: lê, mescla e grava, com o campo extra.
    expect(naTabela("pending", "select")).toHaveLength(1);
    expect(naTabela("pending", "update")[0].args[0]).toMatchObject({ status: "closed" });
  });

  it("enquanto a migration não roda, grava pelo caminho antigo — na mesma chamada, sem perder o lançamento", async () => {
    comRpc(SEM_MIGRATION);
    // O Palm lançou a caipirinha; o caminho antigo tem de recuperá-la.
    itensNoBanco = [CERVEJA, CAIPIRINHA];
    const app = montar();
    await comComandaAberta(app);

    let retorno;
    await act(async () => {
      retorno = await app.current.updatePending("c1", { items: [CERVEJA, PORCAO], total: 40 }, { baseItems: [CERVEJA] });
    });

    expect(retorno).toEqual({ error: null });
    expect(naTabela("pending", "update")[0].args[0].items).toEqual([CERVEJA, PORCAO, CAIPIRINHA]);
    expect(comandaNaTela(app).items).toEqual([CERVEJA, PORCAO, CAIPIRINHA]);
  });

  it("uma vez que o banco disse que a função não existe, a sessão inteira usa o caminho antigo", async () => {
    comRpc(SEM_MIGRATION);
    const app = montar();
    await comComandaAberta(app);

    for (const _ of [1, 2, 3]) {
      await act(async () => {
        await app.current.updatePending("c1", { items: [CERVEJA], total: 10 }, { baseItems: [CERVEJA] });
      });
    }

    // Insistir custaria uma ida à rede perdida em cada lançamento do turno.
    expect(argsRpc("gravar_itens_comanda")).toHaveLength(1);
    expect(naTabela("pending", "update")).toHaveLength(3);
  });

  it("sem internet, o lançamento não some: vai para a fila local", async () => {
    comRpc(SEM_REDE);
    const app = montar();
    await comComandaAberta(app);
    // Sem internet o reenvio automático também falha — é o que mantém a op
    // na fila. Se a escrita de reenvio "desse certo", o provider drenaria a
    // fila no mesmo instante e o teste não veria nada lá dentro.
    resultadoEscrita = SEM_REDE;

    let retorno;
    await act(async () => {
      retorno = await app.current.updatePending("c1", { items: [CERVEJA, PORCAO], total: 40 }, { baseItems: [CERVEJA] });
    });

    expect(retorno).toMatchObject({ error: null, offline: true });
    expect(filaGravada().at(-1)).toMatchObject({ tipo: "update", id: "c1" });
    // A tela segue mostrando o que o garçom lançou.
    expect(comandaNaTela(app).items).toEqual([CERVEJA, PORCAO]);
  });

  it("erro definitivo desfaz o otimismo — a tela não pode mostrar item que o banco recusou", async () => {
    comRpc(RLS_NEGOU);
    const app = montar();
    await comComandaAberta(app);

    let retorno;
    await act(async () => {
      retorno = await app.current.updatePending("c1", { items: [CERVEJA, PORCAO], total: 40 }, { baseItems: [CERVEJA] });
    });

    expect(retorno.error).toMatchObject({ code: "42501" });
    expect(comandaNaTela(app).items).toEqual([CERVEJA]);
    expect(comandaNaTela(app).total).toBe(10);
  });

  it("item sem uid ganha um antes de ir para o banco — é por ele que a mescla reconhece o que é de quem", async () => {
    const app = montar();
    await comComandaAberta(app);

    await act(async () => {
      await app.current.updatePending(
        "c1",
        { items: [CERVEJA, { name: "Água", price: 5, qty: 1 }], total: 15 },
        { baseItems: [CERVEJA] },
      );
    });

    const [{ p_items }] = argsRpc("gravar_itens_comanda");
    expect(typeof p_items[1].uid).toBe("string");
    expect(p_items[1].uid.length).toBeGreaterThan(0);
  });
});
