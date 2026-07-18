import { describe, it, expect } from "vitest";
import { calcularBaixasSubprodutos, montarItemCombo, mesmoItemDeVenda } from "./combos";

describe("calcularBaixasSubprodutos", () => {
  const comboItem = (extra = {}) => ({
    id: 1,
    qty: 1,
    combo: {
      comboId: "c1",
      subprodutos: [
        { id: "s1", nome: "Batata", quantidade: 1, controla_estoque: true },
        { id: "s2", nome: "Molho", quantidade: 2, controla_estoque: false },
      ],
    },
    ...extra,
  });

  it("baixa só subprodutos com controla_estoque, multiplicando pela qty do item", () => {
    const r = calcularBaixasSubprodutos([comboItem({ qty: 3 })]);
    expect(r).toEqual([{ subprodutoId: "s1", nome: "Batata", qtd: 3 }]);
  });

  it("multiplica a quantidade da receita pela qty do carrinho", () => {
    const item = comboItem({ qty: 2 });
    item.combo.subprodutos[0].quantidade = 2;
    const r = calcularBaixasSubprodutos([item]);
    expect(r[0].qtd).toBe(4);
  });

  it("soma o mesmo subproduto vindo de itens/combos diferentes", () => {
    const outro = comboItem({ qty: 1 });
    outro.combo = {
      comboId: "c2",
      subprodutos: [{ id: "s1", nome: "Batata", quantidade: 1, controla_estoque: true }],
    };
    const r = calcularBaixasSubprodutos([comboItem({ qty: 2 }), outro]);
    expect(r).toEqual([{ subprodutoId: "s1", nome: "Batata", qtd: 3 }]);
  });

  it("ignora itens cancelados e itens sem combo", () => {
    const r = calcularBaixasSubprodutos([
      comboItem({ cancelado: true }),
      { id: 5, qty: 2 }, // produto normal, sem combo
    ]);
    expect(r).toEqual([]);
  });

  it("assume qty 1 quando o item não traz quantidade", () => {
    const item = comboItem();
    delete item.qty;
    const r = calcularBaixasSubprodutos([item]);
    expect(r[0].qtd).toBe(1);
  });

  it("lida com lista nula/vazia e shapes quebrados sem lançar", () => {
    expect(calcularBaixasSubprodutos(null)).toEqual([]);
    expect(calcularBaixasSubprodutos([null, {}, { combo: {} }, { combo: { subprodutos: [null, {}] } }])).toEqual([]);
  });
});

describe("montarItemCombo", () => {
  const comboDb = {
    id: "c1",
    nome: "Combo X-Burguer",
    item_principal_id: 7,
    preco_total: 35.5,
    combo_subprodutos: [
      { quantidade: 2, subprodutos: { id: "s1", nome: "Batata", controla_estoque: true } },
      { quantidade: 1, subprodutos: { id: "s2", nome: "Refri", controla_estoque: false } },
    ],
  };

  it("monta o item com id do produto principal e a receita do combo", () => {
    const item = montarItemCombo(comboDb);
    expect(item.id).toBe(7);
    expect(item.name).toBe("Combo X-Burguer");
    expect(item.price).toBe(35.5);
    expect(item.combo.comboId).toBe("c1");
    expect(item.combo.subprodutos).toEqual([
      { id: "s1", nome: "Batata", quantidade: 2, controla_estoque: true },
      { id: "s2", nome: "Refri", quantidade: 1, controla_estoque: false },
    ]);
  });

  it("retorna null sem combo ou sem produto principal", () => {
    expect(montarItemCombo(null)).toBeNull();
    expect(montarItemCombo({ id: "c9", nome: "Quebrado" })).toBeNull();
  });

  it("descarta linhas de receita sem subproduto aninhado", () => {
    const item = montarItemCombo({ ...comboDb, combo_subprodutos: [{ quantidade: 1 }, null] });
    expect(item.combo.subprodutos).toEqual([]);
  });
});

describe("mesmoItemDeVenda", () => {
  it("produto avulso não se mistura com combo do mesmo principal", () => {
    const avulso = { id: 7 };
    const combo = { id: 7, combo: { comboId: "c1" } };
    expect(mesmoItemDeVenda(avulso, combo)).toBe(false);
    expect(mesmoItemDeVenda(avulso, { id: 7 })).toBe(true);
    expect(mesmoItemDeVenda(combo, { id: 7, combo: { comboId: "c1" } })).toBe(true);
    expect(mesmoItemDeVenda(combo, { id: 7, combo: { comboId: "c2" } })).toBe(false);
  });

  it("null-safe", () => {
    expect(mesmoItemDeVenda(null, { id: 1 })).toBe(false);
  });
});
