import { describe, it, expect } from "vitest";
import {
  reaisParaCentavos,
  centavosParaReais,
  somar,
  subtrair,
  multiplicar,
  dividir,
} from "./dinheiro";

describe("dinheiro", () => {
  describe("reaisParaCentavos", () => {
    it("converte string com ponto decimal", () => {
      expect(reaisParaCentavos("10.50")).toBe(1050);
    });
    it("converte string com vírgula decimal", () => {
      expect(reaisParaCentavos("10,50")).toBe(1050);
    });
    it("converte número", () => {
      expect(reaisParaCentavos(10.5)).toBe(1050);
    });
    it("trata zero", () => {
      expect(reaisParaCentavos(0)).toBe(0);
    });
    it("trata valor vazio", () => {
      expect(reaisParaCentavos("")).toBe(0);
    });
    it("trata null e undefined", () => {
      expect(reaisParaCentavos(null)).toBe(0);
      expect(reaisParaCentavos(undefined)).toBe(0);
    });
    it("trata valor inválido", () => {
      expect(() => reaisParaCentavos("abc")).toThrow();
    });
  });

  describe("centavosParaReais", () => {
    it("converte centavos para reais formatado", () => {
      expect(centavosParaReais(1050)).toBe("10,50");
    });
    it("formata centavos menores que 100", () => {
      expect(centavosParaReais(150)).toBe("1,50");
    });
    it("formata um centavo", () => {
      expect(centavosParaReais(1)).toBe("0,01");
    });
    it("trata zero", () => {
      expect(centavosParaReais(0)).toBe("0,00");
    });
  });

  describe("somar", () => {
    it("soma múltiplos centavos", () => {
      expect(somar(1050, 150, 300)).toBe(1500);
    });
    it("soma lista vazia", () => {
      expect(somar()).toBe(0);
    });
  });

  describe("subtrair", () => {
    it("subtrai centavos", () => {
      expect(subtrair(1500, 1050)).toBe(450);
    });
    it("trata resultado negativo", () => {
      expect(subtrair(1000, 1500)).toBe(-500);
    });
  });

  describe("multiplicar", () => {
    it("aplica fator (desconto percentual)", () => {
      expect(multiplicar(1000, 0.9)).toBe(900);
    });
    it("arredonda resultado", () => {
      expect(multiplicar(1000, 0.333)).toBe(333);
    });
  });

  describe("dividir", () => {
    it("divide igualmente", () => {
      expect(dividir(1000, 2)).toEqual([500, 500]);
    });
    it("distribui resto", () => {
      expect(dividir(1000, 3)).toEqual([334, 333, 333]);
    });
    it("a soma bate com o total", () => {
      const resultado = dividir(1000, 3);
      expect(resultado.reduce((a, b) => a + b)).toBe(1000);
    });
  });
});
