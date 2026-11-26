import { describe, it, expect } from "vitest";
import { NOTAS_DE_ATUALIZACAO, TIPOS_DE_NOTA, dataPorExtenso } from "./notasDeAtualizacao";

describe("notas de atualização", () => {
  it("a mais nova vem primeiro, sem dois blocos no mesmo dia", () => {
    const datas = NOTAS_DE_ATUALIZACAO.map((n) => n.data);
    expect([...datas].sort().reverse()).toEqual(datas);
    expect(new Set(datas).size).toBe(datas.length);
  });

  it("toda nota tem data válida, título e ao menos um item de tipo conhecido", () => {
    for (const nota of NOTAS_DE_ATUALIZACAO) {
      expect(dataPorExtenso(nota.data)).not.toBe("");
      expect(nota.titulo.trim()).not.toBe("");
      expect(nota.itens.length).toBeGreaterThan(0);
      for (const item of nota.itens) {
        expect(Object.keys(TIPOS_DE_NOTA)).toContain(item.tipo);
        expect(item.texto.trim()).not.toBe("");
      }
    }
  });
});

describe("dataPorExtenso", () => {
  it("mostra o dia gravado, sem cair no dia anterior pelo fuso", () => {
    expect(dataPorExtenso("2026-11-26")).toBe("26 de novembro de 2026");
    expect(dataPorExtenso("2026-01-01")).toBe("1 de janeiro de 2026");
  });

  it("data inválida não vira texto", () => {
    expect(dataPorExtenso("")).toBe("");
    expect(dataPorExtenso("2026-13-01")).toBe("");
  });
});
