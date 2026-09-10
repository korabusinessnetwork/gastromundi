import { describe, it, expect, afterEach, vi } from "vitest";
import { novoUid, comUid, semUid, listaSemUid } from "@/lib/uidLista";

/**
 * TD015 — a chave de renderização das listas editáveis.
 *
 * Duas propriedades são o motivo desta função existir, e as duas estão travadas
 * aqui:
 *
 *   1. `comUid` devolve a MESMA referência quando não há nada a carimbar. As
 *      listas moram em `useState` e são atribuídas dentro de efeitos de carga;
 *      um array novo a cada passada reagenda o efeito para sempre.
 *
 *   2. Nada disso pode derrubar a tela num navegador sem `crypto.randomUUID`.
 *      Um PDV aberto por IP na rede local do restaurante não é contexto seguro,
 *      e lá a chamada lança.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("novoUid", () => {
  it("gera valor diferente a cada chamada", () => {
    const valores = new Set(Array.from({ length: 200 }, () => novoUid()));
    expect(valores.size).toBe(200);
  });

  it("funciona sem crypto.randomUUID, e ainda sem repetir", () => {
    vi.stubGlobal("crypto", {});

    const valores = new Set(Array.from({ length: 200 }, () => novoUid()));

    expect(valores.size).toBe(200);
    expect([...valores].every((v) => typeof v === "string" && v.length > 0)).toBe(true);
  });

  it("funciona quando crypto.randomUUID existe mas lança (contexto não seguro)", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("randomUUID is not available in insecure contexts");
      },
    });

    expect(typeof novoUid()).toBe("string");
  });
});

describe("comUid", () => {
  it("carimba uid em quem não tem, preservando os demais campos", () => {
    const lista = [{ nome: "Farinha", qtd: 2 }, { nome: "Açúcar", qtd: 1 }];

    const saida = comUid(lista);

    expect(saida.map((i) => i.nome)).toEqual(["Farinha", "Açúcar"]);
    expect(saida.map((i) => i.qtd)).toEqual([2, 1]);
    expect(saida[0].uid).toBeTruthy();
    expect(saida[1].uid).toBeTruthy();
    expect(saida[0].uid).not.toBe(saida[1].uid);
  });

  it("é idempotente: rodar de novo não troca uid nenhum", () => {
    const primeira = comUid([{ nome: "Farinha" }, { nome: "Açúcar" }]);

    const segunda = comUid(primeira);

    expect(segunda).toBe(primeira);
    expect(segunda.map((i) => i.uid)).toEqual(primeira.map((i) => i.uid));
  });

  it("não altera o array quando nada mudou", () => {
    const lista = [{ nome: "Farinha", uid: "u1" }];

    expect(comUid(lista)).toBe(lista);
  });

  it("mantém o uid existente e só completa quem falta", () => {
    const lista = [{ nome: "Farinha", uid: "u1" }, { nome: "Açúcar" }];

    const saida = comUid(lista);

    expect(saida).not.toBe(lista);
    expect(saida[0]).toBe(lista[0]);
    expect(saida[0].uid).toBe("u1");
    expect(saida[1].uid).toBeTruthy();
  });

  it("não muta a lista recebida", () => {
    const lista = [{ nome: "Farinha" }];

    comUid(lista);

    expect(lista[0]).toEqual({ nome: "Farinha" });
  });

  it("deixa passar item que não é objeto, sem quebrar", () => {
    const lista = [null, "texto", { nome: "Farinha" }];

    const saida = comUid(lista);

    expect(saida[0]).toBe(null);
    expect(saida[1]).toBe("texto");
    expect(saida[2].uid).toBeTruthy();
  });

  it("devolve o que recebeu quando não é array", () => {
    expect(comUid(null)).toBe(null);
    expect(comUid(undefined)).toBe(undefined);
  });
});

describe("semUid", () => {
  it("tira o uid e preserva o resto", () => {
    expect(semUid({ nome: "Farinha", qtd: 2, uid: "u1" })).toEqual({ nome: "Farinha", qtd: 2 });
  });

  it("não inventa a chave quando ela não existe", () => {
    const saida = semUid({ nome: "Farinha" });

    expect("uid" in saida).toBe(false);
    expect(saida).toEqual({ nome: "Farinha" });
  });

  it("não muta o objeto recebido", () => {
    const item = { nome: "Farinha", uid: "u1" };

    semUid(item);

    expect(item.uid).toBe("u1");
  });
});

describe("listaSemUid", () => {
  it("limpa o uid de todas as linhas", () => {
    const saida = listaSemUid([{ nome: "A", uid: "u1" }, { nome: "B", uid: "u2" }]);

    expect(saida).toEqual([{ nome: "A" }, { nome: "B" }]);
  });

  it("devolve a mesma referência quando não há uid para tirar", () => {
    const lista = [{ nome: "A" }, { nome: "B" }];

    expect(listaSemUid(lista)).toBe(lista);
  });

  it("devolve o que recebeu quando não é array", () => {
    expect(listaSemUid(null)).toBe(null);
  });
});
