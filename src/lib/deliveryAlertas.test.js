import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// deliveryAlertas importa formatarReais de ./deliveryPedidos, que por sua vez
// importa o client Supabase (exige VITE_* no import). Mockamos o client para
// não exigir env — só exercitamos as puras e as guardadas de navegador.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  detectarNovosPedidos,
  montarTextoNotificacao,
  notificacoesSuportadas,
  permissaoNotificacao,
  pedirPermissaoNotificacao,
  tocarBipPedido,
  dispararNotificacaoPedido,
  alertarPedidosNovos,
} from "./deliveryAlertas";

// toLocaleString("pt-BR", currency) usa espaço não-quebrável (U+00A0);
// normalizamos para comparar com espaço comum.
const norm = (s) => s.replace(/\s/g, " ");

// ── Puras ───────────────────────────────────────────────────────────

describe("detectarNovosPedidos", () => {
  const pedidos = [
    { id: "a", status: "recebido" },
    { id: "b", status: "em_preparo" },
    { id: "c", status: "recebido" },
  ];

  it("devolve só os inéditos com status 'recebido'", () => {
    const novos = detectarNovosPedidos(new Set(["a"]), pedidos);
    expect(novos.map((p) => p.id)).toEqual(["c"]);
  });

  it("ignora pedidos já conhecidos mesmo que 'recebido'", () => {
    expect(detectarNovosPedidos(new Set(["a", "c"]), pedidos)).toEqual([]);
  });

  it("não alerta pedido inédito que já não está mais em 'recebido'", () => {
    const novos = detectarNovosPedidos(new Set(), pedidos);
    expect(novos.map((p) => p.id)).toEqual(["a", "c"]); // 'b' fica de fora
  });

  it("aceita Array de ids além de Set", () => {
    const novos = detectarNovosPedidos(["a"], pedidos);
    expect(novos.map((p) => p.id)).toEqual(["c"]);
  });

  it("trata id numérico vs string (compara por String)", () => {
    const lista = [{ id: 1, status: "recebido" }];
    expect(detectarNovosPedidos(["1"], lista)).toEqual([]);
    expect(detectarNovosPedidos([], lista).map((p) => p.id)).toEqual([1]);
  });

  it("assume 'recebido' quando status vem ausente", () => {
    const lista = [{ id: "x" }];
    expect(detectarNovosPedidos([], lista).map((p) => p.id)).toEqual(["x"]);
  });

  it("é seguro com entradas nulas/estranhas", () => {
    expect(detectarNovosPedidos(null, null)).toEqual([]);
    expect(detectarNovosPedidos(undefined, undefined)).toEqual([]);
    expect(detectarNovosPedidos(new Set(), [null, undefined])).toEqual([]);
  });
});

describe("montarTextoNotificacao", () => {
  it("monta título com número e corpo com cliente + total + bairro", () => {
    const { titulo, corpo } = montarTextoNotificacao({
      numero: 42,
      cliente_nome: "Ana",
      total: 55.9,
      bairro: "Centro",
    });
    expect(titulo).toBe("Novo pedido • 42");
    expect(norm(corpo)).toBe("Ana · R$ 55,90 · Centro");
  });

  it("omite bairro quando ausente", () => {
    const { corpo } = montarTextoNotificacao({ numero: 1, cliente_nome: "Bia", total: 10 });
    expect(norm(corpo)).toBe("Bia · R$ 10,00");
  });

  it("cai em título genérico sem número", () => {
    const { titulo } = montarTextoNotificacao({ cliente_nome: "Cida", total: 5 });
    expect(titulo).toBe("Novo pedido de delivery");
  });

  it("é seguro sem pedido", () => {
    expect(montarTextoNotificacao(null)).toEqual({
      titulo: "Novo pedido de delivery",
      corpo: "",
    });
  });
});

// ── Guardadas: sem APIs de navegador (ambiente node) ─────────────────

describe("guardadas sem APIs de navegador (node)", () => {
  it("notificacoesSuportadas() é false sem window/Notification", () => {
    expect(notificacoesSuportadas()).toBe(false);
  });

  it("permissaoNotificacao() → 'indisponivel'", () => {
    expect(permissaoNotificacao()).toBe("indisponivel");
  });

  it("pedirPermissaoNotificacao() resolve 'indisponivel' e não lança", async () => {
    await expect(pedirPermissaoNotificacao()).resolves.toBe("indisponivel");
  });

  it("tocarBipPedido() é no-op → false sem AudioContext", () => {
    expect(tocarBipPedido()).toBe(false);
  });

  it("dispararNotificacaoPedido() → false sem permissão", () => {
    expect(dispararNotificacaoPedido({ id: "a", numero: 1, total: 1 })).toBe(false);
  });

  it("alertarPedidosNovos() nunca lança (lista vazia ou não)", () => {
    expect(() => alertarPedidosNovos([])).not.toThrow();
    expect(() => alertarPedidosNovos(null)).not.toThrow();
    expect(() => alertarPedidosNovos([{ id: "a", numero: 1, total: 1 }])).not.toThrow();
  });
});

// ── Guardadas: COM Notification stub (permissão concedida) ────────────

describe("com Notification stub no window", () => {
  let criadas;

  beforeEach(() => {
    criadas = [];
    class FakeNotification {
      constructor(titulo, opts) {
        criadas.push({ titulo, opts });
      }
      static permission = "granted";
      static requestPermission = vi.fn().mockResolvedValue("granted");
    }
    vi.stubGlobal("window", { Notification: FakeNotification });
    globalThis.window = globalThis.window || {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("notificacoesSuportadas() vira true e permissão 'granted'", () => {
    expect(notificacoesSuportadas()).toBe(true);
    expect(permissaoNotificacao()).toBe("granted");
  });

  it("dispararNotificacaoPedido() cria a Notification com título/corpo", () => {
    const ok = dispararNotificacaoPedido({ id: "a", numero: 7, cliente_nome: "Ana", total: 12 });
    expect(ok).toBe(true);
    expect(criadas).toHaveLength(1);
    expect(criadas[0].titulo).toBe("Novo pedido • 7");
    expect(criadas[0].opts.tag).toBe("delivery-a");
  });

  it("alertarPedidosNovos() com 1 pedido dispara 1 notificação", () => {
    alertarPedidosNovos([{ id: "a", numero: 1, total: 1 }], { som: false });
    expect(criadas).toHaveLength(1);
    expect(criadas[0].titulo).toBe("Novo pedido • 1");
  });

  it("alertarPedidosNovos() com vários dispara um aviso-resumo", () => {
    alertarPedidosNovos(
      [
        { id: "a", numero: 1, total: 1 },
        { id: "b", numero: 2, total: 2 },
      ],
      { som: false }
    );
    expect(criadas).toHaveLength(1);
    expect(criadas[0].titulo).toBe("2 novos pedidos de delivery");
    expect(criadas[0].opts.tag).toBe("delivery-lote");
  });

  it("alertarPedidosNovos({ notificar:false }) não cria notificação", () => {
    alertarPedidosNovos([{ id: "a", numero: 1, total: 1 }], { som: false, notificar: false });
    expect(criadas).toHaveLength(0);
  });
});
