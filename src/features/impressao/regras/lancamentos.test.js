import { describe, it, expect } from "vitest";
import {
  chaveLancamento,
  lancamentosDoPedido,
  criarRegistroLancamentos,
} from "./lancamentos";

const item = (nome, launchedAt) => ({ name: nome, price: 10, qty: 1, launched_at: launchedAt });

describe("chaveLancamento", () => {
  it("junta comanda e instante do lançamento", () => {
    expect(chaveLancamento("c1", "2026-07-29T12:00:00.000Z")).toBe("c1|2026-07-29T12:00:00.000Z");
  });

  it("devolve null sem comanda ou sem carimbo", () => {
    expect(chaveLancamento(null, "2026-07-29T12:00:00.000Z")).toBeNull();
    expect(chaveLancamento("c1", null)).toBeNull();
    expect(chaveLancamento("c1", undefined)).toBeNull();
  });
});

describe("lancamentosDoPedido", () => {
  it("separa dois lançamentos feitos na mesma comanda", () => {
    const pedido = {
      id: "c1",
      items: [
        item("Coca", "2026-07-29T12:00:00.000Z"),
        item("Água", "2026-07-29T12:00:00.000Z"),
        item("Picanha", "2026-07-29T12:30:00.000Z"),
      ],
    };
    const grupos = lancamentosDoPedido(pedido);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].itens.map((i) => i.name)).toEqual(["Coca", "Água"]);
    expect(grupos[1].itens.map((i) => i.name)).toEqual(["Picanha"]);
  });

  it("ignora item sem launched_at (comanda antiga ou fechada direto no caixa)", () => {
    const pedido = {
      id: "c1",
      items: [{ name: "Antigo", price: 5, qty: 1 }, item("Novo", "2026-07-29T12:00:00.000Z")],
    };
    const grupos = lancamentosDoPedido(pedido);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens.map((i) => i.name)).toEqual(["Novo"]);
  });

  it("não quebra com pedido sem itens ou sem id", () => {
    expect(lancamentosDoPedido(null)).toEqual([]);
    expect(lancamentosDoPedido({ id: "c1" })).toEqual([]);
    expect(lancamentosDoPedido({ items: [item("X", "2026-07-29T12:00:00.000Z")] })).toEqual([]);
  });
});

describe("criarRegistroLancamentos", () => {
  const pedido = {
    id: "c1",
    items: [item("Coca", "2026-07-29T12:00:00.000Z")],
  };

  it("aponta lançamento novo e para de apontar depois de marcado", () => {
    const registro = criarRegistroLancamentos();
    expect(registro.novos([pedido])).toHaveLength(1);
    registro.marcar(chaveLancamento("c1", "2026-07-29T12:00:00.000Z"));
    expect(registro.novos([pedido])).toHaveLength(0);
  });

  it("marcarPedidos zera tudo que já estava na tela (semente da abertura)", () => {
    const registro = criarRegistroLancamentos();
    registro.marcarPedidos([pedido]);
    expect(registro.novos([pedido])).toHaveLength(0);
  });

  it("acha só o lançamento novo quando a comanda recebe mais itens", () => {
    const registro = criarRegistroLancamentos();
    registro.marcarPedidos([pedido]);
    const depois = {
      id: "c1",
      items: [...pedido.items, item("Picanha", "2026-07-29T12:30:00.000Z")],
    };
    const novos = registro.novos([depois]);
    expect(novos).toHaveLength(1);
    expect(novos[0].itens.map((i) => i.name)).toEqual(["Picanha"]);
    expect(novos[0].pedido.id).toBe("c1");
  });

  it("devolve os lançamentos do mais antigo para o mais novo", () => {
    const registro = criarRegistroLancamentos();
    const novos = registro.novos([
      { id: "c2", items: [item("Tarde", "2026-07-29T13:00:00.000Z")] },
      { id: "c1", items: [item("Cedo", "2026-07-29T12:00:00.000Z")] },
    ]);
    expect(novos.map((n) => n.itens[0].name)).toEqual(["Cedo", "Tarde"]);
  });

  it("registros diferentes não compartilham memória", () => {
    const a = criarRegistroLancamentos();
    const b = criarRegistroLancamentos();
    a.marcarPedidos([pedido]);
    expect(a.novos([pedido])).toHaveLength(0);
    expect(b.novos([pedido])).toHaveLength(1);
  });

  it("aguenta lista vazia ou indefinida", () => {
    const registro = criarRegistroLancamentos();
    expect(registro.novos(undefined)).toEqual([]);
    expect(registro.novos([])).toEqual([]);
    expect(() => registro.marcarPedidos(undefined)).not.toThrow();
  });
});
