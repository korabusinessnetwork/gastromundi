import { describe, it, expect } from "vitest";
import { calcularBaixasEscolhas, montarItemCombo, montarItemProdutoEscolhas, mesmoItemDeVenda, precoDasEscolhas } from "./combos";

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
    // grupoId/regra entram no retrato da escolha: escolha sem grupo é a
    // de sempre, com a regra que o sistema sempre usou.
    expect(item.combo.escolhas).toEqual([
      { produtoId: 7, nome: "X-Burguer", qtd: 1, preco: 0, grupoId: null, regra: "soma" },
      { produtoId: 10, nome: "Coca", qtd: 1, preco: 0, grupoId: null, regra: "soma" },
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
    expect(item.combo.escolhas).toEqual([{ produtoId: 30, nome: "Suco", qtd: 1, preco: 2, grupoId: null, regra: "soma" }]);
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

describe("precoDasEscolhas — cada grupo cobra pela própria regra", () => {
  const sabor = (nome, preco, qtd = 1) => ({ produtoId: nome, nome, preco, qtd, grupoId: "sabores", regra: "maior" });

  describe("soma (extras)", () => {
    it("cada opção soma o próprio valor, multiplicado pela quantidade", () => {
      expect(precoDasEscolhas([
        { produtoId: 1, preco: 4, qtd: 1, grupoId: "extras", regra: "soma" },
        { produtoId: 2, preco: 3, qtd: 2, grupoId: "extras", regra: "soma" },
      ])).toBe(10);
    });

    it("escolha antiga, sem grupo nem regra, continua somando", () => {
      // É o dado que já está gravado em comanda e venda: não pode mudar
      // de preço porque o sistema ganhou regras novas.
      expect(precoDasEscolhas([
        { produtoId: 1, preco: 4, qtd: 1 },
        { produtoId: 2, preco: 6, qtd: 1 },
      ])).toBe(10);
    });
  });

  describe("maior (sabores de pizza)", () => {
    it("meio a meio vale o meio mais caro, não a soma dos dois", () => {
      expect(precoDasEscolhas([sabor("Calabresa", 40), sabor("Portuguesa", 60)])).toBe(60);
    });

    it("quatro sabores de R$ 40 continuam sendo UMA pizza de R$ 40", () => {
      // O bug que motivou a regra: somando, esta pizza saía por R$ 160.
      expect(precoDasEscolhas([
        sabor("A", 40), sabor("B", 40), sabor("C", 40), sabor("D", 40),
      ])).toBe(40);
    });

    it("repetir o mesmo sabor não multiplica — 2/4 de calabresa é parte de uma pizza", () => {
      expect(precoDasEscolhas([sabor("Calabresa", 40, 2), sabor("Portuguesa", 60, 2)])).toBe(60);
    });

    it("um sabor só custa o próprio preço", () => {
      expect(precoDasEscolhas([sabor("Calabresa", 40)])).toBe(40);
    });
  });

  describe("media", () => {
    it("meio a meio sai pela média dos dois", () => {
      const meio = (nome, preco, qtd = 1) => ({ produtoId: nome, preco, qtd, grupoId: "s", regra: "media" });
      expect(precoDasEscolhas([meio("A", 40), meio("B", 60)])).toBe(50);
    });

    it("a fração pondera: 3/4 do barato puxa o preço para baixo", () => {
      const q = (nome, preco, qtd) => ({ produtoId: nome, preco, qtd, grupoId: "s", regra: "media" });
      // (40*3 + 60*1) / 4
      expect(precoDasEscolhas([q("A", 40, 3), q("B", 60, 1)])).toBe(45);
    });
  });

  describe("vários grupos no mesmo item", () => {
    it("a regra vale DENTRO do grupo; grupos diferentes se somam", () => {
      // Pizza: sabores cobram o mais caro (60), borda soma (8).
      expect(precoDasEscolhas([
        sabor("Calabresa", 40),
        sabor("Portuguesa", 60),
        { produtoId: "borda", preco: 8, qtd: 1, grupoId: "borda", regra: "soma" },
      ])).toBe(68);
    });

    it("dois grupos 'maior' não se confundem num só", () => {
      expect(precoDasEscolhas([
        { produtoId: "a", preco: 40, qtd: 1, grupoId: "g1", regra: "maior" },
        { produtoId: "b", preco: 10, qtd: 1, grupoId: "g2", regra: "maior" },
      ])).toBe(50);
    });
  });

  it("sem escolha nenhuma o acréscimo é zero", () => {
    expect(precoDasEscolhas([])).toBe(0);
    expect(precoDasEscolhas(null)).toBe(0);
  });

  it("regra desconhecida cai em soma em vez de zerar o preço", () => {
    // Cobrar de menos calado é pior do que cobrar pela regra antiga.
    expect(precoDasEscolhas([
      { produtoId: 1, preco: 5, qtd: 1, grupoId: "g", regra: "metade" },
      { produtoId: 2, preco: 5, qtd: 1, grupoId: "g", regra: "metade" },
    ])).toBe(10);
  });
});

describe("montarItem* com regra de preço", () => {
  it("o combo aplica a regra do grupo, não a soma", () => {
    const item = montarItemCombo({ id: "c1", nome: "Pizza", preco_total: 0 }, [
      { produtoId: 1, nome: "Calabresa", preco: 40, qtd: 1, grupoId: "s", regra: "maior" },
      { produtoId: 2, nome: "Portuguesa", preco: 60, qtd: 1, grupoId: "s", regra: "maior" },
    ]);
    expect(item.price).toBe(60);
  });

  it("o produto com seleção soma a regra ao próprio preço base", () => {
    const item = montarItemProdutoEscolhas({ id: 9, name: "Pizza Grande", price: 5 }, [
      { produtoId: 1, nome: "Calabresa", preco: 40, qtd: 1, grupoId: "s", regra: "maior" },
      { produtoId: 2, nome: "Portuguesa", preco: 60, qtd: 1, grupoId: "s", regra: "maior" },
    ]);
    expect(item.price).toBe(65);
  });

  it("a escolha guarda o grupo e a regra usados na venda", () => {
    // Retrato do momento: o dono pode trocar a regra amanhã e a comanda
    // de hoje continua explicando o próprio preço.
    const item = montarItemCombo({ id: "c1", nome: "Pizza", preco_total: 0 }, [
      { produtoId: 1, nome: "Calabresa", preco: 40, qtd: 1, grupoId: "s", regra: "maior" },
    ]);
    expect(item.combo.escolhas[0]).toMatchObject({ grupoId: "s", regra: "maior" });
  });
});
