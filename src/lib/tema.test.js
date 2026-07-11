// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  gerarVariaveisTema,
  nomeExibicaoTenant,
  logoUrlTenant,
  aplicarVariaveisTema,
  resolverCor,
} from "./tema";

describe("gerarVariaveisTema (Fase 6 — sem tema custom, sem overrides)", () => {
  it("retorna objeto vazio quando o tenant não tem tema (tenant atual, GastroMundi)", () => {
    expect(gerarVariaveisTema(null)).toEqual({});
    expect(gerarVariaveisTema(undefined)).toEqual({});
    expect(gerarVariaveisTema({})).toEqual({});
  });

  it("mapeia só os campos conhecidos para os tokens --gm-*", () => {
    expect(gerarVariaveisTema({ accent: "#0ea5e9" })).toEqual({ "--gm-accent": "#0ea5e9" });
  });

  it("mapeia múltiplos campos de uma vez", () => {
    expect(gerarVariaveisTema({ accent: "#0ea5e9", green: "#22c55e" })).toEqual({
      "--gm-accent": "#0ea5e9",
      "--gm-green": "#22c55e",
    });
  });

  it("ignora campos desconhecidos (nunca vira CSS arbitrário)", () => {
    expect(gerarVariaveisTema({ accent: "#0ea5e9", campo_malicioso: "}body{display:none" })).toEqual({
      "--gm-accent": "#0ea5e9",
    });
  });

  it("ignora valores vazios/não-string", () => {
    expect(gerarVariaveisTema({ accent: "", green: 123, red: "   " })).toEqual({});
  });

  it("faz trim do valor", () => {
    expect(gerarVariaveisTema({ accent: "  #0ea5e9  " })).toEqual({ "--gm-accent": "#0ea5e9" });
  });
});

describe("nomeExibicaoTenant", () => {
  it("retorna o fallback 'GastroMundi' quando o tenant não definiu nome_exibicao", () => {
    expect(nomeExibicaoTenant(null)).toBe("GastroMundi");
    expect(nomeExibicaoTenant({})).toBe("GastroMundi");
  });

  it("retorna o nome customizado do tenant quando definido", () => {
    expect(nomeExibicaoTenant({ nome_exibicao: "Pizzaria do João" })).toBe("Pizzaria do João");
  });

  it("ignora nome_exibicao vazio/só espaços (mantém o fallback)", () => {
    expect(nomeExibicaoTenant({ nome_exibicao: "   " })).toBe("GastroMundi");
  });

  it("aceita um fallback customizado", () => {
    expect(nomeExibicaoTenant(null, "Outro Padrão")).toBe("Outro Padrão");
  });
});

describe("logoUrlTenant", () => {
  it("retorna null quando não há logo definido (chamador decide o fallback visual)", () => {
    expect(logoUrlTenant(null)).toBeNull();
    expect(logoUrlTenant({})).toBeNull();
  });

  it("retorna a URL do logo quando definida", () => {
    expect(logoUrlTenant({ logo_url: "https://cdn.exemplo.com/logo.png" })).toBe("https://cdn.exemplo.com/logo.png");
  });
});

describe("aplicarVariaveisTema (efeito no DOM)", () => {
  let root;

  beforeEach(() => {
    root = document.createElement("div");
  });

  it("aplica cada variável via setProperty", () => {
    aplicarVariaveisTema({ "--gm-accent": "#0ea5e9", "--gm-green": "#22c55e" }, root);

    expect(root.style.getPropertyValue("--gm-accent")).toBe("#0ea5e9");
    expect(root.style.getPropertyValue("--gm-green")).toBe("#22c55e");
  });

  it("não faz nada (sem lançar) quando não há variáveis — defaults do :root continuam valendo", () => {
    expect(() => aplicarVariaveisTema({}, root)).not.toThrow();
    expect(() => aplicarVariaveisTema(undefined, root)).not.toThrow();
    expect(root.style.length).toBe(0);
  });

  it("não lança quando o elemento raiz não existe", () => {
    expect(() => aplicarVariaveisTema({ "--gm-accent": "#fff" }, null)).not.toThrow();
  });
});

describe("resolverCor (resolve CSS Custom Properties em runtime)", () => {
  let root;

  beforeEach(() => {
    // Cria um elemento raiz limpo para cada teste
    root = document.documentElement;
    // Reseta qualquer propriedade que tenha sido definida
    root.style.removeProperty("--gm-accent");
    root.style.removeProperty("--gm-green");
  });

  it("retorna fallback quando a CSS var não está definida no documento", () => {
    const cor = resolverCor("--gm-accent");
    // Deve retornar o fallback default para accent
    expect(cor).toBe("#7c3aed");
  });

  it("retorna o valor da CSS var quando ela está definida no :root", () => {
    document.documentElement.style.setProperty("--gm-accent", "#0ea5e9");
    const cor = resolverCor("--gm-accent");
    expect(cor).toBe("#0ea5e9");
  });

  it("retorna o valor correto para diferentes tokens", () => {
    document.documentElement.style.setProperty("--gm-green", "#22c55e");
    document.documentElement.style.setProperty("--gm-red", "#ff0000");

    expect(resolverCor("--gm-green")).toBe("#22c55e");
    expect(resolverCor("--gm-red")).toBe("#ff0000");
  });

  it("trata whitespace na propriedade (trim)", () => {
    document.documentElement.style.setProperty("--gm-accent", "  #0ea5e9  ");
    const cor = resolverCor("--gm-accent");
    expect(cor).toBe("#0ea5e9");
  });

  it("retorna fallback seguro quando o token é desconhecido", () => {
    const cor = resolverCor("--gm-unknown");
    expect(cor).toBe("#000000"); // fallback genérico para token desconhecido
  });
});
