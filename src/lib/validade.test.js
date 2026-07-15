import { describe, it, expect } from "vitest";
import { diasAteValidade, produtosVencendo, DIAS_ALERTA_VALIDADE_PADRAO } from "./validade";

const HOJE = new Date("2026-07-15T09:00:00");

describe("diasAteValidade", () => {
  it("conta os dias até a data (dia local)", () => {
    expect(diasAteValidade("2026-07-22", HOJE)).toBe(7);
    expect(diasAteValidade("2026-07-16", HOJE)).toBe(1);
  });

  it("0 quando vence hoje", () => {
    expect(diasAteValidade("2026-07-15", HOJE)).toBe(0);
  });

  it("negativo quando já vencido", () => {
    expect(diasAteValidade("2026-07-13", HOJE)).toBe(-2);
  });

  it("null para data ausente ou inválida", () => {
    expect(diasAteValidade(null, HOJE)).toBeNull();
    expect(diasAteValidade("", HOJE)).toBeNull();
    expect(diasAteValidade("xx", HOJE)).toBeNull();
  });
});

describe("produtosVencendo", () => {
  const products = [
    { id: 1, name: "Leite",    proxima_validade: "2026-07-16" }, // 1 dia
    { id: 2, name: "Iogurte",  proxima_validade: "2026-07-13" }, // vencido -2
    { id: 3, name: "Arroz",    proxima_validade: "2026-09-01" }, // fora da janela
    { id: 4, name: "Refri",    proxima_validade: null },          // sem controle
    { id: 5, name: "Pão",      proxima_validade: "2026-07-22" }, // 7 dias (limite)
  ];

  it("inclui vencendo e vencidos dentro da janela (default 7)", () => {
    const r = produtosVencendo(products, DIAS_ALERTA_VALIDADE_PADRAO, HOJE);
    expect(r.map((x) => x.produto.name)).toEqual(["Iogurte", "Leite", "Pão"]);
  });

  it("ordena do mais urgente para o menos urgente", () => {
    const r = produtosVencendo(products, 7, HOJE);
    expect(r[0].produto.name).toBe("Iogurte");
    expect(r[0].vencido).toBe(true);
    expect(r[r.length - 1].produto.name).toBe("Pão");
  });

  it("respeita janela menor", () => {
    const r = produtosVencendo(products, 1, HOJE);
    // só Iogurte (-2) e Leite (1) — Pão (7) fica de fora
    expect(r.map((x) => x.produto.name)).toEqual(["Iogurte", "Leite"]);
  });

  it("ignora produtos sem proxima_validade", () => {
    const r = produtosVencendo(products, 30, HOJE);
    expect(r.some((x) => x.produto.name === "Refri")).toBe(false);
  });

  it("lida com lista vazia", () => {
    expect(produtosVencendo([], 7, HOJE)).toEqual([]);
  });
});
