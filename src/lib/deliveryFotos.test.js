import { describe, it, expect, vi } from "vitest";

// enviarFotoProduto importa o client Supabase (exige VITE_* no import).
// Mockamos para não exigir env — só exercitamos as puras aqui.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  tipoImagemAceito,
  caminhoFotoProduto,
  calcularDimensoes,
  urlComVersao,
  MAX_LADO_PX,
} from "./deliveryFotos";

describe("tipoImagemAceito", () => {
  it("aceita qualquer image/*", () => {
    expect(tipoImagemAceito("image/jpeg")).toBe(true);
    expect(tipoImagemAceito("image/png")).toBe(true);
    expect(tipoImagemAceito("image/webp")).toBe(true);
    expect(tipoImagemAceito("IMAGE/HEIC")).toBe(true);
  });
  it("recusa não-imagens e lixo", () => {
    expect(tipoImagemAceito("application/pdf")).toBe(false);
    expect(tipoImagemAceito("")).toBe(false);
    expect(tipoImagemAceito(null)).toBe(false);
    expect(tipoImagemAceito(undefined)).toBe(false);
  });
});

describe("caminhoFotoProduto", () => {
  it("monta {tenant}/{produto}.jpg", () => {
    expect(caminhoFotoProduto("t1", 42)).toBe("t1/42.jpg");
    expect(caminhoFotoProduto("abc-uuid", "99")).toBe("abc-uuid/99.jpg");
  });
  it("apara espaços das pontas", () => {
    expect(caminhoFotoProduto("  t1 ", "  7 ")).toBe("t1/7.jpg");
  });
  it("devolve null sem tenant ou sem produto", () => {
    expect(caminhoFotoProduto("", 1)).toBe(null);
    expect(caminhoFotoProduto("t1", "")).toBe(null);
    expect(caminhoFotoProduto(null, null)).toBe(null);
    expect(caminhoFotoProduto("t1", undefined)).toBe(null);
  });
});

describe("calcularDimensoes", () => {
  it("não amplia quando já cabe no lado máximo", () => {
    expect(calcularDimensoes(800, 600)).toEqual({ largura: 800, altura: 600 });
    expect(calcularDimensoes(MAX_LADO_PX, 300)).toEqual({ largura: MAX_LADO_PX, altura: 300 });
  });
  it("reduz mantendo proporção pelo maior lado (paisagem)", () => {
    // 2400x1200 → escala 0.5 → 1200x600
    expect(calcularDimensoes(2400, 1200)).toEqual({ largura: 1200, altura: 600 });
  });
  it("reduz mantendo proporção pelo maior lado (retrato)", () => {
    // 1200x2400 → escala 0.5 → 600x1200
    expect(calcularDimensoes(1200, 2400)).toEqual({ largura: 600, altura: 1200 });
  });
  it("respeita maxLado customizado", () => {
    expect(calcularDimensoes(1000, 500, 500)).toEqual({ largura: 500, altura: 250 });
  });
  it("arredonda para inteiros", () => {
    const d = calcularDimensoes(1000, 333, 500);
    expect(Number.isInteger(d.largura)).toBe(true);
    expect(Number.isInteger(d.altura)).toBe(true);
  });
  it("é seguro com zero/negativo/lixo", () => {
    expect(calcularDimensoes(0, 100)).toEqual({ largura: 0, altura: 0 });
    expect(calcularDimensoes(100, 0)).toEqual({ largura: 0, altura: 0 });
    expect(calcularDimensoes(-5, -5)).toEqual({ largura: 0, altura: 0 });
    expect(calcularDimensoes(null, undefined)).toEqual({ largura: 0, altura: 0 });
  });
});

describe("urlComVersao", () => {
  it("anexa ?v= quando não há query", () => {
    expect(urlComVersao("https://x/f.jpg", 123)).toBe("https://x/f.jpg?v=123");
  });
  it("anexa &v= quando já há query", () => {
    expect(urlComVersao("https://x/f.jpg?a=1", 123)).toBe("https://x/f.jpg?a=1&v=123");
  });
  it("devolve a entrada crua quando vazia", () => {
    expect(urlComVersao("")).toBe("");
    expect(urlComVersao(null)).toBe(null);
  });
});
