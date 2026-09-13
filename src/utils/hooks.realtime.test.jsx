// @vitest-environment jsdom
//
// D07 — os canais de realtime chamavam `.subscribe()` sem callback de status.
//
// O supabase-js entrega SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT e CLOSED nesse
// callback, e ninguém lia: canal recusado pela RLS, token expirado ou servidor
// reiniciando morria sem log, sem aviso e sem sinal na tela. A aba do PDV fica
// aberta 24 horas, então o websocket cai por motivo banal (troca de Wi-Fi,
// máquina dormindo, deploy), e a tela seguia mostrando o dado da última vez que
// funcionou: a cozinha parava de receber pedido e ninguém percebia.
//
// Aqui provamos as duas metades do conserto: estado ruim dispara nova carga, e
// a volta do canal dispara outra (o que aconteceu durante a queda não é
// reenviado pelo servidor).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// O mock compartilhado (src/test/mockSupabase.js) engole o callback de status,
// porque até agora nenhum código passava um. Este arquivo o embrulha para
// guardar os callbacks e poder emitir status como o servidor emitiria.
const mockSupabase = vi.hoisted(() => ({ atual: null }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  const base = createMockSupabase();
  const statusPorCanal = {};
  const channelOriginal = base.channel;
  base.channel = (nome) => {
    const ch = channelOriginal(nome);
    const subscribeOriginal = ch.subscribe;
    ch.subscribe = (cb) => {
      if (typeof cb === "function") (statusPorCanal[nome] ??= []).push(cb);
      return subscribeOriginal();
    };
    return ch;
  };
  /** Emite um status de assinatura. Devolve quantos callbacks receberam. */
  base.emitStatus = (nome, status, err) => {
    const cbs = statusPorCanal[nome] ?? [];
    for (const cb of cbs) cb(status, err);
    return cbs.length;
  };
  base.limparStatus = () => {
    for (const k of Object.keys(statusPorCanal)) delete statusPorCanal[k];
  };
  mockSupabase.atual = base;
  return { supabase: base };
});

const listarPedidosDelivery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/deliveryPedidos", () => ({ listarPedidosDelivery }));

import {
  tratarStatusCanal,
  STATUS_CANAL_RUIM,
  usePedidosDelivery,
  usePedidosCozinha,
  useMesas,
} from "./hooks";

const supa = () => mockSupabase.atual;

const PEDIDO = { id: "p1", numero: 1, status: "recebido" };

function TelaDelivery() {
  const { pedidos, aoVivo, recarregar } = usePedidosDelivery();
  return (
    <div>
      <span data-testid="ao-vivo">{aoVivo ? "ao vivo" : "parado"}</span>
      <span data-testid="qtd">{pedidos.length}</span>
      <button onClick={recarregar}>Atualizar</button>
    </div>
  );
}

function TelaCozinha() {
  const { aoVivo } = usePedidosCozinha();
  return <span data-testid="ao-vivo">{aoVivo ? "ao vivo" : "parado"}</span>;
}

function TelaMesas() {
  const { aoVivo } = useMesas();
  return <span data-testid="ao-vivo">{aoVivo ? "ao vivo" : "parado"}</span>;
}

const aoVivo = () => screen.getByTestId("ao-vivo").textContent;

async function montar(Tela) {
  await act(async () => { render(<Tela />); });
}

const emitir = async (canal, status) => {
  await act(async () => {
    const ouvintes = supa().emitStatus(canal, status);
    expect(ouvintes).toBeGreaterThan(0);
  });
  await act(async () => { await Promise.resolve(); });
};

let avisos;

beforeEach(() => {
  supa().reset();
  supa().limparStatus();
  listarPedidosDelivery.mockReset();
  listarPedidosDelivery.mockResolvedValue({ data: [PEDIDO], error: null });
  // O registro da queda é console.warn (diagnóstico técnico, não dado
  // sensível). Silenciado aqui, mas inspecionado nos testes.
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  avisos.mockRestore();
});

describe("tratarStatusCanal (D07)", () => {
  it("estado ruim recarrega, registra e marca a tela como parada", () => {
    const recarregar = vi.fn();
    const setAoVivo = vi.fn();
    const tratar = tratarStatusCanal("canal-x", { recarregar, setAoVivo });

    tratar("CHANNEL_ERROR", new Error("recusado"));

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(setAoVivo).toHaveBeenLastCalledWith(false);
    expect(avisos).toHaveBeenCalled();
    expect(String(avisos.mock.calls[0][0])).toContain("canal-x");
  });

  it("todos os estados ruins do supabase-js contam", () => {
    for (const status of STATUS_CANAL_RUIM) {
      const recarregar = vi.fn();
      tratarStatusCanal("canal-x", { recarregar })(status);
      expect(recarregar).toHaveBeenCalledTimes(1);
    }
  });

  it("tentativa repetida de reconexão não vira enxurrada de consultas", () => {
    const recarregar = vi.fn();
    const tratar = tratarStatusCanal("canal-x", { recarregar });

    tratar("CHANNEL_ERROR");
    tratar("CHANNEL_ERROR");
    tratar("TIMED_OUT");

    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("quando o canal volta, recarrega outra vez: a queda não é reenviada", () => {
    const recarregar = vi.fn();
    const setAoVivo = vi.fn();
    const tratar = tratarStatusCanal("canal-x", { recarregar, setAoVivo });

    tratar("SUBSCRIBED");
    expect(recarregar).not.toHaveBeenCalled(); // a carga do mount já aconteceu

    tratar("TIMED_OUT");
    tratar("SUBSCRIBED");

    expect(recarregar).toHaveBeenCalledTimes(2);
    expect(setAoVivo).toHaveBeenLastCalledWith(true);
  });

  it("CLOSED depois de desmontar não dispara carga nenhuma", () => {
    // `removeChannel` na limpeza do efeito também emite CLOSED.
    const recarregar = vi.fn();
    let vivo = true;
    const tratar = tratarStatusCanal("canal-x", { recarregar, estaVivo: () => vivo });

    vivo = false;
    tratar("CLOSED");

    expect(recarregar).not.toHaveBeenCalled();
  });
});

describe("usePedidosDelivery lê o status dos dois canais (D07)", () => {
  it("canal de status caído recarrega a lista e acende o aviso", async () => {
    await montar(TelaDelivery);
    expect(aoVivo()).toBe("ao vivo");
    listarPedidosDelivery.mockClear();

    await emitir("delivery-pedidos-realtime", "CHANNEL_ERROR");

    expect(listarPedidosDelivery).toHaveBeenCalledTimes(1);
    expect(aoVivo()).toBe("parado");
  });

  it("canal do espelho em pending caído também recarrega", async () => {
    await montar(TelaDelivery);
    listarPedidosDelivery.mockClear();

    await emitir("delivery-pending-espelho", "TIMED_OUT");

    expect(listarPedidosDelivery).toHaveBeenCalledTimes(1);
    expect(aoVivo()).toBe("parado");
  });

  it("quando o canal volta, a lista é buscada de novo e o aviso apaga", async () => {
    await montar(TelaDelivery);
    await emitir("delivery-pedidos-realtime", "CHANNEL_ERROR");
    listarPedidosDelivery.mockClear();

    await emitir("delivery-pedidos-realtime", "SUBSCRIBED");

    expect(listarPedidosDelivery).toHaveBeenCalledTimes(1);
    expect(aoVivo()).toBe("ao vivo");
  });
});

describe("usePedidosCozinha lê o status do canal (D07)", () => {
  it("canal caído recarrega o painel da cozinha", async () => {
    supa().setTableResult("pending", {
      data: [{ id: "c1", comanda: "Mesa 1", items: [{ name: "X" }] }],
      error: null,
    });
    await montar(TelaCozinha);
    const antes = supa().calls.filter((c) => c.table === "pending" && c.method === "select").length;

    await emitir("cozinha-pedidos-realtime", "CHANNEL_ERROR");

    const depois = supa().calls.filter((c) => c.table === "pending" && c.method === "select").length;
    expect(depois).toBe(antes + 1);
    expect(aoVivo()).toBe("parado");
  });
});

describe("useMesas lê o status do canal (D07)", () => {
  it("canal caído recarrega o mapa do salão", async () => {
    supa().setTableResult("mesas", { data: [{ numero: "1" }], error: null });
    await montar(TelaMesas);
    const antes = supa().calls.filter((c) => c.table === "mesas" && c.method === "select").length;

    await emitir("mesas-realtime", "CHANNEL_ERROR");

    const depois = supa().calls.filter((c) => c.table === "mesas" && c.method === "select").length;
    expect(depois).toBe(antes + 1);
    expect(aoVivo()).toBe("parado");
  });
});
