import { describe, it, expect } from "vitest";
import {
  tamanhoTermicaDeFonteBase,
  normalizarTamanhoTermica,
  fatorLarguraTermica,
  usaFonteMiuda,
  OPCOES_TAMANHO_TERMICA,
  TAMANHOS_TERMICA,
  TAMANHO_TERMICA_PADRAO,
  EXPLICACAO_TAMANHO_TERMICA,
} from "./tamanhoFonte";

describe("tamanhoTermicaDeFonteBase", () => {
  it("sem fonte definida (padrão do modelo) usa o tamanho padrão da impressora", () => {
    expect(tamanhoTermicaDeFonteBase(null)).toBe("normal");
    expect(tamanhoTermicaDeFonteBase(undefined)).toBe("normal");
  });

  it("traduz o slider de pixels nos degraus que a impressora tem", () => {
    expect(tamanhoTermicaDeFonteBase(11)).toBe("pequena");
    expect(tamanhoTermicaDeFonteBase(12)).toBe("pequena");
    expect(tamanhoTermicaDeFonteBase(13)).toBe("normal");
    expect(tamanhoTermicaDeFonteBase(16)).toBe("normal");
    expect(tamanhoTermicaDeFonteBase(17)).toBe("alta");
    expect(tamanhoTermicaDeFonteBase(19)).toBe("alta");
    expect(tamanhoTermicaDeFonteBase(20)).toBe("grande");
    expect(tamanhoTermicaDeFonteBase(22)).toBe("grande");
  });

  it("aumentar a fonte nunca diminui a letra na térmica (é monotônico)", () => {
    const ordem = ["pequena", "normal", "alta", "grande"];
    let anterior = -1;
    for (let px = 11; px <= 22; px += 1) {
      const posicao = ordem.indexOf(tamanhoTermicaDeFonteBase(px));
      expect(posicao).toBeGreaterThanOrEqual(anterior);
      anterior = posicao;
    }
  });

  it("valor inválido não derruba a impressão — cai no padrão", () => {
    for (const lixo of [0, -5, NaN, "grande", {}, []]) {
      expect(TAMANHOS_TERMICA).toContain(tamanhoTermicaDeFonteBase(lixo));
    }
    expect(tamanhoTermicaDeFonteBase("x")).toBe(TAMANHO_TERMICA_PADRAO);
  });
});

describe("opções da tela", () => {
  it("cada botão grava um px que volta pro mesmo degrau (ida e volta fecha)", () => {
    for (const { tamanho, px } of OPCOES_TAMANHO_TERMICA) {
      expect(tamanhoTermicaDeFonteBase(px)).toBe(tamanho);
    }
  });

  it("oferece os quatro tamanhos, cada um com rótulo e explicação", () => {
    expect(OPCOES_TAMANHO_TERMICA.map((o) => o.tamanho)).toEqual(TAMANHOS_TERMICA);
    for (const { rotulo, tamanho } of OPCOES_TAMANHO_TERMICA) {
      expect(rotulo.length).toBeGreaterThan(0);
      expect(EXPLICACAO_TAMANHO_TERMICA[tamanho]).toBeTruthy();
    }
  });

  it('"Padrão" grava null — é o padrão de cada modelo de documento, não um px fixo', () => {
    expect(OPCOES_TAMANHO_TERMICA.find((o) => o.tamanho === "normal").px).toBeNull();
  });
});

describe("normalizarTamanhoTermica", () => {
  it("mantém nome válido e troca qualquer outra coisa pelo padrão", () => {
    expect(normalizarTamanhoTermica("alta")).toBe("alta");
    expect(normalizarTamanhoTermica("gigante")).toBe("normal");
    expect(normalizarTamanhoTermica(undefined)).toBe("normal");
  });
});

describe("efeito de cada tamanho no caractere", () => {
  it("só a letra grande dobra a largura (e por isso muda as colunas)", () => {
    expect(fatorLarguraTermica("pequena")).toBe(1);
    expect(fatorLarguraTermica("normal")).toBe(1);
    expect(fatorLarguraTermica("alta")).toBe(1);
    expect(fatorLarguraTermica("grande")).toBe(2);
  });

  it("só a letra miúda troca a fonte do aparelho", () => {
    expect(usaFonteMiuda("pequena")).toBe(true);
    for (const t of ["normal", "alta", "grande", "qualquer coisa"]) {
      expect(usaFonteMiuda(t)).toBe(false);
    }
  });
});
