import { describe, it, expect } from "vitest";
import {
  criarEspera, adicionarEspera, removerEspera,
  totalEspera, qtdItensEspera, resumoEsperas,
} from "./pedidosEmEspera";

const item = (id, price, qty = 1, extra = {}) => ({ id, name: `Item ${id}`, price, qty, ...extra });

describe("criarEspera", () => {
  it("normaliza comanda e mesa (trim + string)", () => {
    const e = criarEspera({ comanda: " 12 ", mesa: " 5 ", items: [item("a", 10)] });
    expect(e.comanda).toBe("12");
    expect(e.mesa).toBe("5");
    expect(e.items).toHaveLength(1);
  });

  it("copia os itens (não compartilha referência com o carrinho)", () => {
    const carrinho = [item("a", 10, 2)];
    const e = criarEspera({ comanda: "1", items: carrinho });
    carrinho[0].qty = 99;
    expect(e.items[0].qty).toBe(2);
  });

  it("aceita mesa e items ausentes", () => {
    const e = criarEspera({ comanda: "7" });
    expect(e.mesa).toBe("");
    expect(e.items).toEqual([]);
  });
});

describe("adicionarEspera", () => {
  it("adiciona comanda nova no fim da fila", () => {
    const fila = adicionarEspera([], criarEspera({ comanda: "1", items: [item("a", 10)] }));
    expect(fila).toHaveLength(1);
    expect(fila[0].comanda).toBe("1");
  });

  it("funde na mesma comanda somando quantidade do mesmo produto", () => {
    let fila = adicionarEspera([], criarEspera({ comanda: "1", items: [item("a", 10, 2)] }));
    fila = adicionarEspera(fila, criarEspera({ comanda: "1", items: [item("a", 10, 3), item("b", 5)] }));
    expect(fila).toHaveLength(1);
    expect(fila[0].items).toHaveLength(2);
    expect(fila[0].items.find(i => i.id === "a").qty).toBe(5);
    expect(fila[0].items.find(i => i.id === "b").qty).toBe(1);
  });

  it("comandas diferentes viram entradas separadas", () => {
    let fila = adicionarEspera([], criarEspera({ comanda: "1", items: [item("a", 10)] }));
    fila = adicionarEspera(fila, criarEspera({ comanda: "2", items: [item("a", 10)] }));
    expect(fila).toHaveLength(2);
  });

  it("mantém a mesa já registrada; preenche se estava vazia", () => {
    let fila = adicionarEspera([], criarEspera({ comanda: "1", mesa: "", items: [] }));
    fila = adicionarEspera(fila, criarEspera({ comanda: "1", mesa: "8", items: [] }));
    expect(fila[0].mesa).toBe("8");
    fila = adicionarEspera(fila, criarEspera({ comanda: "1", mesa: "9", items: [] }));
    expect(fila[0].mesa).toBe("8");
  });

  it("ignora espera sem comanda e lista não-array", () => {
    expect(adicionarEspera([], criarEspera({ comanda: "  " }))).toEqual([]);
    expect(adicionarEspera(null, criarEspera({ comanda: "1" }))).toHaveLength(1);
  });

  it("não muta a fila original", () => {
    const original = [criarEspera({ comanda: "1", items: [item("a", 10)] })];
    adicionarEspera(original, criarEspera({ comanda: "1", items: [item("a", 10)] }));
    expect(original[0].items[0].qty).toBe(1);
  });

  it("P9 — items malformado (não-array) não quebra, entra/funde como lista vazia", () => {
    const espera = criarEspera({ comanda: "1", items: [item("a", 10)] });
    espera.items = "não é array"; // ex.: dado corrompido vindo do localStorage
    expect(() => adicionarEspera([], espera)).not.toThrow();
    const fila = adicionarEspera([], espera);
    expect(fila).toHaveLength(1);
    expect(fila[0].items).toEqual([]);

    const existente = adicionarEspera([], criarEspera({ comanda: "1", items: [item("a", 10)] }));
    expect(() => adicionarEspera(existente, espera)).not.toThrow();
    const fundida = adicionarEspera(existente, espera);
    expect(fundida[0].items).toHaveLength(1); // itens existentes preservados
  });
});

describe("removerEspera", () => {
  it("remove só a comanda pedida", () => {
    const fila = [criarEspera({ comanda: "1" }), criarEspera({ comanda: "2" })];
    const depois = removerEspera(fila, "1");
    expect(depois).toHaveLength(1);
    expect(depois[0].comanda).toBe("2");
  });

  it("tolera lista não-array", () => {
    expect(removerEspera(undefined, "1")).toEqual([]);
  });
});

describe("totais e resumo", () => {
  const fila = [
    criarEspera({ comanda: "1", items: [item("a", 10, 2), item("b", 5)] }),   // 25,00 · 3 un
    criarEspera({ comanda: "2", items: [item("c", 7.5, 2)] }),                // 15,00 · 2 un
  ];

  it("totalEspera soma price × qty (qty ausente conta 1)", () => {
    expect(totalEspera(fila[0])).toBe(25);
    expect(totalEspera({ items: [{ price: 3 }] })).toBe(3);
    expect(totalEspera(null)).toBe(0);
  });

  it("qtdItensEspera soma unidades", () => {
    expect(qtdItensEspera(fila[0])).toBe(3);
    expect(qtdItensEspera(undefined)).toBe(0);
  });

  it("resumoEsperas agrega a fila inteira", () => {
    expect(resumoEsperas(fila)).toEqual({ pedidos: 2, itens: 5, total: 40 });
    expect(resumoEsperas([])).toEqual({ pedidos: 0, itens: 0, total: 0 });
    expect(resumoEsperas(null)).toEqual({ pedidos: 0, itens: 0, total: 0 });
  });
});
