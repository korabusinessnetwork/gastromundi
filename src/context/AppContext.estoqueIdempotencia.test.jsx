// @vitest-environment jsdom
//
// Leva D da auditoria — chave de idempotência na baixa de estoque.
//
// `baixar_estoque` é um UPDATE relativo (`quantidade - p_qtd`): rodar duas
// vezes desconta duas vezes. Fechando venda sem internet, a RPC vai para a
// fila local e é reenviada quando a conexão volta — e existe uma janela real
// em que a primeira tentativa GRAVOU no banco mas a resposta se perdeu na
// queda. Nesse caso o reenvio descontava de novo e o estoque sumia sem venda
// correspondente (dívida anotada desde a auditoria P3/P4).
//
// A correção é uma chave: cada baixa nasce com um `op_id` gerado no app, que
// vai na RPC, é guardado junto da op na fila e é REPETIDO no reenvio. O lado
// do banco está na migration 20260830_idempotencia_baixa_estoque.sql; o que
// estes testes prendem é o contrato do lado JavaScript — sem o mesmo id
// chegando duas vezes, a migration não tem como reconhecer nada.
//
// Monta o AppProvider de verdade (não um mock do contexto) porque o defeito
// mora na costura entre a baixa, a fila e o dreno.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { CHAVE_FILA_PENDING } from "@/lib/offline/fila";

const mockSupabase = vi.hoisted(() => {
  // Callbacks de realtime por nome de canal — é o que permite ao teste simular
  // a chegada de um evento do Postgres (leva 11).
  const canais = {};
  return {
    canais,
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn((nome) => {
      const ch = {
        on: vi.fn((...args) => {
          const cb = args[args.length - 1];
          if (typeof cb === "function") (canais[nome] ??= []).push(cb);
          return ch;
        }),
        subscribe: vi.fn(() => ch),
      };
      return ch;
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com o defeito. `registrarInsight`
// e `buscarInsights` entram porque a baixa de estoque gera alerta de mínimo
// pelo Jarvas (src/lib/estoque.js).
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

import { emitirEvento, registrarInsight } from "@/lib/jarvas";
import { reportarFalha } from "@/lib/observabilidade";
import { AppProvider, useApp, aplicarNumeroRemoto } from "./AppContext";

/** Expõe o contexto para o teste sem depender de nenhuma tela. */
function capturarApp(alvo) {
  return function Sonda() {
    alvo.current = useApp();
    return null;
  };
}

/** Tudo que foi direto para tabela (não RPC), na ordem. */
let chamadasTabela = [];

/**
 * Erros de uma única vez, por `tabela:metodo`. Só a próxima chamada daquele par
 * falha — assim o bootstrap do provider (que lê as mesmas tabelas) não engole o
 * erro que o teste preparou para a escrita.
 */
let falhasUmaVez = {};
const comFalhaNaTabela = (tabela, metodo, error) => { falhasUmaVez[`${tabela}:${metodo}`] = { data: null, error }; };

/** Qualquer leitura/escrita de tabela resolve vazia — não é o alvo aqui. */
function comTabelasVazias() {
  mockSupabase.from.mockImplementation((tabela) => {
    const builder = { metodo: null };
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (ok, falha) => {
      const chave = `${tabela}:${builder.metodo}`;
      const falha1 = falhasUmaVez[chave];
      if (falha1) delete falhasUmaVez[chave];
      return Promise.resolve(falha1 ?? { data: [], error: null }).then(ok, falha);
    };
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) {
      api[m] = vi.fn((...args) => {
        chamadasTabela.push({ tabela, metodo: m, args });
        builder.metodo = m;
        return builder;
      });
    }
    return api;
  });
}

/** Payloads dos upserts feitos numa tabela — usado para provar que a entrada
 *  NÃO grava mais saldo absoluto quando a RPC atômica existe. */
const upsertsEm = (tabela) =>
  chamadasTabela.filter((c) => c.tabela === tabela && c.metodo === "upsert").map((c) => c.args[0]);

const RPC_OK   = { data: [{ quantidade: 8, minimo: 5 }], error: null };
const SEM_REDE = { data: null, error: { message: "TypeError: Failed to fetch" } };

const comRpc = (resultado) => mockSupabase.rpc.mockImplementation(() => Promise.resolve(resultado));

/** Resultado diferente por nome de função; o resto responde `padrao`. */
const comRpcPorNome = (mapa, padrao = RPC_OK) =>
  mockSupabase.rpc.mockImplementation((nome) => Promise.resolve(mapa[nome] ?? padrao));

/** Argumentos de cada chamada a uma RPC específica, na ordem. */
const argsRpc = (nome) =>
  mockSupabase.rpc.mock.calls.filter(([fn]) => fn === nome).map(([, args]) => args);

const filaGravada = () => JSON.parse(window.localStorage.getItem(CHAVE_FILA_PENDING) ?? "[]");
const semearFila = (ops) => window.localStorage.setItem(CHAVE_FILA_PENDING, JSON.stringify(ops));

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

/** Dá ao provider as voltas de microtask que o dreno da fila precisa. */
const assentar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/**
 * Simula a chegada de um evento do Postgres no canal do estoque, como se outro
 * aparelho tivesse mexido no saldo. Falha o teste se ninguém assinou o canal.
 */
const chegaDoRealtime = async (payload) => {
  const handlers = mockSupabase.canais["estoque-realtime"] ?? [];
  expect(handlers.length, "ninguém assinou o canal estoque-realtime").toBeGreaterThan(0);
  await act(async () => { for (const cb of handlers) cb(payload); });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  chamadasTabela = [];
  falhasUmaVez = {};
  for (const nome of Object.keys(mockSupabase.canais)) delete mockSupabase.canais[nome];
  comTabelasVazias();
  comRpc(RPC_OK);
});

describe("AppContext — idempotência da baixa de estoque (Leva D)", () => {
  it("toda baixa de produto carrega uma chave de idempotência para o servidor", async () => {
    comRpc(RPC_OK);
    const app = montar();

    await act(async () => { await app.current.baixarEstoque(1, 2); });

    const [args] = argsRpc("baixar_estoque");
    expect(args).toMatchObject({ p_produto_id: 1, p_qtd: 2 });
    expect(typeof args.p_op_id).toBe("string");
    expect(args.p_op_id.length).toBeGreaterThan(0);
  });

  it("sem internet, a op guardada leva EXATAMENTE a chave que já tinha sido enviada", async () => {
    comRpc(SEM_REDE);
    const app = montar();

    let retorno;
    await act(async () => { retorno = await app.current.baixarEstoque(1, 2); });
    expect(retorno).toMatchObject({ error: null, offline: true });

    // A chave da tentativa que falhou é a mesma que ficou na fila: é isso que
    // permite ao banco reconhecer a baixa se ela tiver gravado antes da queda.
    const chaveEnviada = argsRpc("baixar_estoque")[0].p_op_id;
    expect(chaveEnviada).toBeTruthy();
    expect(filaGravada()[0]).toMatchObject({
      tipo: "rpc_baixar_estoque", produtoId: 1, qtd: 2, opId: chaveEnviada,
    });
  });

  it("duas baixas offline do mesmo produto ganham chaves diferentes (uma não anula a outra)", async () => {
    comRpc(SEM_REDE);
    const app = montar();

    await act(async () => { await app.current.baixarEstoque(1, 2); });
    await act(async () => { await app.current.baixarEstoque(1, 2); });

    const [primeira, segunda] = filaGravada().filter((op) => op.tipo === "rpc_baixar_estoque");
    expect(primeira.opId).toBeTruthy();
    expect(segunda.opId).not.toBe(primeira.opId);
  });

  it("no reenvio, a fila devolve a MESMA chave ao servidor — o reenvio não desconta de novo", async () => {
    semearFila([{
      uid: "op-1", tipo: "rpc_baixar_estoque", produtoId: 7, qtd: 3, opId: "chave-da-baixa-original",
    }]);
    comRpc(RPC_OK);
    montar();

    await assentar();

    expect(argsRpc("baixar_estoque")).toContainEqual({
      p_produto_id: 7, p_qtd: 3, p_op_id: "chave-da-baixa-original",
    });
    expect(filaGravada()).toHaveLength(0); // reenviada com sucesso, sai da fila
  });

  it("subproduto: a chave enviada é a mesma que fica na fila e a mesma que volta no reenvio", async () => {
    comRpc(SEM_REDE);
    const app = montar();

    await act(async () => { await app.current.baixarEstoqueSubproduto("sub-1", 2, "Molho da casa"); });

    const chaveEnviada = argsRpc("baixar_estoque_subproduto")[0].p_op_id;
    expect(chaveEnviada).toBeTruthy();
    expect(filaGravada()[0]).toMatchObject({
      tipo: "rpc_baixar_estoque_subproduto", subprodutoId: "sub-1", qtd: 2, opId: chaveEnviada,
    });

    // A op fica na fila (o dreno também falha sem rede). Com a conexão de
    // volta, o reenvio precisa repetir a chave.
    mockSupabase.rpc.mockClear();
    comRpc(RPC_OK);
    const outraSessao = montar();
    expect(outraSessao).toBeTruthy();
    await assentar();

    expect(argsRpc("baixar_estoque_subproduto")).toContainEqual({
      p_subproduto_id: "sub-1", p_qtd: 2, p_op_id: chaveEnviada,
    });
  });

  it("op guardada ANTES desta versão (sem chave) continua sendo reenviada", async () => {
    // Compatibilidade do deploy: quem estava offline no momento da atualização
    // tem ops sem `opId` no aparelho. Elas não podem travar a fila — vão sem
    // chave e se comportam como antes (descontam sempre), que é o único
    // comportamento possível para uma baixa que nunca teve identidade.
    semearFila([
      { uid: "velha-1", tipo: "rpc_baixar_estoque", produtoId: 7, qtd: 3 },
      { uid: "velha-2", tipo: "rpc_baixar_estoque_subproduto", subprodutoId: "sub-9", qtd: 1 },
    ]);
    comRpc(RPC_OK);
    montar();

    await assentar();

    expect(argsRpc("baixar_estoque")).toContainEqual({ p_produto_id: 7, p_qtd: 3, p_op_id: null });
    expect(argsRpc("baixar_estoque_subproduto")).toContainEqual({ p_subproduto_id: "sub-9", p_qtd: 1, p_op_id: null });
    expect(filaGravada()).toHaveLength(0);
  });
});

// ── Run 4, leva 4 — entrada de mercadoria ────────────────────────────────
//
// A entrada de estoque era um read-modify-write feito no navegador: a tela lia
// o saldo que ELA tinha em memória, somava e gravava o TOTAL absoluto por
// upsert. Duas pessoas conferindo a mesma nota ao mesmo tempo (o jeito normal
// de receber carga) perdiam mercadoria: saldo 40, uma lança 5 e grava 45, a
// outra — que ainda via 40 na tela — lança 3 e grava 43. Os 5 da primeira
// somem sem nenhum erro aparecer.
//
// Agora quem soma é o banco (`quantidade + p_delta`, migration
// 20260901_entrada_estoque_atomica.sql) e a tela manda só o quanto entrou.
// Trocar absoluto por delta cria o risco de somar duas vezes num reenvio, daí
// a mesma chave de idempotência da baixa.
const ENTRADA_OK = { data: [{ quantidade: 45, minimo: 5 }], error: null };

const erroRpc = (error) => ({ data: null, error });

describe("AppContext — entrada de estoque atômica (Run 4, leva 4)", () => {
  it("manda o QUANTO ENTROU para o servidor, nunca o saldo total", async () => {
    comRpcPorNome({ entrada_estoque: ENTRADA_OK });
    const app = montar();

    await act(async () => { await app.current.entradaEstoque(1, 5); });

    const [args] = argsRpc("entrada_estoque");
    expect(args).toMatchObject({ p_produto_id: 1, p_delta: 5 });
    expect(typeof args.p_op_id).toBe("string");
    expect(args.p_op_id.length).toBeGreaterThan(0);
    // Nenhuma gravação de saldo absoluto: era exatamente esse upsert que fazia
    // um aparelho apagar a entrada do outro.
    expect(upsertsEm("estoque")).toHaveLength(0);
  });

  it("adota o saldo que o banco devolveu, não o que a tela somou", async () => {
    // Outro aparelho lançou no meio: o banco devolve 48, e é esse o saldo que
    // vale — a tela sozinha calcularia 45.
    comRpcPorNome({ entrada_estoque: { data: [{ quantidade: 48, minimo: 5 }], error: null } });
    const app = montar();

    await act(async () => { await app.current.entradaEstoque(1, 5); });

    expect(app.current.estoque[1]).toBe(48);
    expect(app.current.estoqueMinimos[1]).toBe(5);
  });

  it("cada entrada carrega uma chave própria (duas conferências não se anulam)", async () => {
    comRpcPorNome({ entrada_estoque: ENTRADA_OK });
    const app = montar();

    await act(async () => { await app.current.entradaEstoque(1, 5); });
    await act(async () => { await app.current.entradaEstoque(1, 5); });

    const [primeira, segunda] = argsRpc("entrada_estoque");
    expect(primeira.p_op_id).toBeTruthy();
    expect(segunda.p_op_id).not.toBe(primeira.p_op_id);
  });

  it("recusa quantidade inválida antes de encostar no banco", async () => {
    comRpcPorNome({ entrada_estoque: ENTRADA_OK });
    const app = montar();

    for (const valor of [0, -3, NaN, Infinity, null, undefined, "abc"]) {
      let retorno;
      await act(async () => { retorno = await app.current.entradaEstoque(1, valor); });
      expect(retorno.error, `entrada de ${String(valor)} deveria ser recusada`).toBeTruthy();
    }
    expect(argsRpc("entrada_estoque")).toHaveLength(0);
    expect(upsertsEm("estoque")).toHaveLength(0);
  });

  it("banco ainda sem a função: usa o caminho antigo em vez de travar o recebimento", async () => {
    // O app é publicado antes de a migration rodar. Se a entrada simplesmente
    // falhasse nessa janela, ninguém conseguiria receber mercadoria.
    comRpcPorNome({
      entrada_estoque: erroRpc({
        code: "PGRST202",
        message: "Could not find the function public.entrada_estoque(p_delta, p_op_id, p_produto_id) in the schema cache",
      }),
    });
    const app = montar();

    let retorno;
    await act(async () => { retorno = await app.current.entradaEstoque(1, 5); });

    expect(retorno).toEqual({ error: null });
    expect(upsertsEm("estoque")).toContainEqual(
      expect.objectContaining({ produto_id: 1, quantidade: 5 }),
    );
  });

  it("entrada recusada pelo servidor não deixa saldo inventado na tela", async () => {
    comRpcPorNome({
      entrada_estoque: erroRpc({ code: "P0001", message: "Sem permissão para dar entrada em estoque." }),
    });
    const app = montar();

    let retorno;
    await act(async () => { retorno = await app.current.entradaEstoque(1, 5); });

    expect(retorno.error).toBeTruthy();
    // O produto não tinha linha de estoque: volta a NÃO ter, em vez de ficar
    // valendo 0 e virar "ruptura" na tela e no Jarvas.
    expect(app.current.estoque).not.toHaveProperty("1");
    expect(reportarFalha).toHaveBeenCalled();
    const rastro = emitirEvento.mock.calls.find(([nome]) => nome === "estoque.entrada.falhou");
    expect(rastro?.[2]).toMatchObject({ produto_id: 1, quantidade: 5 });
  });
});

// ── Run 4, leva 7 — gravação do saldo absoluto ───────────────────────────
//
// `updateEstoque` é o caminho do ajuste manual e da contagem física: ele grava
// o saldo ABSOLUTO, o que é correto para essas duas operações. O problema era o
// que ele aceitava e o que fazia quando a gravação falhava.
//
//   1. `Math.max(0, undefined)` é NaN. Uma quantidade não numérica virava NaN
//      no estado, a tela passava a mostrar "NaN" como saldo e o banco recusava
//      a linha com um erro que ninguém lia.
//   2. `Number(null)` e `Number("")` são 0 — um valor perdido no caminho
//      zerava o saldo do produto em silêncio, sem ninguém pedir.
//   3. Quando a gravação falhava num produto que ainda NÃO tinha linha de
//      estoque, o desfazer deixava a chave valendo 0. No resto do sistema, um
//      produto sem linha é um produto que não controla estoque
//      (`jarvasEngine.js`), então ele passava a aparecer como ruptura.
describe("AppContext — saldo absoluto do estoque (Run 4, leva 7)", () => {
  it("recusa quantidade não numérica em vez de gravar NaN no saldo", async () => {
    const app = montar();

    for (const valor of [NaN, Infinity, -Infinity, undefined, "abc", {}]) {
      let retorno;
      await act(async () => { retorno = await app.current.updateEstoque(1, valor); });
      expect(retorno.error, `saldo ${String(valor)} deveria ser recusado`).toBeTruthy();
    }
    expect(upsertsEm("estoque")).toHaveLength(0);
    // Nada de "NaN" no saldo da tela.
    expect(app.current.estoque).not.toHaveProperty("1");
  });

  it("valor vazio não zera o saldo — zerar exige o número 0", async () => {
    const app = montar();

    for (const valor of [null, "", "   "]) {
      let retorno;
      await act(async () => { retorno = await app.current.updateEstoque(1, valor); });
      expect(retorno.error, `saldo ${JSON.stringify(valor)} deveria ser recusado`).toBeTruthy();
    }
    expect(upsertsEm("estoque")).toHaveLength(0);

    // O 0 de verdade continua passando: zerar o estoque é operação legítima.
    await act(async () => { await app.current.updateEstoque(1, 0); });
    expect(upsertsEm("estoque")).toContainEqual(expect.objectContaining({ produto_id: 1, quantidade: 0 }));
    expect(app.current.estoque[1]).toBe(0);
  });

  it("gravação que falha em produto sem linha de estoque não deixa saldo 0 fantasma", async () => {
    const app = montar();
    comFalhaNaTabela("estoque", "upsert", { message: "rede caiu" });

    let retorno;
    await act(async () => { retorno = await app.current.updateEstoque(7, 12); });

    expect(retorno.error).toBeTruthy();
    expect(upsertsEm("estoque")).toHaveLength(1);      // a falha veio do banco, não da guarda
    // Sem linha antes, sem linha depois: um 0 aqui viraria "sem estoque" na tela
    // e alerta de ruptura no Jarvas para um produto que não controla estoque.
    expect(app.current.estoque).not.toHaveProperty("7");
  });

  it("gravação que falha em produto com saldo devolve o saldo anterior", async () => {
    const app = montar();
    await act(async () => { await app.current.updateEstoque(7, 40); });
    expect(app.current.estoque[7]).toBe(40);

    comFalhaNaTabela("estoque", "upsert", { message: "rede caiu" });
    await act(async () => { await app.current.updateEstoque(7, 12); });

    expect(app.current.estoque[7]).toBe(40);
    expect(reportarFalha).toHaveBeenCalled();
  });
});

// ── Run 4, leva 11 — o que o realtime do estoque escreve na memória ──────
//
// O canal `estoque-realtime` sincroniza saldo e mínimo entre os aparelhos. Ele
// aplicava `Number(payload.new.minimo)` cru, e `Number` não avisa quando não tem
// número: `Number(null)` é 0 e `Number(undefined)` é NaN.
//
// Consequência: um evento sem a coluna `minimo` ZERAVA o mínimo em todos os
// outros aparelhos e desligava o alerta de estoque baixo sem ninguém tocar em
// nada — o insumo acabava e a tela continuava verde. Um NaN em `quantidade` era
// pior: o saldo aparecia como 0 mas pintado de verde e escrito "OK", porque
// nenhuma comparação com NaN é verdadeira.
describe("aplicarNumeroRemoto", () => {
  it("aceita número e devolve mapa novo", () => {
    expect(aplicarNumeroRemoto({}, 7, 12)).toEqual({ 7: 12 });
    expect(aplicarNumeroRemoto({ 7: 3 }, 7, "12.5")).toEqual({ 7: 12.5 });
    // Zerar é valor legítimo: o insumo acabou.
    expect(aplicarNumeroRemoto({ 7: 3 }, 7, 0)).toEqual({ 7: 0 });
  });

  it("ignora o que não é número e mantém o mapa anterior", () => {
    const antes = { 7: 40 };
    for (const valor of [null, undefined, "", "abc", NaN, Infinity, -Infinity, {}, []]) {
      expect(aplicarNumeroRemoto(antes, 7, valor), `valor ${String(valor)}`).toBe(antes);
    }
  });

  it("valor igual devolve o MESMO mapa (não re-renderiza a tela sem motivo)", () => {
    const antes = { 7: 40 };
    expect(aplicarNumeroRemoto(antes, 7, 40)).toBe(antes);
    expect(aplicarNumeroRemoto(antes, 7, "40")).toBe(antes);
  });
});

describe("AppContext — realtime do estoque (Run 4, leva 11)", () => {
  /** Deixa o produto 7 com saldo 40 e mínimo 5, como estaria em produção. */
  async function comProduto7(app) {
    await act(async () => { await app.current.updateEstoque(7, 40); });
    await act(async () => { await app.current.setMinimoEstoque(7, 5); });
    expect(app.current.estoque[7]).toBe(40);
    expect(app.current.estoqueMinimos[7]).toBe(5);
  }

  it("evento normal de outro aparelho atualiza saldo e mínimo", async () => {
    const app = montar();
    await comProduto7(app);

    await chegaDoRealtime({ eventType: "UPDATE", new: { produto_id: 7, quantidade: 12, minimo: 8 } });

    expect(app.current.estoque[7]).toBe(12);
    expect(app.current.estoqueMinimos[7]).toBe(8);
  });

  it("evento sem o mínimo NÃO zera o mínimo — o alerta de estoque baixo continua de pé", async () => {
    const app = montar();
    await comProduto7(app);

    await chegaDoRealtime({ eventType: "UPDATE", new: { produto_id: 7, quantidade: 12, minimo: null } });

    expect(app.current.estoque[7]).toBe(12);
    expect(app.current.estoqueMinimos[7]).toBe(5); // era 0 antes da correção
  });

  it("evento sem a quantidade não deixa NaN no saldo", async () => {
    const app = montar();
    await comProduto7(app);

    // Payload parcial: chega o mínimo novo, sem a coluna de quantidade.
    await chegaDoRealtime({ eventType: "UPDATE", new: { produto_id: 7, minimo: 8 } });

    expect(app.current.estoque[7]).toBe(40); // era NaN antes da correção
    expect(Number.isNaN(app.current.estoque[7])).toBe(false);
    expect(app.current.estoqueMinimos[7]).toBe(8);
  });

  it("evento sem produto não polui o mapa com uma chave 'undefined'", async () => {
    const app = montar();
    await comProduto7(app);

    await chegaDoRealtime({ eventType: "UPDATE", new: { quantidade: 12, minimo: 8 } });

    expect(app.current.estoque).not.toHaveProperty("undefined");
    expect(app.current.estoqueMinimos).not.toHaveProperty("undefined");
    expect(app.current.estoque[7]).toBe(40);
  });

  it("DELETE tira o produto do controle de estoque nos dois mapas", async () => {
    const app = montar();
    await comProduto7(app);

    await chegaDoRealtime({ eventType: "DELETE", old: { produto_id: 7 } });

    // Sem linha na tabela = produto que não controla estoque. Deixar a chave
    // valendo 0 faria a tela mostrar ruptura de um produto que não controla.
    expect(app.current.estoque).not.toHaveProperty("7");
    expect(app.current.estoqueMinimos).not.toHaveProperty("7");
  });
});

// ── TD012 — a baixa que falha precisa chegar em quem pode agir ───────────
//
// A falha de baixa já era desfeita na tela e reportada ao Sentry, ao
// `jarvas_eventos` e ao `activity_log` — três destinos que só o desenvolvedor
// abre. O gestor abre o painel do Jarvas, e lá não chegava nada: o furo de
// inventário só aparecia na contagem física, semanas depois.
//
// Offline não entra nesta conta. A baixa sem rede vai para a fila e é
// reaplicada com a mesma chave; alertar ali ensinaria o gestor a ignorar o
// alerta, que é o pior resultado possível.
describe("AppContext — alerta de baixa recusada (TD012)", () => {
  const RECUSADA = erroRpc({ code: "42501", message: "new row violates row-level security policy" });

  /** Dá voltas de microtask para o alerta, que é disparado sem await. */
  const deixarOAlertaSair = () =>
    act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

  /** Só os insights de baixa recusada, ignorando mínimo e oversell. */
  const alertasDeBaixa = () =>
    registrarInsight.mock.calls
      .map(([insight]) => insight)
      .filter((i) => String(i?.origem?.chave ?? "").startsWith("estoque:baixa-falhou:"));

  it("baixa recusada pelo banco vira alerta no painel do gestor", async () => {
    comRpcPorNome({ baixar_estoque: RECUSADA });
    const app = montar();

    await act(async () => { await app.current.baixarEstoque(1, 2); });
    await deixarOAlertaSair();

    const [alerta] = alertasDeBaixa();
    expect(alerta).toMatchObject({
      tipo: "alerta",
      severidade: "danger",
      visibilidade: "operacional",
      modulo: "estoque",
      acao: { tipo: "abrir_estoque" },
    });
    expect(alerta.origem.chave).toBe("estoque:baixa-falhou:produto:1");
    // A frase do Postgres serve ao diagnóstico, não à leitura do gestor.
    expect(alerta.titulo).not.toContain("row-level security");
    expect(alerta.descricao).not.toContain("row-level security");
    expect(alerta.origem.dados.erro).toContain("row-level security");
  });

  it("sem internet NÃO alerta — a baixa só entrou na fila para reenvio", async () => {
    comRpc(SEM_REDE);
    const app = montar();

    await act(async () => { await app.current.baixarEstoque(1, 2); });
    await deixarOAlertaSair();

    expect(alertasDeBaixa()).toHaveLength(0);
    expect(filaGravada()).toHaveLength(1);
  });

  it("subproduto recusado alerta com chave própria", async () => {
    comRpcPorNome({ baixar_estoque_subproduto: RECUSADA });
    const app = montar();

    await act(async () => { await app.current.baixarEstoqueSubproduto("sub-1", 2, "Molho da casa"); });
    await deixarOAlertaSair();

    const [alerta] = alertasDeBaixa();
    expect(alerta.origem.chave).toBe("estoque:baixa-falhou:subproduto:sub-1");
    expect(alerta.titulo).toContain("Molho da casa");
    expect(alerta.acao.params).toEqual({ subproduto_ids: ["sub-1"] });
  });

  it("subproduto sem rede também não alerta", async () => {
    comRpc(SEM_REDE);
    const app = montar();

    await act(async () => { await app.current.baixarEstoqueSubproduto("sub-1", 2, "Molho da casa"); });
    await deixarOAlertaSair();

    expect(alertasDeBaixa()).toHaveLength(0);
  });
});
