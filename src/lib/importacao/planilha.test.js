import { describe, it, expect } from "vitest";
import {
  decodificarArquivo,
  detectarSeparador,
  parsearCSV,
  normalizarTexto,
  normalizarCabecalho,
  normalizarTelefone,
  parsearPrecoBR,
  parsearBooleanoBR,
  validarPlanilhaProdutos,
  validarPlanilhaClientes,
  validarPlanilhaEstoque,
  montarCSVProdutos,
  montarCSVClientes,
  montarCSVEstoque,
  gerarModeloCSV,
  gerarModeloClientesCSV,
  gerarModeloEstoqueCSV,
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

describe("aliases de cabeçalho (export cru de outros PDVs)", () => {
  it("produtos: Produto/Valor/Grupo entram sem renomear coluna", () => {
    const r = validarPlanilhaProdutos("Produto;Valor;Grupo\nX-Bacon;27,90;Lanches");
    expect(r.erros).toEqual([]);
    expect(r.produtos[0]).toMatchObject({ nome: "X-Bacon", preco: 27.9, categoria: "Lanches" });
  });

  it("coluna exata do modelo ganha do apelido quando as duas existem", () => {
    const r = validarPlanilhaProdutos("nome;produto;preco;categoria\nCerto;Errado;10,00;Pratos");
    expect(r.produtos[0].nome).toBe("Certo");
  });
});

describe("normalizarTelefone", () => {
  it.each([
    ["(51) 99999-0001", "51999990001"],
    ["+55 51 9 9999-0001", "5551999990001"],
    ["51999990001", "51999990001"],
    ["", ""],
    [null, ""],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });
});

describe("validarPlanilhaClientes", () => {
  const cabecalho = "nome;telefone;endereco;observacoes";

  it("caminho feliz — telefone normalizado pra só dígitos", () => {
    const r = validarPlanilhaClientes(`${cabecalho}\nAna Souza;(51) 99999-0001;Rua A, 1;Fiado ok`);
    expect(r.erros).toEqual([]);
    expect(r.clientes).toEqual([
      { linha: 2, nome: "Ana Souza", telefone: "51999990001", endereco: "Rua A, 1", observacoes: "Fiado ok" },
    ]);
  });

  it("aliases: Cliente/Celular casam com nome/telefone", () => {
    const r = validarPlanilhaClientes("Cliente;Celular\nCarlos;51 98888-0002");
    expect(r.erros).toEqual([]);
    expect(r.clientes[0]).toMatchObject({ nome: "Carlos", telefone: "51988880002" });
  });

  it("nome e telefone vazios ou telefone curto são erros por linha", () => {
    const r = validarPlanilhaClientes(`${cabecalho}\n;51 99999-0001;;\nSem fone;;;\nFone curto;123;;`);
    expect(r.clientes).toEqual([]);
    expect(r.erros).toEqual([
      { linha: 2, mensagem: "Nome do cliente vazio." },
      { linha: 3, mensagem: "Telefone vazio — é o contato mínimo pra fiado e delivery." },
      { linha: 4, mensagem: 'Telefone "123" não parece válido (use DDD + número).' },
    ]);
  });

  it("telefone duplicado no arquivo: vale a última linha, com aviso", () => {
    const r = validarPlanilhaClientes(`${cabecalho}\nAna;51999990001;;\nAna Souza;(51)99999-0001;;`);
    expect(r.clientes).toHaveLength(1);
    expect(r.clientes[0].nome).toBe("Ana Souza");
    expect(r.avisos[0].mensagem).toMatch(/mais de uma vez/);
  });

  it("export reimporta sem editar nada (round-trip) e modelo é válido", () => {
    const csv = montarCSVClientes([
      { nome: "Ana; Souza", telefone: "51 99999-0001", endereco: "Rua A", observacoes: null },
    ]);
    const r = validarPlanilhaClientes(csv);
    expect(r.erros).toEqual([]);
    expect(r.clientes[0]).toMatchObject({ nome: "Ana; Souza", telefone: "51999990001", endereco: "Rua A" });
    expect(validarPlanilhaClientes(gerarModeloClientesCSV()).erros).toEqual([]);
  });
});

describe("validarPlanilhaEstoque", () => {
  const cabecalho = "produto;quantidade;minimo";

  it("caminho feliz — quantidade decimal pt-BR e mínimo vazio vira null", () => {
    const r = validarPlanilhaEstoque(`${cabecalho}\nX-Salada;30;10\nSuco;2,5;`);
    expect(r.erros).toEqual([]);
    expect(r.itens).toEqual([
      { linha: 2, produto: "X-Salada", quantidade: 30, minimo: 10 },
      { linha: 3, produto: "Suco", quantidade: 2.5, minimo: null },
    ]);
  });

  it("quantidade inválida/negativa e mínimo inválido são erros por linha", () => {
    const r = validarPlanilhaEstoque(`${cabecalho}\nA;abc;\nB;10;xyz`);
    expect(r.itens).toEqual([]);
    expect(r.erros[0].mensagem).toMatch(/não é um número válido/);
    expect(r.erros[1].mensagem).toMatch(/Mínimo "xyz"/);
  });

  it("aliases: Item/Qtd/Estoque mínimo casam com o modelo", () => {
    const r = validarPlanilhaEstoque("Item;Qtd;Estoque mínimo\nCafé;12;4");
    expect(r.erros).toEqual([]);
    expect(r.itens[0]).toMatchObject({ produto: "Café", quantidade: 12, minimo: 4 });
  });

  it("produto duplicado no arquivo: vale a última linha, com aviso", () => {
    const r = validarPlanilhaEstoque(`${cabecalho}\nCafé;5;\ncafe;8;`);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].quantidade).toBe(8);
    expect(r.avisos[0].mensagem).toMatch(/mais de uma vez/);
  });

  it("export reimporta sem editar nada (round-trip) e modelo é válido", () => {
    const csv = montarCSVEstoque([{ produto: "X-Salada", quantidade: 2.5, minimo: 10 }]);
    const r = validarPlanilhaEstoque(csv);
    expect(r.erros).toEqual([]);
    expect(r.itens[0]).toMatchObject({ produto: "X-Salada", quantidade: 2.5, minimo: 10 });
    expect(validarPlanilhaEstoque(gerarModeloEstoqueCSV()).erros).toEqual([]);
  });
});
