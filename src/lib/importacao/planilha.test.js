import { describe, it, expect } from "vitest";
import {
  decodificarArquivo,
  detectarSeparador,
  parsearCSV,
  normalizarTexto,
  normalizarCabecalho,
  parsearPrecoBR,
  parsearBooleanoBR,
  validarPlanilhaProdutos,
  montarCSVProdutos,
  gerarModeloCSV,
} from "./planilha";

describe("decodificarArquivo", () => {
  it("lê UTF-8 com acento", () => {
    const buf = new TextEncoder().encode("Pão de queijo");
    expect(decodificarArquivo(buf)).toBe("Pão de queijo");
  });

  it("cai pro Windows-1252 quando o UTF-8 é inválido (Excel BR)", () => {
    // "Pão" em Windows-1252: P=0x50, ã=0xE3, o=0x6F — 0xE3 sozinho é UTF-8 inválido
    const buf = new Uint8Array([0x50, 0xe3, 0x6f]);
    expect(decodificarArquivo(buf)).toBe("Pão");
  });
});

describe("detectarSeparador", () => {
  it("prefere ; (Excel pt-BR)", () => {
    expect(detectarSeparador("nome;preco\na;1")).toBe(";");
  });
  it("usa , quando não há ;", () => {
    expect(detectarSeparador("nome,preco\na,1")).toBe(",");
  });
  it("cai pra tab sem ; nem ,", () => {
    expect(detectarSeparador("nome\tpreco")).toBe("\t");
  });
});

describe("parsearCSV", () => {
  it("separa células e linhas, ignorando vazias", () => {
    expect(parsearCSV("a;b\n1;2\n\n3;4\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("respeita aspas com separador dentro", () => {
    expect(parsearCSV('nome;obs\n"X; grande";ok')).toEqual([["nome", "obs"], ["X; grande", "ok"]]);
  });
  it("desescapa aspas duplas", () => {
    expect(parsearCSV('a\n"diz ""oi"""')).toEqual([["a"], ['diz "oi"']]);
  });
  it("aceita CRLF do Windows e BOM", () => {
    expect(parsearCSV("﻿a;b\r\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("normalizarTexto / normalizarCabecalho", () => {
  it("tira acento, caixa e espaços duplicados", () => {
    expect(normalizarTexto("  Pão  de   Queijo ")).toBe("pao de queijo");
  });
  it("cabeçalho casa Preço/preco/PREÇO", () => {
    expect(normalizarCabecalho("Preço")).toBe("preco");
    expect(normalizarCabecalho(" PRECO ")).toBe("preco");
  });
});

describe("parsearPrecoBR", () => {
  it.each([
    ["24,90", 24.9],
    ["R$ 24,90", 24.9],
    ["1.234,56", 1234.56],
    ["24.90", 24.9],
    ["1.234", 1234],
    ["9", 9],
    [24.9, 24.9],
  ])("entende %s → %s", (entrada, esperado) => {
    expect(parsearPrecoBR(entrada)).toBe(esperado);
  });

  it.each([["abc"], [""], ["12,34,56"], [null]])("rejeita %s", (entrada) => {
    expect(parsearPrecoBR(entrada)).toBeNull();
  });
});

describe("parsearBooleanoBR", () => {
  it.each([["sim", true], ["Não", false], ["S", true], ["n", false], ["1", true], ["0", false]])(
    "%s → %s",
    (entrada, esperado) => expect(parsearBooleanoBR(entrada)).toBe(esperado)
  );
  it("vazio usa o padrão", () => {
    expect(parsearBooleanoBR("", true)).toBe(true);
    expect(parsearBooleanoBR("", false)).toBe(false);
  });
  it("não reconhecido → null (vira aviso, não erro)", () => {
    expect(parsearBooleanoBR("talvez")).toBeNull();
  });
});

describe("validarPlanilhaProdutos", () => {
  const cabecalho = "nome;preco;categoria;emoji;ativo;unidade";

  it("caminho feliz com dinheiro pt-BR e acento", () => {
    const r = validarPlanilhaProdutos(`${cabecalho}\nPão na chapa;R$ 8,50;Cafés;🍞;sim;un`);
    expect(r.erros).toEqual([]);
    expect(r.produtos).toEqual([
      { linha: 2, nome: "Pão na chapa", preco: 8.5, categoria: "Cafés", emoji: "🍞", ativo: true, unidade: "un" },
    ]);
  });

  it("cabeçalho tolerante (Preço, ordem trocada) e opcionais com default", () => {
    const r = validarPlanilhaProdutos("Categoria;Nome;Preço\nBebidas;Suco;9,00");
    expect(r.erros).toEqual([]);
    expect(r.produtos[0]).toMatchObject({ nome: "Suco", preco: 9, categoria: "Bebidas", ativo: true, unidade: "un" });
  });

  it("aponta erro por linha, com número visível do Excel, sem derrubar as boas", () => {
    const r = validarPlanilhaProdutos(`${cabecalho}\nBom;10,00;Pratos;;;\n;5,00;Pratos;;;\nSem preço;abc;Pratos;;;`);
    expect(r.produtos).toHaveLength(1);
    expect(r.erros).toEqual([
      { linha: 3, mensagem: "Nome do produto vazio." },
      { linha: 4, mensagem: 'Preço "abc" não é um valor válido (use 24,90).' },
    ]);
  });

  it("preço zero ou negativo é bloqueante", () => {
    const r = validarPlanilhaProdutos(`${cabecalho}\nGrátis;0;Pratos;;;`);
    expect(r.erros[0].mensagem).toMatch(/maior que zero/);
  });

  it("duplicado no arquivo: vale a última linha, com aviso", () => {
    const r = validarPlanilhaProdutos(`${cabecalho}\nCafé;5,00;Cafés;;;\ncafe;6,00;Cafés;;;`);
    expect(r.produtos).toHaveLength(1);
    expect(r.produtos[0].preco).toBe(6);
    expect(r.avisos[0].mensagem).toMatch(/mais de uma vez/);
  });

  it("cabeçalho sem coluna obrigatória explica qual falta", () => {
    const r = validarPlanilhaProdutos("nome;emoji\nX;🍔");
    expect(r.produtos).toEqual([]);
    expect(r.erros[0].mensagem).toMatch(/preco, categoria/);
  });

  it("arquivo vazio", () => {
    expect(validarPlanilhaProdutos("").erros[0].mensagem).toMatch(/vazio/);
  });
});

describe("montarCSVProdutos / gerarModeloCSV (portabilidade)", () => {
  it("export reimporta sem editar nada (round-trip)", () => {
    const csv = montarCSVProdutos([
      { name: "X-Salada", price: 24.9, category: "Lanches", emoji: "🍔", active: true, unidade_estoque: "un" },
      { name: "Item; com separador", price: 7, category: "Pratos", active: false },
    ]);
    const r = validarPlanilhaProdutos(csv);
    expect(r.erros).toEqual([]);
    expect(r.produtos).toEqual([
      { linha: 2, nome: "X-Salada", preco: 24.9, categoria: "Lanches", emoji: "🍔", ativo: true, unidade: "un" },
      { linha: 3, nome: "Item; com separador", preco: 7, categoria: "Pratos", emoji: null, ativo: false, unidade: "un" },
    ]);
  });

  it("modelo é válido por construção", () => {
    const r = validarPlanilhaProdutos(gerarModeloCSV());
    expect(r.erros).toEqual([]);
    expect(r.produtos).toHaveLength(2);
  });
});
