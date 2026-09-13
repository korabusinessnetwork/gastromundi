import { describe, it, expect } from "vitest";
import { larguraEmPx, colunasPorLargura, colunasEscpos, quebrarLinha, PX_POR_MM } from "./largura";

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

describe("colunasEscpos", () => {
  it("papel de 80mm imprime 48 colunas e o de 58mm imprime 32 (Fonte A do hardware)", () => {
    expect(colunasEscpos(80)).toBe(48);
    expect(colunasEscpos(58)).toBe(32);
  });

  it("não depende do tamanho da fonte do preview: 80mm dá 48 e pronto", () => {
    expect(colunasEscpos(80)).toBeGreaterThan(colunasPorLargura(80, 15));
    expect(colunasEscpos(80)).toBe(48);
  });

  it("largura ausente ou inválida cai no padrão de 80mm", () => {
    expect(colunasEscpos(undefined)).toBe(48);
    expect(colunasEscpos(null)).toBe(48);
    expect(colunasEscpos(0)).toBe(48);
    expect(colunasEscpos(-10)).toBe(48);
    expect(colunasEscpos("papel grande")).toBe(48);
  });

  it("largura fora do padrão usa o papel padrão que ainda cabe, nunca um maior", () => {
    expect(colunasEscpos(76)).toBe(32);  // entre 58 e 80 → conta como 58mm
    expect(colunasEscpos(100)).toBe(48); // acima de 80 → segue 80mm, não inventa colunas
    expect(colunasEscpos(40)).toBe(32);  // não existe padrão menor que 58mm
  });

  it("devolve sempre um inteiro positivo", () => {
    for (const mm of [80, 58, 76, 100, 40, 0, -5, undefined, NaN, "x"]) {
      const colunas = colunasEscpos(mm);
      expect(Number.isInteger(colunas)).toBe(true);
      expect(colunas).toBeGreaterThan(0);
    }
  });

  it("letra miúda cabe mais por linha; letra grande cabe metade", () => {
    expect(colunasEscpos(80, "pequena")).toBe(64); // Fonte B
    expect(colunasEscpos(80, "normal")).toBe(48);
    expect(colunasEscpos(80, "alta")).toBe(48);    // só a altura dobra
    expect(colunasEscpos(80, "grande")).toBe(24);  // a largura dobra
  });

  it("o mesmo vale no papel de 58mm", () => {
    expect(colunasEscpos(58, "pequena")).toBe(42);
    expect(colunasEscpos(58, "normal")).toBe(32);
    expect(colunasEscpos(58, "alta")).toBe(32);
    expect(colunasEscpos(58, "grande")).toBe(16);
  });

  it("tamanho ausente ou desconhecido imprime como sempre imprimiu", () => {
    expect(colunasEscpos(80)).toBe(colunasEscpos(80, "normal"));
    expect(colunasEscpos(80, "gigante")).toBe(48);
    expect(colunasEscpos(58, undefined)).toBe(32);
  });

  it("nenhum tamanho produz coluna quebrada ou não positiva", () => {
    for (const tamanho of ["pequena", "normal", "alta", "grande", "x", undefined]) {
      for (const mm of [80, 58, 40, 0, undefined]) {
        const colunas = colunasEscpos(mm, tamanho);
        expect(Number.isInteger(colunas)).toBe(true);
        expect(colunas).toBeGreaterThan(0);
      }
    }
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
