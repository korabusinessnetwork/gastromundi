import { describe, it, expect } from "vitest";
import { tituloDaAba, nomeDaTela, ehRotaDoApp, NOMES_DE_TELA } from "./tituloAba";

describe("tituloDaAba", () => {
  it("põe a tela na frente e o estabelecimento atrás", () => {
    expect(tituloDaAba("/app/pdv", "GASTROMUNDI")).toBe("Frente de caixa, GASTROMUNDI");
    expect(tituloDaAba("/app/cozinha", "GASTROMUNDI")).toBe("Cozinha, GASTROMUNDI");
  });

  it("as três abas que o balcão costuma deixar abertas ficam distinguíveis", () => {
    const abas = ["/app/pdv", "/app/cozinha", "/app/relatorio"].map(c => tituloDaAba(c, "CASA COFFEE"));
    expect(new Set(abas).size).toBe(3);
  });

  it("sem nome de estabelecimento, usa a marca da plataforma em vez de nada", () => {
    expect(tituloDaAba("/app/pdv", "")).toBe("Frente de caixa, Kora");
    expect(tituloDaAba("/app/pdv", null)).toBe("Frente de caixa, Kora");
  });

  it("barra no fim não muda o título", () => {
    expect(tituloDaAba("/app/estoque/", "X")).toBe(tituloDaAba("/app/estoque", "X"));
  });

  it("rota que ainda não está no mapa devolve só a marca, como era antes", () => {
    expect(tituloDaAba("/app/tela-que-nao-existe", "GASTROMUNDI")).toBe("GASTROMUNDI");
    expect(nomeDaTela("/app/tela-que-nao-existe")).toBeNull();
  });

  it("a raiz de /app é o Início", () => {
    expect(tituloDaAba("/app", "GASTROMUNDI")).toBe("Início, GASTROMUNDI");
  });
});

describe("ehRotaDoApp", () => {
  it("reconhece as telas do estabelecimento", () => {
    expect(ehRotaDoApp("/app")).toBe(true);
    expect(ehRotaDoApp("/app/pdv")).toBe(true);
  });

  it("não reclama das outras superfícies, que seguem com a marca do tenant", () => {
    for (const fora of ["/login", "/palm", "/cardapio", "/console", "/", "/appzinho"]) {
      expect(ehRotaDoApp(fora)).toBe(false);
    }
  });

  it("entrada inválida não derruba", () => {
    expect(ehRotaDoApp(undefined)).toBe(false);
    expect(ehRotaDoApp(null)).toBe(false);
  });
});

describe("mapa de telas", () => {
  it("nenhum rótulo usa travessão, porque a aba é texto de tela", () => {
    for (const rotulo of Object.values(NOMES_DE_TELA)) {
      expect(rotulo).not.toContain("—");
    }
  });
});
