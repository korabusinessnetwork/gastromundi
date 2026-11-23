// @vitest-environment jsdom
//
// Tarefa 2.9 do plano de refatoração, antes de qualquer estado mudar de lugar:
// a fila offline de ponta a ponta.
//
// Os outros testes do contexto cobrem cada peça (a venda que vai para a fila,
// a chave de idempotência da baixa, a hidratação do contador). Este cobre o
// caminho inteiro do jeito que ele acontece no salão: a internet cai, o caixa
// fecha uma comanda (venda, baixa de estoque, comanda removida), a internet
// volta, e a fila precisa gravar CADA coisa EXATAMENTE uma vez e zerar as
// pendências. Depois, uma segunda volta da rede não pode gravar nada de novo.
//
// O banco é um falso em memória que se comporta como o real nos pontos que
// importam aqui: venda com id único (repetir dá 23505) e baixa de estoque
// idempotente pela chave da operação.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

const banco = vi.hoisted(() => ({
  online: true,
  vendas: new Map(),
  vendaItens: [],
  vendaPagamentos: [],
  comandasApagadas: [],
  saldo: new Map(),
  opsAplicadas: new Set(),
  escritasNegadasPorRede: 0,
  // A próxima baixa chega ao banco e É aplicada, mas a resposta se perde.
  perderRespostaDaProximaBaixa: false,
}));

const mockSupabase = vi.hoisted(() => {
  const ERRO_DE_REDE = { message: "TypeError: Failed to fetch" };
  const resposta = (fn) => {
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
      builder[m] = () => builder;
    }
    builder.then = (ok, falha) => Promise.resolve()
      .then(() => {
        if (!banco.online) { banco.escritasNegadasPorRede += 1; return { data: null, error: ERRO_DE_REDE }; }
        return fn();
      })
      .then(ok, falha);
    return builder;
  };
  return {
    from: (tabela) => ({
      select: () => resposta(() => ({ data: [], error: null })),
      insert: (linhas) => resposta(() => {
        const lista = Array.isArray(linhas) ? linhas : [linhas];
        if (tabela === "vendas") {
          for (const v of lista) {
            if (banco.vendas.has(v.id)) return { data: null, error: { code: "23505", message: "duplicate key" } };
            banco.vendas.set(v.id, v);
          }
        }
        if (tabela === "venda_itens") banco.vendaItens.push(...lista);
        if (tabela === "venda_pagamentos") banco.vendaPagamentos.push(...lista);
        return { data: null, error: null };
      }),
      upsert: () => resposta(() => ({ data: null, error: null })),
      update: () => resposta(() => ({ data: [], error: null })),
      delete: () => {
        const b = resposta(() => {
          if (tabela === "pending") banco.comandasApagadas.push(b.__id);
          return { data: null, error: null };
        });
        const eqOriginal = b.eq;
        b.eq = (coluna, valor) => { b.__id = valor; return eqOriginal(coluna, valor); };
        return b;
      },
    }),
    rpc: (nome, args) => {
      const b = { then: (ok, falha) => Promise.resolve().then(() => {
        if (!banco.online) { banco.escritasNegadasPorRede += 1; return { data: null, error: ERRO_DE_REDE }; }
        if (nome === "baixar_estoque") {
          if (!banco.opsAplicadas.has(args.p_op_id)) {
            banco.opsAplicadas.add(args.p_op_id);
            banco.saldo.set(args.p_produto_id, (banco.saldo.get(args.p_produto_id) ?? 0) - args.p_qtd);
          }
          if (banco.perderRespostaDaProximaBaixa) {
            banco.perderRespostaDaProximaBaixa = false;
            banco.online = false;
            return { data: null, error: ERRO_DE_REDE };
          }
          return { data: [{ quantidade: banco.saldo.get(args.p_produto_id), minimo: 0 }], error: null };
        }
        return { data: null, error: null };
      }).then(ok, falha) };
      return b;
    },
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: null, error: { message: "nao usado" } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  };
});

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

import { reportarFalha } from "@/lib/observabilidade";
import { filaOffline } from "@/lib/offline/filaApp";
import { AppProvider, useApp } from "./AppContext";

const VENDA = {
  id: "venda-offline-1",
  comanda: "12",
  total: 28.5,
  items: [{ id: 1, name: "Café expresso", price: 6, qty: 2 }, { id: 4, name: "Pão de queijo", price: 5.5, qty: 3 }],
  payments: [{ method: "dinheiro", value: 28.5 }],
};

let onLineOriginal;

/** Liga ou desliga a rede: o navegador avisa e o banco falso passa a recusar ou aceitar. */
async function rede(ligada) {
  banco.online = ligada;
  await act(async () => {
    window.dispatchEvent(new Event(ligada ? "online" : "offline"));
  });
  // A drenagem roda em efeito, com várias idas ao banco em sequência.
  for (let i = 0; i < 5; i++) await act(async () => {});
}

function montar() {
  const app = { current: null };
  function Sonda() {
    app.current = useApp();
    return null;
  }
  render(<AppProvider><Sonda /></AppProvider>);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  filaOffline.limpar();
  Object.assign(banco, {
    online: true, vendas: new Map(), vendaItens: [], vendaPagamentos: [], comandasApagadas: [],
    saldo: new Map([[1, 50], [4, 40]]), opsAplicadas: new Set(), escritasNegadasPorRede: 0,
    perderRespostaDaProximaBaixa: false,
  });
  onLineOriginal = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => banco.online });
});

afterEach(() => {
  if (onLineOriginal) Object.defineProperty(window.navigator, "onLine", onLineOriginal);
  else delete window.navigator.onLine;
});

describe("fila offline de ponta a ponta (tarefa 2.9)", () => {
  it("fechar a comanda sem internet grava tudo uma vez só quando a rede volta", async () => {
    const app = montar();
    await act(async () => {});

    // 1. A internet cai e o caixa fecha a comanda 12.
    await rede(false);
    await act(async () => {
      await app.current.addSale(VENDA);
      await app.current.baixarEstoque(1, 2);
      await app.current.baixarEstoque(4, 3);
      await app.current.removePending("comanda-12");
    });

    // Nada chegou ao banco, tudo ficou na fila, e a tela segue mostrando a venda.
    expect(banco.vendas.size).toBe(0);
    expect(banco.opsAplicadas.size).toBe(0);
    expect(banco.comandasApagadas).toEqual([]);
    expect(banco.escritasNegadasPorRede).toBeGreaterThan(0);
    expect(app.current.sales.map((v) => v.id)).toContain(VENDA.id);
    expect(app.current.pendenciasOffline).toBe(4);

    // 2. A internet volta: a fila drena sozinha.
    await rede(true);

    expect([...banco.vendas.keys()]).toEqual([VENDA.id]);
    expect(banco.vendaItens).toHaveLength(2);
    expect(banco.opsAplicadas.size).toBe(2);
    expect(banco.saldo.get(1)).toBe(48);
    expect(banco.saldo.get(4)).toBe(37);
    expect(banco.comandasApagadas).toEqual(["comanda-12"]);
    expect(app.current.pendenciasOffline).toBe(0);
    expect(filaOffline.tamanho()).toBe(0);
    // Caminho previsto, não inconsistência: nada na trilha de falhas.
    expect(reportarFalha).not.toHaveBeenCalled();

    // 3. A rede pisca de novo: nada é gravado uma segunda vez.
    await rede(false);
    await rede(true);

    expect(banco.vendas.size).toBe(1);
    expect(banco.vendaItens).toHaveLength(2);
    expect(banco.saldo.get(1)).toBe(48);
    expect(banco.saldo.get(4)).toBe(37);
    expect(banco.comandasApagadas).toEqual(["comanda-12"]);
  });

  it("a baixa que chegou ao banco mas perdeu a resposta não desconta duas vezes", async () => {
    const app = montar();
    await act(async () => {});

    // A baixa sai com a rede de pé, o banco aplica, e a conexão cai antes da
    // resposta voltar. Para o caixa foi falha de rede: a operação vai para a fila.
    banco.perderRespostaDaProximaBaixa = true;
    await act(async () => { await app.current.baixarEstoque(1, 2); });
    expect(banco.saldo.get(1)).toBe(48);
    expect(app.current.pendenciasOffline).toBe(1);

    // Na volta da rede, a fila reenvia com a MESMA chave: o banco reconhece.
    await rede(false);
    await rede(true);

    expect(banco.saldo.get(1)).toBe(48);
    expect(app.current.pendenciasOffline).toBe(0);
  });

  it("a venda que gravou mas perdeu a resposta não é duplicada no reenvio", async () => {
    const app = montar();
    await act(async () => {});

    // O cabeçalho chegou ao banco antes da queda, mas o caixa não soube:
    // na fila, a mesma venda é reenviada e o banco responde 23505.
    banco.vendas.set(VENDA.id, { id: VENDA.id });
    await rede(false);
    await act(async () => { await app.current.addSale(VENDA); });
    expect(app.current.pendenciasOffline).toBe(1);

    await rede(true);

    expect(banco.vendas.size).toBe(1);
    // Filhas não são reinseridas quando o cabeçalho já existia.
    expect(banco.vendaItens).toHaveLength(0);
    expect(app.current.pendenciasOffline).toBe(0);
  });
});
