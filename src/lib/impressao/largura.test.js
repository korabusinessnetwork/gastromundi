import { describe, it, expect } from "vitest";
import { larguraEmPx, colunasPorLargura, quebrarLinha, PX_POR_MM } from "./largura";

describe("larguraEmPx", () => {
  it("converte mm pra px na escala 3.75 (equivalente aos 300px fixos do F015 pra 80mm)", () => {
    expect(larguraEmPx(80)).toBe(300);
    expect(larguraEmPx(58)).toBe(218); // 58 * 3.75 = 217.5 → arredonda 218
  });

  it("cai no default de 80mm pra entrada inválida/ausente", () => {
    expect(larguraEmPx(undefined)).toBe(larguraEmPx(80));
    expect(larguraEmPx(0)).toBe(larguraEmPx(80));
    expect(larguraEmPx(-10)).toBe(larguraEmPx(80));
  });

  it("PX_POR_MM é a constante usada na conversão", () => {
    expect(larguraEmPx(100)).toBe(Math.round(100 * PX_POR_MM));
  });
});

describe("colunasPorLargura", () => {
  it("80mm cabe mais colunas que 58mm, na mesma fonte", () => {
    const colunas80 = colunasPorLargura(80, 13);
    const colunas58 = colunasPorLargura(58, 13);
    expect(colunas80).toBeGreaterThan(colunas58);
  });

  it("fonte maior reduz o número de colunas, na mesma largura", () => {
    const colunasFontePequena = colunasPorLargura(80, 13);
    const colunasFonteGrande  = colunasPorLargura(80, 20);
    expect(colunasFonteGrande).toBeLessThan(colunasFontePequena);
  });

  it("nunca cai abaixo do mínimo de colunas, mesmo em papel muito estreito", () => {
    expect(colunasPorLargura(20, 40)).toBeGreaterThanOrEqual(10);
  });
});

describe("quebrarLinha", () => {
  it("não quebra texto que já cabe na largura", () => {
    expect(quebrarLinha("Coca-Cola 2L", 32)).toEqual(["Coca-Cola 2L"]);
  });

  it("quebra em mais linhas numa largura menor (58mm) do que numa maior (80mm)", () => {
    const texto = "Hambúrguer artesanal com bacon e cheddar duplo";
    const colunas58 = colunasPorLargura(58);
    const colunas80 = colunasPorLargura(80);
    const linhas58 = quebrarLinha(texto, colunas58);
    const linhas80 = quebrarLinha(texto, colunas80);
    expect(linhas58.length).toBeGreaterThanOrEqual(linhas80.length);
    for (const linha of [...linhas58, ...linhas80]) {
      expect(linha.length).toBeLessThanOrEqual(Math.max(colunas58, colunas80));
    }
  });

  it("quebra uma palavra sozinha maior que a largura, sem estourar o limite", () => {
    const linhas = quebrarLinha("Supercalifragilisticexpialidocious", 10);
    expect(linhas.every(l => l.length <= 10)).toBe(true);
    expect(linhas.join("")).toBe("Supercalifragilisticexpialidocious");
  });

  it("texto vazio vira uma única linha vazia", () => {
    expect(quebrarLinha("", 20)).toEqual([""]);
    expect(quebrarLinha(null, 20)).toEqual([""]);
  });
});
