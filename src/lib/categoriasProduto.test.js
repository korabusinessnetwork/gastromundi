import { describe, it, expect } from "vitest";
import { CATS_FIXAS, chaveCategoria, ehCategoriaFixa } from "./categoriasProduto";

describe("chaveCategoria", () => {
  it("ignora caixa, acento e espaço sobrando", () => {
    expect(chaveCategoria("Produção")).toBe("producao");
    expect(chaveCategoria("PRODUCAO")).toBe("producao");
    expect(chaveCategoria("  produção  ")).toBe("producao");
    expect(chaveCategoria("Insumo")).toBe("insumo");
  });

  it("aceita vazio, null e undefined sem quebrar", () => {
    expect(chaveCategoria("")).toBe("");
    expect(chaveCategoria(null)).toBe("");
    expect(chaveCategoria(undefined)).toBe("");
  });
});

describe("ehCategoriaFixa", () => {
  it("reconhece as categorias de sistema como o usuário as digitaria", () => {
    for (const variante of [
      "Insumo",
      "insumo",
      " INSUMO ",
      "Produção",
      "producao",
      "PRODUÇÃO",
      " produção ",
    ]) {
      expect(ehCategoriaFixa(variante)).toBe(true);
    }
  });

  it("deixa passar categoria de cardápio, inclusive parecida", () => {
    for (const livre of ["Bebidas", "Lanches", "Insumos", "Produções", "Sem Categoria"]) {
      expect(ehCategoriaFixa(livre)).toBe(false);
    }
  });

  it("não trata campo vazio como categoria de sistema", () => {
    // Campo vazio já tem a sua própria mensagem ("Informe a categoria.") —
    // aqui não pode disparar o aviso errado enquanto o usuário nem digitou.
    expect(ehCategoriaFixa("")).toBe(false);
    expect(ehCategoriaFixa("   ")).toBe(false);
    expect(ehCategoriaFixa(null)).toBe(false);
  });

  it("cobre toda a lista de categorias fixas declarada", () => {
    for (const fixa of CATS_FIXAS) expect(ehCategoriaFixa(fixa)).toBe(true);
  });
});
