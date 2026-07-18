import { describe, it, expect } from "vitest";
import {
  BRANDING_CACHE_KEY,
  normalizarBranding,
  lerBrandingCache,
  salvarBrandingCache,
} from "./brandingCache";

// Storage fake mínimo (mesma interface do localStorage)
function fakeStorage(inicial = {}) {
  const dados = { ...inicial };
  return {
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v); },
    removeItem: (k) => { delete dados[k]; },
    _dados: dados,
  };
}

describe("normalizarBranding", () => {
  it("retorna null para entradas vazias/inválidas", () => {
    expect(normalizarBranding(null)).toBeNull();
    expect(normalizarBranding(undefined)).toBeNull();
    expect(normalizarBranding("x")).toBeNull();
    expect(normalizarBranding({})).toBeNull();
    expect(normalizarBranding({ nome: "  ", logo: "", variaveis: {} })).toBeNull();
  });

  it("mantém nome/logo aparados e variáveis --gm-* válidas", () => {
    const r = normalizarBranding({
      nome: "  Casa Coffee ",
      logo: " https://cdn/logo.png ",
      variaveis: { "--gm-accent": " #c08a3e ", "--gm-bg": "#111" },
    });
    expect(r).toEqual({
      nome: "Casa Coffee",
      logo: "https://cdn/logo.png",
      variaveis: { "--gm-accent": "#c08a3e", "--gm-bg": "#111" },
    });
  });

  it("descarta chaves fora do padrão --gm-* (nunca CSS arbitrário)", () => {
    const r = normalizarBranding({
      nome: "X",
      variaveis: {
        "--gm-accent": "#fff",
        "background": "url(javascript:1)",
        "--outra-var": "#000",
        "--gm-ACCENT": "#000",
        "--gm-accent2": "#000",
      },
    });
    expect(r.variaveis).toEqual({ "--gm-accent": "#fff" });
  });

  it("aceita os tokens de fonte hifenizados (--gm-font-titulo/-texto)", () => {
    const r = normalizarBranding({
      nome: "Casa Coffee",
      variaveis: {
        "--gm-font-titulo": '"Saira", sans-serif',
        "--gm-font-texto": '"Sora", sans-serif',
      },
    });
    expect(r.variaveis).toEqual({
      "--gm-font-titulo": '"Saira", sans-serif',
      "--gm-font-texto": '"Sora", sans-serif',
    });
  });

  it("descarta valores de variável não-string ou vazios", () => {
    const r = normalizarBranding({ nome: "X", variaveis: { "--gm-accent": 7, "--gm-bg": "  " } });
    expect(r.variaveis).toEqual({});
  });
});

describe("lerBrandingCache / salvarBrandingCache", () => {
  it("faz round-trip pelo storage", () => {
    const s = fakeStorage();
    salvarBrandingCache({ nome: "Casa Coffee", logo: null, variaveis: { "--gm-accent": "#c08a3e" } }, s);
    expect(lerBrandingCache(s)).toEqual({
      nome: "Casa Coffee",
      logo: null,
      variaveis: { "--gm-accent": "#c08a3e" },
    });
  });

  it("retorna null com storage vazio ou JSON corrompido", () => {
    expect(lerBrandingCache(fakeStorage())).toBeNull();
    expect(lerBrandingCache(fakeStorage({ [BRANDING_CACHE_KEY]: "{oops" }))).toBeNull();
  });

  it("salvar branding vazio limpa o cache (tenant sem tema não deixa lixo)", () => {
    const s = fakeStorage({ [BRANDING_CACHE_KEY]: JSON.stringify({ nome: "Velho" }) });
    salvarBrandingCache({ nome: "", logo: null, variaveis: {} }, s);
    expect(lerBrandingCache(s)).toBeNull();
  });

  it("nunca lança com storage quebrado", () => {
    const quebrado = { getItem: () => { throw new Error("boom"); }, setItem: () => { throw new Error("boom"); } };
    expect(lerBrandingCache(quebrado)).toBeNull();
    expect(() => salvarBrandingCache({ nome: "X" }, quebrado)).not.toThrow();
  });
});
