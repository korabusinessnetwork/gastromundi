// ──────────────────────────────────────────────────────────────────
// Testes do NÚCLEO do cardápio em PDF — funções puras da heurística.
// Regra do repo: função pura nova nasce com teste.
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  separarNomePreco,
  pareceCategoria,
  limparCategoria,
  extrairProdutosDoTextoPdf,
  normalizarItensIA,
  CATEGORIA_PADRAO,
} from "./pdfCardapio";

describe("separarNomePreco", () => {
  it("separa nome e preço com vírgula BR", () => {
    expect(separarNomePreco("X-Salada 24,90")).toEqual({ nome: "X-Salada", preco: 24.9 });
  });

  it("remove leader de pontos entre nome e preço", () => {
    expect(separarNomePreco("X-Salada ...... 24,90")).toEqual({ nome: "X-Salada", preco: 24.9 });
  });

  it("aceita prefixo R$", () => {
    expect(separarNomePreco("Coca-Cola R$ 8,00")).toEqual({ nome: "Coca-Cola", preco: 8 });
  });

  it("aceita inteiro APENAS com R$", () => {
    expect(separarNomePreco("Cerveja R$ 15")).toEqual({ nome: "Cerveja", preco: 15 });
  });

  it("aceita milhar com ponto e centavos com vírgula", () => {
    expect(separarNomePreco("Rodízio 1.234,56")).toEqual({ nome: "Rodízio", preco: 1234.56 });
  });

  it("aceita decimal com ponto", () => {
    expect(separarNomePreco("Suco 12.50")).toEqual({ nome: "Suco", preco: 12.5 });
  });

  it("NÃO trata inteiro solto (sem R$) como preço — evita gramatura no nome", () => {
    expect(separarNomePreco("Pizza 4 queijos")).toBeNull();
  });

  it("retorna null quando não há preço", () => {
    expect(separarNomePreco("Endereço: Rua das Flores")).toBeNull();
  });

  it("retorna null para linha só com preço (sem nome)", () => {
    expect(separarNomePreco("24,90")).toBeNull();
  });

  it("retorna null para preço zero", () => {
    expect(separarNomePreco("Brinde 0,00")).toBeNull();
  });

  it("tolera entrada vazia/nula", () => {
    expect(separarNomePreco("")).toBeNull();
    expect(separarNomePreco(null)).toBeNull();
    expect(separarNomePreco(undefined)).toBeNull();
  });
});

describe("pareceCategoria", () => {
  it("reconhece título em caixa alta", () => {
    expect(pareceCategoria("LANCHES")).toBe(true);
    expect(pareceCategoria("BEBIDAS")).toBe(true);
  });

  it("reconhece título acentuado em caixa alta", () => {
    expect(pareceCategoria("PORÇÕES")).toBe(true);
  });

  it("rejeita linha com minúsculas", () => {
    expect(pareceCategoria("x-salada")).toBe(false);
    expect(pareceCategoria("Lanches")).toBe(false);
  });

  it("rejeita linha que termina em preço", () => {
    expect(pareceCategoria("X-SALADA 24,90")).toBe(false);
  });

  it("rejeita linha muito curta ou sem letras", () => {
    expect(pareceCategoria("A")).toBe(false);
    expect(pareceCategoria("123")).toBe(false);
    expect(pareceCategoria("---")).toBe(false);
  });

  it("rejeita linha longa demais (parágrafo/descrição)", () => {
    expect(pareceCategoria("ESSE É UM TEXTO MUITO LONGO QUE NÃO É UMA CATEGORIA DE VERDADE")).toBe(false);
  });

  it("tolera entrada vazia/nula", () => {
    expect(pareceCategoria("")).toBe(false);
    expect(pareceCategoria(null)).toBe(false);
  });
});

describe("limparCategoria", () => {
  it("converte caixa alta para Título", () => {
    expect(limparCategoria("PORÇÕES")).toBe("Porções");
    expect(limparCategoria("LANCHES ARTESANAIS")).toBe("Lanches Artesanais");
  });

  it("colapsa espaços múltiplos", () => {
    expect(limparCategoria("  BEBIDAS   GELADAS ")).toBe("Bebidas Geladas");
  });
});

describe("extrairProdutosDoTextoPdf", () => {
  it("organiza itens sob a seção corrente", () => {
    const linhas = [
      "CARDÁPIO GASTROMUNDI",
      "Rua das Flores, 123 - Centro",
      "LANCHES",
      "X-Salada ...... 24,90",
      "X-Bacon 28,00",
      "BEBIDAS",
      "Coca-Cola R$ 8,00",
    ];
    const { produtos, avisos } = extrairProdutosDoTextoPdf(linhas);
    expect(produtos).toEqual([
      { name: "X-Salada", price: 24.9, category: "Lanches" },
      { name: "X-Bacon", price: 28, category: "Lanches" },
      { name: "Coca-Cola", price: 8, category: "Bebidas" },
    ]);
    expect(avisos).toEqual([]);
  });

  it("avisa quando itens ficam sem seção (categoria padrão)", () => {
    const linhas = ["X-Salada 24,90", "Coca 8,00"];
    const { produtos, avisos } = extrairProdutosDoTextoPdf(linhas);
    expect(produtos).toHaveLength(2);
    expect(produtos.every((p) => p.category === CATEGORIA_PADRAO)).toBe(true);
    expect(avisos.some((a) => a.mensagem.includes(CATEGORIA_PADRAO))).toBe(true);
  });

  it("avisa quando nenhum item com preço é encontrado (PDF escaneado)", () => {
    const linhas = ["FOTO DO CARDÁPIO", "Sem texto de preço aqui"];
    const { produtos, avisos } = extrairProdutosDoTextoPdf(linhas);
    expect(produtos).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem.toLowerCase()).toContain("preço");
  });

  it("tolera entrada não-array", () => {
    expect(extrairProdutosDoTextoPdf(null).produtos).toEqual([]);
    expect(extrairProdutosDoTextoPdf(undefined).produtos).toEqual([]);
  });
});

describe("normalizarItensIA", () => {
  it("normaliza array de itens da IA (preço número e texto)", () => {
    const { produtos, avisos } = normalizarItensIA([
      { name: "X-Salada", price: 24.9, category: "Lanches" },
      { nome: "Coca-Cola", preco: "R$ 8,00", categoria: "Bebidas" },
    ]);
    expect(produtos).toEqual([
      { name: "X-Salada", price: 24.9, category: "Lanches" },
      { name: "Coca-Cola", price: 8, category: "Bebidas" },
    ]);
    expect(avisos).toEqual([]);
  });

  it("aceita string JSON com cerca markdown ```json", () => {
    const bruto = '```json\n[{"name":"Pizza","price":"45,00","category":"Pizzas"}]\n```';
    const { produtos } = normalizarItensIA(bruto);
    expect(produtos).toEqual([{ name: "Pizza", price: 45, category: "Pizzas" }]);
  });

  it("aceita objeto com chave itens ou produtos", () => {
    expect(normalizarItensIA({ itens: [{ name: "Suco", price: 9 }] }).produtos).toHaveLength(1);
    expect(normalizarItensIA({ produtos: [{ name: "Água", price: 5 }] }).produtos).toHaveLength(1);
  });

  it("cai em categoria padrão e avisa quando falta seção", () => {
    const { produtos, avisos } = normalizarItensIA([{ name: "Pastel", price: 7 }]);
    expect(produtos[0].category).toBe(CATEGORIA_PADRAO);
    expect(avisos.some((a) => a.mensagem.includes(CATEGORIA_PADRAO))).toBe(true);
  });

  it("descarta itens sem nome ou sem preço válido e avisa", () => {
    const { produtos, avisos } = normalizarItensIA([
      { name: "Válido", price: 10, category: "X" },
      { name: "", price: 10 },
      { name: "Sem preço", price: 0 },
      { name: "Preço lixo", price: "abc" },
      null,
    ]);
    expect(produtos).toEqual([{ name: "Válido", price: 10, category: "X" }]);
    expect(avisos.some((a) => a.mensagem.toLowerCase().includes("ignorad"))).toBe(true);
  });

  it("avisa quando não há nenhum item válido", () => {
    const { produtos, avisos } = normalizarItensIA([]);
    expect(produtos).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].mensagem.toLowerCase()).toContain("preço");
  });

  it("tolera JSON inválido sem quebrar", () => {
    const { produtos, avisos } = normalizarItensIA("isso não é json");
    expect(produtos).toEqual([]);
    expect(avisos[0].mensagem.toLowerCase()).toContain("legível");
  });

  it("tolera entrada nula", () => {
    expect(normalizarItensIA(null).produtos).toEqual([]);
    expect(normalizarItensIA(undefined).produtos).toEqual([]);
  });
});
