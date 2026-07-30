import { describe, it, expect } from "vitest";
import { garantirUidItens, mesclarItensComanda, totalItensAtivos, cancelarItemComanda } from "./comandaItens";

describe("garantirUidItens", () => {
  it("adiciona uid a itens sem uid e preserva os existentes", () => {
    const items = [{ name: "Café", price: 5 }, { name: "Pão", price: 3, uid: "fixo" }];
    const out = garantirUidItens(items);
    expect(out[0].uid).toBeTruthy();
    expect(out[1].uid).toBe("fixo");
  });

  it("devolve a mesma referência quando nada muda (idempotente)", () => {
    const items = [{ name: "Café", price: 5, uid: "a" }];
    expect(garantirUidItens(items)).toBe(items);
  });

  it("tolera valores não-array", () => {
    expect(garantirUidItens(null)).toBe(null);
    expect(garantirUidItens(undefined)).toBe(undefined);
  });
});

describe("mesclarItensComanda", () => {
  const cafe   = { uid: "u1", name: "Café", price: 5, qty: 1 };
  const pao    = { uid: "u2", name: "Pão", price: 3, qty: 2 };
  const suco   = { uid: "u3", name: "Suco (palm)", price: 8, qty: 1 };

  it("preserva item lançado por outro dispositivo entre o snapshot e a gravação", () => {
    const { items, houveMescla } = mesclarItensComanda({
      base: [cafe],
      propostos: [cafe, pao],       // PDV lançou pão a partir do snapshot [café]
      banco: [cafe, suco],          // Palm lançou suco no meio do caminho
    });
    expect(houveMescla).toBe(true);
    expect(items).toEqual([cafe, pao, suco]);
  });

  it("não duplica itens já conhecidos pelo chamador", () => {
    const { items, houveMescla } = mesclarItensComanda({
      base: [cafe, suco],
      propostos: [cafe, suco, pao],
      banco: [cafe, suco],
    });
    expect(houveMescla).toBe(false);
    expect(items).toEqual([cafe, suco, pao]);
  });

  it("respeita remoção/cancelamento feito pelo chamador (uid na base não volta)", () => {
    // Chamador cancelou o café (não está nos propostos, mas está na base):
    // o merge não pode ressuscitá-lo só porque ele ainda existe no banco.
    const { items } = mesclarItensComanda({
      base: [cafe, pao],
      propostos: [pao],
      banco: [cafe, pao, suco],
    });
    expect(items).toEqual([pao, suco]);
  });

  it("itens legados sem uid ficam a cargo do snapshot do chamador", () => {
    const legado = { name: "Antigo", price: 10, qty: 1 };
    const { items, houveMescla } = mesclarItensComanda({
      base: [legado],
      propostos: [legado, pao],
      banco: [legado],
    });
    expect(houveMescla).toBe(false);
    expect(items).toEqual([legado, pao]);
  });

  it("tolera banco vazio ou nulo", () => {
    const { items, houveMescla } = mesclarItensComanda({ base: [cafe], propostos: [cafe], banco: null });
    expect(houveMescla).toBe(false);
    expect(items).toEqual([cafe]);
  });
});

describe("cancelarItemComanda", () => {
  const cafe = { uid: "u1", name: "Café", price: 5, qty: 1 };
  const pao  = { uid: "u2", name: "Pão",  price: 3, qty: 2 };

  it("marca o item alvo como cancelado com motivo e responsável", () => {
    const out = cancelarItemComanda([cafe, pao], 1, { motivo: "  cliente desistiu ", por: "Ana" });
    expect(out[0]).toEqual(cafe); // outros itens intactos
    expect(out[1]).toEqual({ ...pao, cancelado: true, motivoCancelamento: "cliente desistiu", canceladoPor: "Ana" });
  });

  it("preserva o uid do item cancelado (base do merge multi-dispositivo)", () => {
    const out = cancelarItemComanda([cafe, pao], 0, { motivo: "erro", por: "Ana" });
    expect(out[0].uid).toBe("u1");
  });

  it("não sai da conta antes, sai depois (integra com totalItensAtivos)", () => {
    const out = cancelarItemComanda([cafe, pao], 1, { motivo: "x", por: "Ana" });
    expect(totalItensAtivos(out)).toBe(5); // só o café
  });

  it("idempotente: item já cancelado devolve a mesma referência", () => {
    const lista = [cafe, { ...pao, cancelado: true }];
    expect(cancelarItemComanda(lista, 1, { motivo: "de novo", por: "Bruno" })).toBe(lista);
  });

  it("índice inválido devolve a mesma referência", () => {
    const lista = [cafe];
    expect(cancelarItemComanda(lista, 9, { motivo: "x", por: "Ana" })).toBe(lista);
    expect(cancelarItemComanda(lista, -1, { motivo: "x", por: "Ana" })).toBe(lista);
  });

  it("tolera valores não-array e contexto ausente", () => {
    expect(cancelarItemComanda(null, 0)).toBe(null);
    const out = cancelarItemComanda([cafe], 0);
    expect(out[0]).toEqual({ ...cafe, cancelado: true, motivoCancelamento: "", canceladoPor: "" });
  });
});

describe("totalItensAtivos", () => {
  it("soma price × qty apenas dos itens não cancelados", () => {
    expect(totalItensAtivos([
      { price: 10, qty: 2 },
      { price: 5 },                          // qty ausente conta como 1
      { price: 99, qty: 3, cancelado: true },
    ])).toBe(25);
  });

  it("tolera lista vazia ou nula", () => {
    expect(totalItensAtivos([])).toBe(0);
    expect(totalItensAtivos(null)).toBe(0);
  });

  it("arredonda: o retorno é gravado em pending.total e mostrado na tela", () => {
    // 16.1 * 3 = 48.300000000000004 em ponto flutuante. Sem arredondar, é esse
    // número que ia para o banco e aparecia na comanda do Palm.
    expect(totalItensAtivos([{ price: 16.1, qty: 3 }])).toBe(48.3);
    // 39.9 + 8.7 = 48.599999999999994 somando item por item.
    expect(totalItensAtivos([{ price: 39.9, qty: 1 }, { price: 8.7, qty: 1 }])).toBe(48.6);
  });

  it("item sem price não contamina o total com NaN", () => {
    expect(totalItensAtivos([{ qty: 2 }, { price: 7, qty: 1 }])).toBe(7);
  });

  it("item sem qty vale 1, não zero (Palm e PDV precisam do mesmo total)", () => {
    // O Palm somava com `qty || 0`: o mesmo item valia 0 no celular e 1 no
    // desktop, então a mesma comanda tinha dois totais diferentes.
    expect(totalItensAtivos([{ price: 12.5 }])).toBe(12.5);
  });
});
