import { describe, it, expect } from "vitest";
import { calcularBaixasEscolhas, montarItemCombo, montarItemProdutoEscolhas, mesmoItemDeVenda } from "./combos";

describe("calcularBaixasEscolhas", () => {
  const item = (extra = {}) => ({
    id: null,
    qty: 1,
    combo: {
      comboId: "c1",
      escolhas: [
        { produtoId: 10, nome: "X-Salada", qtd: 1 },
        { produtoId: 11, nome: "Coca",     qtd: 2 },
      ],
    },
    ...extra,
  });

  it("baixa cada escolha multiplicando pela qty do item", () => {
    const r = calcularBaixasEscolhas([item({ qty: 3 })]);
    expect(r).toEqual([
      { produtoId: 10, nome: "X-Salada", qtd: 3 },
      { produtoId: 11, nome: "Coca",     qtd: 6 },
    ]);
  });

  it("soma a mesma escolha vinda de combos/itens diferentes", () => {
    const outro = item({ qty: 1 });
    outro.combo = { comboId: "c2", escolhas: [{ produtoId: 10, nome: "X-Salada", qtd: 1 }] };
    const r = calcularBaixasEscolhas([item({ qty: 2 }), outro]);
    expect(r.find((x) => x.produtoId === 10).qtd).toBe(3);
  });

  it("ignora cancelados, itens sem escolhas e escolhas sem produtoId", () => {
    const r = calcularBaixasEscolhas([
      item({ cancelado: true }),
      { id: 5, qty: 2 }, // produto avulso, sem escolhas
      { id: 8, qty: 1, combo: { escolhas: [null, {}, { nome: "sem id" }] } },
    ]);
    expect(r).toEqual([]);
  });

  it("assume qty 1 quando o item não traz quantidade", () => {
    const it_ = item();
    delete it_.qty;
    const r = calcularBaixasEscolhas([it_]);
    expect(r[0].qtd).toBe(1);
  });

  it("lida com lista nula/vazia sem lançar", () => {
    expect(calcularBaixasEscolhas(null)).toEqual([]);
    expect(calcularBaixasEscolhas([null, {}, { combo: {} }, { combo: { escolhas: [] } }])).toEqual([]);
  });
});

describe("montarItemCombo", () => {
  const comboDb = { id: "c1", nome: "Combo X-Burguer", preco_total: 35.5 };
  const escolhas = [
    { produtoId: 7, nome: "X-Burguer", qtd: 1 },
    { produtoId: 10, nome: "Coca", qtd: 1 },
  ];

  it("monta o item de combo com id null, preço fixo e as escolhas", () => {
    const item = montarItemCombo(comboDb, escolhas);
    expect(item.id).toBeNull();
    expect(item.name).toBe("Combo X-Burguer");
    expect(item.price).toBe(35.5);
    expect(item.combo.comboId).toBe("c1");
    expect(item.combo.escolhas).toEqual([
      { produtoId: 7, nome: "X-Burguer", qtd: 1, preco: 0 },
      { produtoId: 10, nome: "Coca", qtd: 1, preco: 0 },
    ]);
  });

  it("soma acréscimos das escolhas ao preço do combo", () => {
    const item = montarItemCombo(comboDb, [{ produtoId: 9, nome: "Premium", qtd: 2, preco: 3 }]);
    expect(item.price).toBe(35.5 + 6);
  });

  it("aceita combo sem escolhas e retorna null sem combo", () => {
    expect(montarItemCombo(comboDb).combo.escolhas).toEqual([]);
    expect(montarItemCombo(null)).toBeNull();
  });
});

describe("montarItemProdutoEscolhas", () => {
  const produto = { id: 20, name: "Refrigerante", price: 5, emoji: "🥤", category: "Bebidas" };

  it("usa o id do produto e soma acréscimos das escolhas ao preço", () => {
    const item = montarItemProdutoEscolhas(produto, [{ produtoId: 30, nome: "Suco", qtd: 1, preco: 2 }]);
    expect(item.id).toBe(20);
    expect(item.name).toBe("Refrigerante");
    expect(item.price).toBe(7);
    expect(item.emoji).toBe("🥤");
    expect(item.category).toBe("Bebidas");
    expect(item.combo.comboId).toBeUndefined();
    expect(item.combo.escolhas).toEqual([{ produtoId: 30, nome: "Suco", qtd: 1, preco: 2 }]);
  });

  it("retorna null sem produto ou sem id", () => {
    expect(montarItemProdutoEscolhas(null)).toBeNull();
    expect(montarItemProdutoEscolhas({ name: "sem id" })).toBeNull();
  });
});

describe("mesmoItemDeVenda", () => {
  it("produto avulso não se mistura com produto de seleção do mesmo id", () => {
    const avulso = { id: 20 };
    const comSelecao = { id: 20, combo: { escolhas: [{ produtoId: 30, qtd: 1 }] } };
    expect(mesmoItemDeVenda(avulso, comSelecao)).toBe(false);
    expect(mesmoItemDeVenda(avulso, { id: 20 })).toBe(true);
  });

  it("empilha combos idênticos e separa combos com escolhas diferentes", () => {
    const a = { id: null, combo: { comboId: "c1", escolhas: [{ produtoId: 7, qtd: 1 }, { produtoId: 10, qtd: 1 }] } };
    const b = { id: null, combo: { comboId: "c1", escolhas: [{ produtoId: 10, qtd: 1 }, { produtoId: 7, qtd: 1 }] } };
    const c = { id: null, combo: { comboId: "c1", escolhas: [{ produtoId: 8, qtd: 1 }, { produtoId: 10, qtd: 1 }] } };
    expect(mesmoItemDeVenda(a, b)).toBe(true); // mesma composição, ordem diferente
    expect(mesmoItemDeVenda(a, c)).toBe(false); // hambúrguer diferente
  });

  it("combos diferentes nunca se misturam", () => {
    const a = { id: null, combo: { comboId: "c1", escolhas: [] } };
    const b = { id: null, combo: { comboId: "c2", escolhas: [] } };
    expect(mesmoItemDeVenda(a, b)).toBe(false);
  });

  it("null-safe", () => {
    expect(mesmoItemDeVenda(null, { id: 1 })).toBe(false);
  });
});
