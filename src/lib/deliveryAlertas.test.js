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

// O filtro era `status === 'recebido'`. Passou a ser "status de CHEGADA"
// (recebido ou em_preparo) quando o aceite automático nasceu (20261012):
// com a chave ligada o pedido nunca passa por 'recebido', e a regra antiga
// silenciava justamente a cozinha que ligou a chave para não ficar olhando
// a tela. Quem impede o alerta repetido é o id conhecido, não o status —
// sempre foi.
describe("detectarNovosPedidos", () => {
  const pedidos = [
    { id: "a", status: "recebido" },
    { id: "b", status: "em_preparo" },
    { id: "c", status: "recebido" },
  ];

  it("devolve os inéditos que acabaram de chegar", () => {
    const novos = detectarNovosPedidos(new Set(["a"]), pedidos);
    expect(novos.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("ignora pedidos já conhecidos", () => {
    expect(detectarNovosPedidos(new Set(["a", "b", "c"]), pedidos)).toEqual([]);
  });

  it("pedido inédito em rota ou entregue não alerta", () => {
    const novos = detectarNovosPedidos(new Set(), [
      ...pedidos,
      { id: "d", status: "saiu_entrega" },
      { id: "e", status: "entregue" },
    ]);
    expect(novos.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("aceita Array de ids além de Set", () => {
    const novos = detectarNovosPedidos(["a", "b"], pedidos);
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

// ══════════════════════════════════════════════════════════════════
// O aviso sonoro × o aceite automático (20261012).
//
// Com a chave ligada o pedido NASCE 'em_preparo' e nunca passa por
// 'recebido'. O filtro antigo era `status === 'recebido'`, então ligar o
// aceite automático silenciava a cozinha — exatamente de quem ligou a
// chave para NÃO precisar ficar olhando a tela.
// ══════════════════════════════════════════════════════════════════
describe("detectarNovosPedidos com aceite automático", () => {
  it("pedido que nasce em_preparo também é pedido novo", () => {
    const novos = detectarNovosPedidos(new Set(), [
      { id: "a", status: "em_preparo" },
    ]);
    expect(novos.map((p) => p.id)).toEqual(["a"]);
  });

  it("id já conhecido não alerta de novo ao mudar de status", () => {
    // O operador viu como 'recebido' e alguém apertou aceitar: é o MESMO
    // pedido andando, não um pedido chegando.
    const novos = detectarNovosPedidos(new Set(["a"]), [
      { id: "a", status: "em_preparo" },
    ]);
    expect(novos).toEqual([]);
  });

  it("pedido em rota ou entregue não alerta, mesmo inédito", () => {
    // Abrir o painel no meio do dia não pode disparar o som do dia inteiro.
    const novos = detectarNovosPedidos(new Set(), [
      { id: "b", status: "saiu_entrega" },
      { id: "c", status: "entregue" },
      { id: "d", status: "cancelado" },
    ]);
    expect(novos).toEqual([]);
  });

  it("os dois estados de chegada convivem na mesma lista", () => {
    const novos = detectarNovosPedidos(new Set(["velho"]), [
      { id: "velho", status: "recebido" },
      { id: "n1", status: "recebido" },
      { id: "n2", status: "em_preparo" },
      { id: "n3", status: "entregue" },
    ]);
    expect(novos.map((p) => p.id)).toEqual(["n1", "n2"]);
  });
});
