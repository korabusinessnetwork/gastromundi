import { describe, it, expect } from "vitest";
import { pedidosNoPeriodo, fecharDelivery, FORMAS_DELIVERY } from "./fechamentoDelivery";

const pedido = (over = {}) => ({
  status: "entregue",
  total: 50,
  taxa_entrega: 5,
  forma_pagamento: "dinheiro",
  created_at: "2026-09-10T18:00:00Z",
  ...over,
});

describe("pedidosNoPeriodo", () => {
  it("recorta pelo instante de criação", () => {
    const lista = [
      pedido({ created_at: "2026-09-09T12:00:00Z" }),
      pedido({ created_at: "2026-09-10T12:00:00Z" }),
    ];
    const dentro = pedidosNoPeriodo(
      lista,
      new Date("2026-09-10T00:00:00Z"),
      new Date("2026-09-10T23:59:59Z"),
    );
    expect(dentro).toHaveLength(1);
  });

  it("sem limites devolve tudo", () => {
    expect(pedidosNoPeriodo([pedido(), pedido()], null, null)).toHaveLength(2);
  });

  it("pedido sem data válida fica de fora em vez de virar 1970", () => {
    const lista = [pedido({ created_at: null }), pedido({ created_at: "não é data" })];
    expect(pedidosNoPeriodo(lista, new Date("2020-01-01"), new Date("2030-01-01"))).toEqual([]);
  });

  it("lista inválida não quebra", () => {
    expect(pedidosNoPeriodo(null, null, null)).toEqual([]);
  });
});

describe("fecharDelivery — só entregue vira dinheiro", () => {
  it("pedido em rota não entra no vendido — é promessa, não receita", () => {
    const r = fecharDelivery([
      pedido({ status: "entregue", total: 50 }),
      pedido({ status: "saiu_entrega", total: 90 }),
    ]);
    expect(r.vendido).toBe(50);
    expect(r.emRota).toBe(1);
    expect(r.valorEmRota).toBe(90);
  });

  it("cancelado não entra no vendido e é contado à parte", () => {
    const r = fecharDelivery([
      pedido({ status: "entregue", total: 50 }),
      pedido({ status: "cancelado", total: 999 }),
    ]);
    expect(r.vendido).toBe(50);
    expect(r.cancelados).toBe(1);
    expect(r.entregues).toBe(1);
  });

  it("soma as taxas de entrega só dos entregues", () => {
    const r = fecharDelivery([
      pedido({ status: "entregue", taxa_entrega: 5 }),
      pedido({ status: "cancelado", taxa_entrega: 7 }),
    ]);
    expect(r.taxas).toBe(5);
  });

  it("período sem entrega devolve zeros, não NaN", () => {
    const r = fecharDelivery([]);
    expect(r).toMatchObject({ vendido: 0, ticket: 0, entregues: 0, dinheiroEmMaos: 0 });
    expect(Number.isNaN(r.ticket)).toBe(false);
  });
});

describe("fecharDelivery — por forma de pagamento", () => {
  it("separa dinheiro, pix e cartão", () => {
    const r = fecharDelivery([
      pedido({ forma_pagamento: "dinheiro", total: 50 }),
      pedido({ forma_pagamento: "pix", total: 30 }),
      pedido({ forma_pagamento: "pix", total: 20 }),
      pedido({ forma_pagamento: "cartao", total: 40 }),
    ]);
    const mapa = Object.fromEntries(r.porForma.map((l) => [l.forma, l.total]));
    expect(mapa).toEqual({ dinheiro: 50, pix: 50, cartao: 40 });
  });

  it("forma sem pedido no período não aparece — linha zerada é ruído", () => {
    const r = fecharDelivery([pedido({ forma_pagamento: "pix" })]);
    expect(r.porForma.map((l) => l.forma)).toEqual(["pix"]);
  });

  it("a soma por forma bate com o vendido", () => {
    const r = fecharDelivery([
      pedido({ forma_pagamento: "dinheiro", total: 50 }),
      pedido({ forma_pagamento: "cartao", total: 40 }),
    ]);
    expect(r.porForma.reduce((s, l) => s + l.total, 0)).toBe(r.vendido);
  });

  it("forma desconhecida não some da conta — entra como 'outros'", () => {
    // Dado antigo, ou forma nova que a vitrine passou a aceitar. Sumir da
    // linha faria o total por forma não bater com o vendido, e ninguém
    // descobriria de onde veio a diferença.
    const r = fecharDelivery([
      pedido({ forma_pagamento: "pix", total: 30 }),
      pedido({ forma_pagamento: "vale_refeicao", total: 25 }),
    ]);
    const outros = r.porForma.find((l) => l.forma === "outros");
    expect(outros).toMatchObject({ total: 25, pedidos: 1 });
    expect(r.porForma.reduce((s, l) => s + l.total, 0)).toBe(r.vendido);
  });
});

describe("fecharDelivery — o dinheiro que está com o entregador", () => {
  it("soma só o que foi entregue e pago em dinheiro", () => {
    // É o número que explica a falta no caixa: entrou como venda, mas as
    // notas estão na mão de quem entregou.
    const r = fecharDelivery([
      pedido({ status: "entregue", forma_pagamento: "dinheiro", total: 50 }),
      pedido({ status: "entregue", forma_pagamento: "pix", total: 80 }),
      pedido({ status: "saiu_entrega", forma_pagamento: "dinheiro", total: 70 }),
    ]);
    expect(r.dinheiroEmMaos).toBe(50);
  });

  it("sem venda em dinheiro o número é zero, e a tela pode omitir o aviso", () => {
    const r = fecharDelivery([pedido({ forma_pagamento: "pix" })]);
    expect(r.dinheiroEmMaos).toBe(0);
  });
});

describe("as formas conhecidas são as que a vitrine oferece", () => {
  it("dinheiro, pix e cartão", () => {
    expect(FORMAS_DELIVERY).toEqual(["dinheiro", "pix", "cartao"]);
  });
});
