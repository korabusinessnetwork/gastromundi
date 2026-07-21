// ──────────────────────────────────────────────────────────────────
// Testes da ENTRADA de .xlsx — conversão para o CSV que o wizard valida.
// Monta workbooks em memória com o próprio SheetJS (sem fixtures binários)
// e confere que o texto sai no contrato de produtos (";" + cabeçalho).
// ──────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { xlsxParaCSV } from "./xlsxEntrada";
import { validarPlanilhaProdutos } from "./planilha";

/** Monta os bytes de um .xlsx a partir de linhas (AOA), como o navegador entrega. */
function xlsxBytes(sheets) {
  const wb = XLSX.utils.book_new();
  for (const { nome, linhas } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  const ab = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(ab);
}

describe("xlsxParaCSV", () => {
  it("converte a planilha em CSV com separador ';'", () => {
    const bytes = xlsxBytes([
      {
        nome: "Produtos",
        linhas: [
          ["nome", "preco", "categoria"],
          ["X-Salada", "24,90", "Lanches"],
          ["Coca-Cola", "8", "Bebidas"],
        ],
      },
    ]);
    const csv = xlsxParaCSV(bytes);
    const linhas = csv.trim().split(/\r?\n/);
    expect(linhas[0]).toBe("nome;preco;categoria");
    expect(linhas[1]).toBe("X-Salada;24,90;Lanches");
  });

  it("pula abas vazias e usa a primeira com conteúdo", () => {
    const bytes = xlsxBytes([
      { nome: "Instruções", linhas: [] },
      {
        nome: "Dados",
        linhas: [
          ["nome", "preco", "categoria"],
          ["Suco", "9,00", "Bebidas"],
        ],
      },
    ]);
    const csv = xlsxParaCSV(bytes);
    expect(csv).toContain("Suco;9,00;Bebidas");
  });

  it("o CSV gerado passa pelo validador de produtos existente", () => {
    const bytes = xlsxBytes([
      {
        nome: "P",
        linhas: [
          ["nome", "preco", "categoria"],
          ["X-Bacon", "28,00", "Lanches"],
        ],
      },
    ]);
    const csv = xlsxParaCSV(bytes);
    const { produtos, erros } = validarPlanilhaProdutos(csv);
    expect(erros).toEqual([]);
    expect(produtos).toHaveLength(1);
    expect(produtos[0]).toMatchObject({ nome: "X-Bacon", preco: 28, categoria: "Lanches" });
  });

  it("aceita cabeçalho com apelidos de outro PDV (produto/valor/grupo)", () => {
    const bytes = xlsxBytes([
      {
        nome: "Export",
        linhas: [
          ["produto", "valor", "grupo"],
          ["Pizza Marguerita", "45,00", "Pizzas"],
        ],
      },
    ]);
    const csv = xlsxParaCSV(bytes);
    const { produtos, erros } = validarPlanilhaProdutos(csv);
    expect(erros).toEqual([]);
    expect(produtos[0]).toMatchObject({ nome: "Pizza Marguerita", preco: 45, categoria: "Pizzas" });
  });

  it("aceita ArrayBuffer além de Uint8Array", () => {
    const bytes = xlsxBytes([
      { nome: "P", linhas: [["nome", "preco", "categoria"], ["Água", "5", "Bebidas"]] },
    ]);
    const csv = xlsxParaCSV(bytes.buffer);
    expect(csv).toContain("Água;5;Bebidas");
  });

  it("devolve string vazia quando não há aba com conteúdo", () => {
    const bytes = xlsxBytes([{ nome: "Vazia", linhas: [] }]);
    expect(xlsxParaCSV(bytes)).toBe("");
  });
});
