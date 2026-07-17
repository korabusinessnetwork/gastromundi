// Testes da fila de pedidos da Ponte KORA (Leva 13).
import { describe, it, expect } from "vitest";
import {
  validarPedido,
  adicionarPedido,
  pedidosPendentes,
  confirmarPedidos,
  podarConfirmados,
  RETENCAO_CONFIRMADO_MS,
  MAX_ITENS,
} from "./pedidos.js";

const itemValido = (extra = {}) => ({ name: "X-Salada", qty: 2, price: 18.5, ...extra });

const corpoValido = (extra = {}) => ({
  id: "palm-abc12345",
  comanda: "12",
  mesa: "5",
  garcom: "Ana",
  items: [itemValido()],
  ...extra,
});

describe("validarPedido", () => {
  it("aceita pedido válido e normaliza os campos", () => {
    const r = validarPedido(corpoValido({ note: "sem cebola" }));
    expect(r.ok).toBe(true);
    expect(r.pedido.comanda).toBe("12");
    expect(r.pedido.mesa).toBe("5");
    expect(r.pedido.garcom).toBe("Ana");
    expect(r.pedido.note).toBe("sem cebola");
    expect(r.pedido.items).toHaveLength(1);
    expect(r.pedido.items[0]).toMatchObject({ name: "X-Salada", qty: 2, price: 18.5, produzivel: true });
  });

  it("rejeita corpo que não é objeto", () => {
    expect(validarPedido(null).ok).toBe(false);
    expect(validarPedido([]).ok).toBe(false);
    expect(validarPedido("oi").ok).toBe(false);
  });

  it("exige comanda", () => {
    const r = validarPedido(corpoValido({ comanda: "  " }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/comanda/i);
  });

  it("exige ao menos um item", () => {
    expect(validarPedido(corpoValido({ items: [] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: undefined })).ok).toBe(false);
  });

  it("limita a quantidade de itens", () => {
    const items = Array.from({ length: MAX_ITENS + 1 }, () => itemValido());
    const r = validarPedido(corpoValido({ items }));
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(String(MAX_ITENS));
  });

  it("rejeita item sem nome", () => {
    const r = validarPedido(corpoValido({ items: [itemValido({ name: "  " })] }));
    expect(r.ok).toBe(false);
  });

  it("rejeita quantidade fora dos limites", () => {
    expect(validarPedido(corpoValido({ items: [itemValido({ qty: 0 })] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: [itemValido({ qty: -1 })] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: [itemValido({ qty: 1000 })] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: [itemValido({ qty: "abc" })] })).ok).toBe(false);
  });

  it("rejeita preço inválido", () => {
    expect(validarPedido(corpoValido({ items: [itemValido({ price: -1 })] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: [itemValido({ price: Infinity })] })).ok).toBe(false);
    expect(validarPedido(corpoValido({ items: [itemValido({ price: "x" })] })).ok).toBe(false);
  });

  it("recalcula o total no servidor — nunca confia no total do cliente", () => {
    const r = validarPedido(corpoValido({
      total: 0.01,
      items: [itemValido({ qty: 3, price: 10 }), itemValido({ name: "Suco", qty: 1, price: 7.9 })],
    }));
    expect(r.ok).toBe(true);
    expect(r.pedido.total).toBe(37.9);
  });

  it("arredonda dinheiro em 2 casas", () => {
    const r = validarPedido(corpoValido({ items: [itemValido({ qty: 3, price: 0.1 })] }));
    expect(r.pedido.items[0].price).toBe(0.1);
    expect(r.pedido.total).toBe(0.3);
  });

  it("arredonda quantidade fracionada para inteiro", () => {
    const r = validarPedido(corpoValido({ items: [itemValido({ qty: 2.4 })] }));
    expect(r.pedido.items[0].qty).toBe(2);
  });

  it("remove < e > dos textos (defesa contra HTML injetado)", () => {
    const r = validarPedido(corpoValido({
      comanda: "<b>7</b>",
      note: "<script>alert(1)</script>",
      items: [itemValido({ name: "<img src=x>Pastel" })],
    }));
    expect(r.ok).toBe(true);
    expect(r.pedido.comanda).toBe("b7/b");
    expect(r.pedido.note).toBe("scriptalert(1)/script");
    expect(r.pedido.items[0].name).toBe("img src=xPastel");
  });

  it("id do cliente: aceita string ≥ 8 chars, corta em 64, senão null", () => {
    expect(validarPedido(corpoValido({ id: "palm-abc12345" })).pedido.id).toBe("palm-abc12345");
    expect(validarPedido(corpoValido({ id: "curto" })).pedido.id).toBe(null);
    expect(validarPedido(corpoValido({ id: 12345678 })).pedido.id).toBe(null);
    expect(validarPedido(corpoValido({ id: "a".repeat(100) })).pedido.id).toHaveLength(64);
  });

  it("preserva produzivel === false (item que não vai para a impressora)", () => {
    const r = validarPedido(corpoValido({ items: [itemValido({ produzivel: false })] }));
    expect(r.pedido.items[0].produzivel).toBe(false);
  });
});

describe("adicionarPedido", () => {
  const pedido = () => validarPedido(corpoValido()).pedido;

  it("acrescenta registro pendente e devolve nova fila (imutável)", () => {
    const fila = [];
    const r = adicionarPedido(fila, pedido(), { agora: "2026-07-17T10:00:00.000Z" });
    expect(r.duplicado).toBe(false);
    expect(r.fila).toHaveLength(1);
    expect(fila).toHaveLength(0);
    expect(r.registro.confirmado).toBe(false);
    expect(r.registro.recebidoEm).toBe("2026-07-17T10:00:00.000Z");
    expect(r.registro.pedido.id).toBe(r.registro.id);
  });

  it("deduplica pelo id — reenvio do Palm não duplica pedido", () => {
    const r1 = adicionarPedido([], pedido());
    const r2 = adicionarPedido(r1.fila, pedido());
    expect(r2.duplicado).toBe(true);
    expect(r2.fila).toHaveLength(1);
    expect(r2.registro.id).toBe(r1.registro.id);
  });

  it("gera id quando o pedido veio sem (gerarId injetável)", () => {
    const semId = { ...pedido(), id: null };
    const r = adicionarPedido([], semId, { gerarId: () => "uuid-gerado" });
    expect(r.registro.id).toBe("uuid-gerado");
    expect(r.registro.pedido.id).toBe("uuid-gerado");
  });
});

describe("pedidosPendentes / confirmarPedidos", () => {
  it("pendentes filtra confirmados; confirmação é idempotente e ignora ids desconhecidos", () => {
    const p = validarPedido(corpoValido()).pedido;
    let { fila } = adicionarPedido([], p);
    const id = fila[0].id;
    expect(pedidosPendentes(fila)).toHaveLength(1);

    const c1 = confirmarPedidos(fila, [id, "inexistente"], { agora: "2026-07-17T11:00:00.000Z" });
    expect(c1.confirmados).toBe(1);
    expect(pedidosPendentes(c1.fila)).toHaveLength(0);
    expect(c1.fila[0].confirmadoEm).toBe("2026-07-17T11:00:00.000Z");

    const c2 = confirmarPedidos(c1.fila, [id]);
    expect(c2.confirmados).toBe(0);
  });

  it("tolera fila/ids não-array", () => {
    expect(pedidosPendentes(null)).toEqual([]);
    expect(confirmarPedidos(null, null).confirmados).toBe(0);
  });
});

describe("podarConfirmados", () => {
  const agoraMs = Date.parse("2026-07-17T12:00:00.000Z");
  const registro = (extra) => ({ id: "r1", recebidoEm: "2026-07-17T00:00:00.000Z", confirmado: false, confirmadoEm: null, pedido: {}, ...extra });

  it("nunca poda pendentes, mesmo antigos", () => {
    const fila = [registro({ recebidoEm: "2020-01-01T00:00:00.000Z" })];
    expect(podarConfirmados(fila, { agoraMs })).toHaveLength(1);
  });

  it("mantém confirmado recente e poda confirmado velho", () => {
    const recente = registro({ id: "a", confirmado: true, confirmadoEm: new Date(agoraMs - 1000).toISOString() });
    const velho = registro({ id: "b", confirmado: true, confirmadoEm: new Date(agoraMs - RETENCAO_CONFIRMADO_MS - 1000).toISOString() });
    const r = podarConfirmados([recente, velho], { agoraMs });
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("poda confirmado com data ilegível (não deixa lixo acumular)", () => {
    const fila = [registro({ confirmado: true, confirmadoEm: "data-quebrada", recebidoEm: null })];
    expect(podarConfirmados(fila, { agoraMs })).toHaveLength(0);
  });
});
