import { describe, it, expect } from "vitest";
import { garantirUidItens, mesclarItensComanda, totalItensAtivos } from "./comandaItens";

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
});
