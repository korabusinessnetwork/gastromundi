import { describe, it, expect } from "vitest";
import {
  origemDaVenda,
  separarPorOrigem,
  compararOrigens,
  resumoDelivery,
  agruparPorBairro,
  agruparPorFormaPagamento,
  tempoMedioEntregaMin,
} from "./relatorioDelivery";

describe("origemDaVenda", () => {
  it("só é delivery quando a venda diz que é", () => {
    expect(origemDaVenda({ origem: "delivery" })).toBe("delivery");
    expect(origemDaVenda({ origem: "pdv" })).toBe("pdv");
  });

  it("venda antiga, sem a coluna, conta como frente de caixa", () => {
    // A coluna nasceu na migração 20261002: tudo o que veio antes é balcão.
    expect(origemDaVenda({})).toBe("pdv");
    expect(origemDaVenda({ origem: null })).toBe("pdv");
    expect(origemDaVenda(null)).toBe("pdv");
  });
});

describe("separarPorOrigem", () => {
  it("divide a lista nos dois lados sem perder nem duplicar venda", () => {
    const vendas = [
      { id: "1", total: 10 },
      { id: "2", total: 20, origem: "delivery" },
      { id: "3", total: 30, origem: "pdv" },
    ];
    const { pdv, delivery } = separarPorOrigem(vendas);
    expect(pdv.map((v) => v.id)).toEqual(["1", "3"]);
    expect(delivery.map((v) => v.id)).toEqual(["2"]);
  });

  it("lista vazia ou inválida devolve os dois lados vazios", () => {
    expect(separarPorOrigem([])).toEqual({ pdv: [], delivery: [] });
    expect(separarPorOrigem(null)).toEqual({ pdv: [], delivery: [] });
  });
});

describe("compararOrigens", () => {
  const vendas = [
    { total: 100 },
    { total: 100 },
    { total: 100, origem: "delivery" },
    { total: 300, origem: "delivery" },
  ];

  it("soma, conta e tira o ticket de cada lado", () => {
    const r = compararOrigens(vendas);
    expect(r.pdv).toMatchObject({ total: 200, vendas: 2, ticket: 100 });
    expect(r.delivery).toMatchObject({ total: 400, vendas: 2, ticket: 200 });
    expect(r.total).toBe(600);
    expect(r.vendas).toBe(4);
  });

  it("a participação dos dois lados fecha em 100%", () => {
    const r = compararOrigens(vendas);
    expect(r.pdv.participacao).toBeCloseTo(33.33, 1);
    expect(r.delivery.participacao).toBeCloseTo(66.67, 1);
    expect(r.pdv.participacao + r.delivery.participacao).toBeCloseTo(100, 6);
  });

  it("período sem faturamento não vira NaN% na tela", () => {
    const r = compararOrigens([]);
    expect(r.pdv.participacao).toBe(0);
    expect(r.delivery.participacao).toBe(0);
    expect(r.pdv.ticket).toBe(0);
    expect(r.total).toBe(0);
  });

  it("total nulo ou texto não contamina a soma", () => {
    const r = compararOrigens([{ total: null }, { total: "50" }, { total: undefined, origem: "delivery" }]);
    expect(r.pdv.total).toBe(50);
    expect(r.delivery.total).toBe(0);
  });
});

describe("resumoDelivery", () => {
  const pedidos = [
    { status: "entregue",     total: 50, taxa_entrega: 5 },
    { status: "entregue",     total: 30, taxa_entrega: 5, tipo_entrega: "retirada" },
    { status: "em_preparo",   total: 20, taxa_entrega: 0 },
    { status: "cancelado",    total: 90, taxa_entrega: 9 },
  ];

  it("conta pedidos, entregues, cancelados e em andamento", () => {
    const r = resumoDelivery(pedidos);
    expect(r.pedidos).toBe(4);
    expect(r.entregues).toBe(2);
    expect(r.cancelados).toBe(1);
    expect(r.emAndamento).toBe(1);
    expect(r.retiradas).toBe(1);
  });

  it("pedido cancelado nunca entra no dinheiro", () => {
    const r = resumoDelivery(pedidos);
    expect(r.faturamento).toBe(100);
    expect(r.taxaEntrega).toBe(10);
    // ticket sobre os 3 não cancelados, não sobre os 4
    expect(r.ticket).toBeCloseTo(100 / 3, 6);
  });

  it("sem pedido nenhum devolve zeros, não NaN", () => {
    const r = resumoDelivery([]);
    expect(r).toMatchObject({ pedidos: 0, faturamento: 0, ticket: 0, cancelados: 0 });
    expect(Number.isNaN(r.ticket)).toBe(false);
  });
});

describe("agruparPorBairro", () => {
  it("ordena pelo que mais fatura", () => {
    const linhas = agruparPorBairro([
      { bairro: "Centro", total: 30 },
      { bairro: "Jardim", total: 80 },
      { bairro: "Centro", total: 40 },
    ]);
    expect(linhas.map((l) => l.nome)).toEqual(["Jardim", "Centro"]);
    expect(linhas[1]).toMatchObject({ pedidos: 2, total: 70 });
  });

  it("pedido sem bairro aparece como 'Sem bairro' em vez de sumir", () => {
    const linhas = agruparPorBairro([{ bairro: "", total: 10 }, { total: 5 }]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ nome: "Sem bairro", pedidos: 2, total: 15 });
  });

  it("cancelado fica de fora do agrupamento", () => {
    const linhas = agruparPorBairro([
      { bairro: "Centro", total: 30 },
      { bairro: "Centro", total: 90, status: "cancelado" },
    ]);
    expect(linhas[0]).toMatchObject({ pedidos: 1, total: 30 });
  });

  it("empate no valor mantém ordem estável pelo nome", () => {
    const linhas = agruparPorBairro([{ bairro: "Zulu", total: 10 }, { bairro: "Alfa", total: 10 }]);
    expect(linhas.map((l) => l.nome)).toEqual(["Alfa", "Zulu"]);
  });
});

describe("agruparPorFormaPagamento", () => {
  it("agrupa pela forma e ordena pelo valor", () => {
    const linhas = agruparPorFormaPagamento([
      { forma_pagamento: "pix", total: 100 },
      { forma_pagamento: "dinheiro", total: 20 },
      { forma_pagamento: "pix", total: 50 },
    ]);
    expect(linhas[0]).toMatchObject({ nome: "pix", pedidos: 2, total: 150 });
    expect(linhas[1]).toMatchObject({ nome: "dinheiro", pedidos: 1 });
  });

  it("forma ausente vira 'Não informado'", () => {
    expect(agruparPorFormaPagamento([{ total: 10 }])[0].nome).toBe("Não informado");
  });
});

describe("tempoMedioEntregaMin", () => {
  it("média dos pedidos entregues, em minutos", () => {
    const media = tempoMedioEntregaMin([
      { status: "entregue", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:30:00Z" },
      { status: "entregue", created_at: "2026-09-01T13:00:00Z", updated_at: "2026-09-01T13:50:00Z" },
    ]);
    expect(media).toBe(40);
  });

  it("ignora quem não foi entregue", () => {
    const media = tempoMedioEntregaMin([
      { status: "entregue",   created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:20:00Z" },
      { status: "em_preparo", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T18:00:00Z" },
    ]);
    expect(media).toBe(20);
  });

  it("data faltando ou invertida não entra na média", () => {
    const media = tempoMedioEntregaMin([
      { status: "entregue", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:10:00Z" },
      { status: "entregue", created_at: "2026-09-01T12:00:00Z" },
      { status: "entregue", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T11:00:00Z" },
    ]);
    expect(media).toBe(10);
  });

  it("sem nenhum entregue devolve null (a tela mostra '—', não '0 min')", () => {
    expect(tempoMedioEntregaMin([])).toBeNull();
    expect(tempoMedioEntregaMin([{ status: "recebido" }])).toBeNull();
  });
});
