// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  CHAVE_ESPERAS,
  sanitizarEsperas,
  lerEsperas,
  gravarEsperas,
  limparEsperas,
} from "./esperasStorage";

const CERVEJA = { id: 1, name: "Cerveja", price: 16.1, qty: 2, _key: 123 };

beforeEach(() => {
  window.localStorage.clear();
});

describe("esperasStorage, ida e volta", () => {
  it("a fila gravada volta igual na leitura", () => {
    const fila = [
      { comanda: "7", mesa: "3", apelido: "João", items: [CERVEJA] },
      { comanda: "8", mesa: "", apelido: "", items: [{ id: 2, name: "Batata", price: 20, qty: 1 }] },
    ];

    gravarEsperas(fila);

    expect(lerEsperas()).toEqual(fila);
  });

  it("fila vazia apaga a chave em vez de deixar lixo no aparelho", () => {
    gravarEsperas([{ comanda: "7", mesa: "", apelido: "", items: [CERVEJA] }]);
    expect(window.localStorage.getItem(CHAVE_ESPERAS)).toBeTruthy();

    gravarEsperas([]);

    expect(window.localStorage.getItem(CHAVE_ESPERAS)).toBeNull();
    expect(lerEsperas()).toEqual([]);
  });

  it("a mensagem de um envio que falhou continua junto da comanda", () => {
    gravarEsperas([{ comanda: "7", mesa: "", apelido: "", items: [CERVEJA], erro: "Erro ao enviar. Tente de novo." }]);

    expect(lerEsperas()[0].erro).toBe("Erro ao enviar. Tente de novo.");
  });

  it("limparEsperas apaga o que estava guardado", () => {
    gravarEsperas([{ comanda: "7", mesa: "", apelido: "", items: [CERVEJA] }]);

    limparEsperas();

    expect(lerEsperas()).toEqual([]);
  });
});

describe("esperasStorage, dado corrompido", () => {
  it("texto que não é JSON vira fila vazia e a chave é descartada", () => {
    window.localStorage.setItem(CHAVE_ESPERAS, "{isto não é json");

    expect(lerEsperas()).toEqual([]);
    expect(window.localStorage.getItem(CHAVE_ESPERAS)).toBeNull();
  });

  it("JSON que não é lista vira fila vazia", () => {
    window.localStorage.setItem(CHAVE_ESPERAS, JSON.stringify({ comanda: "7" }));

    expect(lerEsperas()).toEqual([]);
  });

  it("entrada quebrada é descartada e as boas sobrevivem", () => {
    window.localStorage.setItem(CHAVE_ESPERAS, JSON.stringify([
      null,
      "texto solto",
      { comanda: "   ", items: [CERVEJA] },                    // sem nome de comanda
      { comanda: "9", items: [] },                             // sem item a lançar
      { comanda: "10", items: "não é lista" },
      { comanda: "7", mesa: 42, apelido: null, items: [CERVEJA, { name: "Sem id", price: 5 }] },
    ]));

    expect(lerEsperas()).toEqual([
      { comanda: "7", mesa: "", apelido: "", items: [CERVEJA] },
    ]);
  });

  it("quantidade e preço ilegíveis não viram conta errada", () => {
    const fila = sanitizarEsperas([
      { comanda: "7", items: [
        { id: 1, name: "Cerveja", price: 16.1, qty: "abc" },   // quantidade volta a 1
        { id: 2, name: "Batata",  price: "grátis", qty: 2 },   // preço ilegível, item fora
        { id: 3, name: "Suco",    price: -5, qty: 1 },         // preço negativo, item fora
      ] },
    ]);

    expect(fila).toEqual([
      { comanda: "7", mesa: "", apelido: "", items: [{ id: 1, name: "Cerveja", price: 16.1, qty: 1 }] },
    ]);
  });
});
