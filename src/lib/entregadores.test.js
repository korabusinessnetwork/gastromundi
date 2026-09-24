import { describe, it, expect, vi } from "vitest";

// entregadores.js importa o client Supabase (exige VITE_* no import).
// Mockamos o client para não exigir env — só exercitamos as PURAS aqui.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  nomeEntregadorValido,
  sanitizarValorEntrega,
  sanitizarEntregador,
  entregadoresAtivos,
  valorPadraoParaPedido,
  filtrarPedidosPorPeriodo,
  calcularFechamento,
  idsAPagarDoEntregador,
} from "./entregadores";

describe("nomeEntregadorValido", () => {
  it("aceita nome com 2+ caracteres não-espaço", () => {
    expect(nomeEntregadorValido("Jo")).toBe(true);
    expect(nomeEntregadorValido("  João  ")).toBe(true);
  });
  it("rejeita vazio, curto ou não-string", () => {
    expect(nomeEntregadorValido("")).toBe(false);
    expect(nomeEntregadorValido(" a ")).toBe(false);
    expect(nomeEntregadorValido(null)).toBe(false);
    expect(nomeEntregadorValido(42)).toBe(false);
  });
});

describe("sanitizarValorEntrega", () => {
  it("normaliza número positivo", () => {
    expect(sanitizarValorEntrega(12.5)).toBe(12.5);
  });
  it("aceita string com vírgula ou ponto", () => {
    expect(sanitizarValorEntrega("12,50")).toBe(12.5);
    expect(sanitizarValorEntrega("8.75")).toBe(8.75);
  });
  it("vira 0 para inválido, negativo ou zero", () => {
    expect(sanitizarValorEntrega(-5)).toBe(0);
    expect(sanitizarValorEntrega(0)).toBe(0);
    expect(sanitizarValorEntrega("abc")).toBe(0);
    expect(sanitizarValorEntrega(null)).toBe(0);
    expect(sanitizarValorEntrega(undefined)).toBe(0);
  });
});

describe("sanitizarEntregador", () => {
  it("apara textos e normaliza valor", () => {
    expect(sanitizarEntregador({ nome: "  Zé  ", telefone: " 11999 ", valor_por_entrega: "6,00" }))
      .toEqual({ nome: "Zé", telefone: "11999", valor_por_entrega: 6 });
  });
  it("telefone vazio vira null e valor ausente vira 0", () => {
    expect(sanitizarEntregador({ nome: "Ana", telefone: "   " }))
      .toEqual({ nome: "Ana", telefone: null, valor_por_entrega: 0 });
  });
  it("inclui ativo só quando é booleano", () => {
    expect(sanitizarEntregador({ nome: "Ana", ativo: false }).ativo).toBe(false);
    expect("ativo" in sanitizarEntregador({ nome: "Ana" })).toBe(false);
    expect("ativo" in sanitizarEntregador({ nome: "Ana", ativo: "sim" })).toBe(false);
  });
  it("safe com entrada não-objeto", () => {
    expect(sanitizarEntregador(null)).toEqual({ nome: "", telefone: null, valor_por_entrega: 0 });
  });
});

describe("entregadoresAtivos", () => {
  it("filtra desativados e ordena por nome (pt-BR)", () => {
    const lista = [
      { id: "1", nome: "Carlos", ativo: true },
      { id: "2", nome: "Ana", ativo: false },
      { id: "3", nome: "Bruno", ativo: true },
    ];
    expect(entregadoresAtivos(lista).map((e) => e.nome)).toEqual(["Bruno", "Carlos"]);
  });
  it("trata ativo ausente como ativo", () => {
    expect(entregadoresAtivos([{ id: "1", nome: "X" }])).toHaveLength(1);
  });
  it("safe com entrada não-array", () => {
    expect(entregadoresAtivos(null)).toEqual([]);
  });
});

describe("valorPadraoParaPedido", () => {
  it("usa valor_por_entrega do entregador", () => {
    expect(valorPadraoParaPedido({ valor_por_entrega: 7 })).toBe(7);
  });
  it("0 quando ausente ou inválido", () => {
    expect(valorPadraoParaPedido(null)).toBe(0);
    expect(valorPadraoParaPedido({})).toBe(0);
  });
});

describe("filtrarPedidosPorPeriodo", () => {
  const pedidos = [
    { id: "a", created_at: "2026-08-16T08:00:00Z" },
    { id: "b", created_at: "2026-08-16T20:00:00Z" },
    { id: "c", created_at: "2026-08-17T10:00:00Z" },
    { id: "d", created_at: "data-invalida" },
  ];
  it("sem limites devolve todos", () => {
    expect(filtrarPedidosPorPeriodo(pedidos).map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("filtra dentro do intervalo [inicio, fim]", () => {
    const ini = "2026-08-16T00:00:00Z";
    const fim = "2026-08-16T23:59:59Z";
    expect(filtrarPedidosPorPeriodo(pedidos, ini, fim).map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("aceita só limite inferior", () => {
    expect(filtrarPedidosPorPeriodo(pedidos, "2026-08-17T00:00:00Z", null).map((p) => p.id))
      .toEqual(["c"]);
  });
  it("descarta created_at inválido quando há limite", () => {
    expect(filtrarPedidosPorPeriodo(pedidos, "2026-01-01T00:00:00Z", null).map((p) => p.id))
      .toEqual(["a", "b", "c"]);
  });
  it("safe com entrada não-array", () => {
    expect(filtrarPedidosPorPeriodo(null, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("calcularFechamento", () => {
  const entregadores = [
    { id: "e1", nome: "Bruno" },
    { id: "e2", nome: "Ana" },
  ];
  const pedidos = [
    { id: "p1", entregador_id: "e1", status: "entregue", valor_entregador: 6 },
    { id: "p2", entregador_id: "e1", status: "entregue", valor_entregador: 8 },
    { id: "p3", entregador_id: "e1", status: "saiu_entrega", valor_entregador: 6 },
    { id: "p4", entregador_id: "e2", status: "entregue", valor_entregador: 5 },
    { id: "p5", entregador_id: "e2", status: "cancelado", valor_entregador: 5 },
    { id: "p6", entregador_id: null, status: "entregue", valor_entregador: 9 },
  ];

  it("soma pagamento só das entregas confirmadas, por entregador", () => {
    const { linhas } = calcularFechamento(pedidos, entregadores);
    const bruno = linhas.find((l) => l.entregador_id === "e1");
    expect(bruno).toMatchObject({ nome: "Bruno", entregues: 2, emRota: 1, totalPagar: 14 });
    const ana = linhas.find((l) => l.entregador_id === "e2");
    expect(ana).toMatchObject({ nome: "Ana", entregues: 1, emRota: 0, totalPagar: 5 });
  });

  it("ignora pedidos sem entregador atribuído", () => {
    const { linhas } = calcularFechamento(pedidos, entregadores);
    expect(linhas).toHaveLength(2);
  });

  it("não paga por cancelado nem por em rota", () => {
    const { totalGeral } = calcularFechamento(pedidos, entregadores);
    expect(totalGeral).toBe(19); // 14 (Bruno) + 5 (Ana), sem p3/p5/p6
  });

  it("ordena linhas por nome e soma os totais gerais", () => {
    const r = calcularFechamento(pedidos, entregadores);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Ana", "Bruno"]);
    expect(r.totalEntregues).toBe(3);
    expect(r.totalEmRota).toBe(1);
  });

  it("entregador removido (id sem nome na lista) vira rótulo de histórico", () => {
    const { linhas } = calcularFechamento(
      [{ id: "x", entregador_id: "sumiu", status: "entregue", valor_entregador: 4 }],
      entregadores
    );
    expect(linhas[0]).toMatchObject({ nome: "Entregador removido", totalPagar: 4 });
  });

  it("separa a pagar de já pago pelo carimbo entregador_pago_em", () => {
    const comPago = [
      { id: "p1", entregador_id: "e1", status: "entregue", valor_entregador: 6, entregador_pago_em: "2026-08-16T10:00:00Z" },
      { id: "p2", entregador_id: "e1", status: "entregue", valor_entregador: 8 }, // a pagar
    ];
    const r = calcularFechamento(comPago, entregadores);
    const bruno = r.linhas.find((l) => l.entregador_id === "e1");
    expect(bruno).toMatchObject({ totalPagar: 14, aPagar: 8, jaPago: 6 });
    expect(r.totalAPagar).toBe(8);
    expect(r.totalJaPago).toBe(6);
    expect(r.totalGeral).toBe(14);
  });

  it("safe com entradas vazias", () => {
    expect(calcularFechamento(null, null)).toEqual({
      linhas: [],
      totalGeral: 0,
      totalAPagar: 0,
      totalJaPago: 0,
      totalEntregues: 0,
      totalEmRota: 0,
    });
  });
});

describe("idsAPagarDoEntregador", () => {
  const pedidos = [
    { id: "p1", entregador_id: "e1", status: "entregue", valor_entregador: 6 },
    { id: "p2", entregador_id: "e1", status: "entregue", valor_entregador: 8, entregador_pago_em: "2026-08-16T10:00:00Z" }, // já pago
    { id: "p3", entregador_id: "e1", status: "saiu_entrega", valor_entregador: 6 }, // em rota
    { id: "p4", entregador_id: "e2", status: "entregue", valor_entregador: 5 },     // outro entregador
    { id: "p5", entregador_id: "e1", status: "cancelado", valor_entregador: 6 },    // cancelado
  ];

  it("retorna só as entregas confirmadas e não pagas do entregador", () => {
    expect(idsAPagarDoEntregador(pedidos, "e1")).toEqual(["p1"]);
  });

  it("retorna vazio sem entregador ou sem pedidos", () => {
    expect(idsAPagarDoEntregador(pedidos, null)).toEqual([]);
    expect(idsAPagarDoEntregador(null, "e1")).toEqual([]);
  });

  it("compara id como string (número vs string não vaza corrida de outro)", () => {
    const mistos = [{ id: 10, entregador_id: 1, status: "entregue", valor_entregador: 5 }];
    expect(idsAPagarDoEntregador(mistos, "1")).toEqual(["10"]);
  });
});
