// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { resolverPerfilDoLocal } from "./resolverPerfil";

const CHAVE_CACHE = "gastromundi:estacao_bindings.v1";
const LS_KEY_LEGADO = "gastromundi:impressoras_config_v2";

const CONFIG = {
  perfilImpressora: {
    larguraMm: 80,
    margemMm: 2,
    cortaPapel: true,
    fonteBase: null,
    driver: "browser-raster",
    impressoraQz: null,
  },
};

function gravarCacheEstacao(impressoras, estacaoId = "est-1") {
  localStorage.setItem(CHAVE_CACHE, JSON.stringify({ estacaoId, impressoras }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("resolverPerfilDoLocal (Fase 2 — vínculo por estação, cache do banco)", () => {
  it("local com impressora vinculada na estação → driver ESC/POS herdando papel do perfil global", () => {
    gravarCacheEstacao({ "loc-cozinha": { nome: "EPSON TM-T20" } });

    const perfil = resolverPerfilDoLocal("loc-cozinha", CONFIG);

    expect(perfil).toMatchObject({
      larguraMm: 80,
      margemMm: 2,
      cortaPapel: true,
      driver: "escpos-qztray",
      impressoraQz: "EPSON TM-T20",
    });
  });

  it("local sem vínculo na estação → cai no perfil global", () => {
    gravarCacheEstacao({ "loc-bar": { nome: "Balcão" } });

    const perfil = resolverPerfilDoLocal("loc-cozinha", CONFIG);

    expect(perfil).toBe(CONFIG.perfilImpressora);
    expect(perfil.driver).toBe("browser-raster");
  });

  it("sem nada gravado → perfil global", () => {
    expect(resolverPerfilDoLocal("loc-cozinha", CONFIG)).toBe(CONFIG.perfilImpressora);
  });

  it("cache corrompido → não quebra, usa perfil global", () => {
    localStorage.setItem(CHAVE_CACHE, "{ isso não é json");

    expect(resolverPerfilDoLocal("loc-cozinha", CONFIG)).toBe(CONFIG.perfilImpressora);
  });

  it("vínculo sem nome (registro inválido) → ignora e usa perfil global", () => {
    gravarCacheEstacao({ "loc-cozinha": { nome: "" } });

    expect(resolverPerfilDoLocal("loc-cozinha", CONFIG)).toBe(CONFIG.perfilImpressora);
  });

  it("config sem perfilImpressora + vínculo → ainda produz perfil ESC/POS mínimo", () => {
    gravarCacheEstacao({ "loc-cozinha": { nome: "Térmica" } });

    const perfil = resolverPerfilDoLocal("loc-cozinha", {});

    expect(perfil).toEqual({ driver: "escpos-qztray", impressoraQz: "Térmica" });
  });

  describe("fallback legado (Fase 1 — vínculo por máquina) quando não há cache de estação", () => {
    it("sem cache de estação → usa o mapa legado do localStorage", () => {
      localStorage.setItem(LS_KEY_LEGADO, JSON.stringify({ "loc-cozinha": { nome: "Antiga" } }));

      const perfil = resolverPerfilDoLocal("loc-cozinha", CONFIG);

      expect(perfil).toMatchObject({ driver: "escpos-qztray", impressoraQz: "Antiga" });
    });

    it("cache de estação presente tem prioridade sobre o legado", () => {
      localStorage.setItem(LS_KEY_LEGADO, JSON.stringify({ "loc-cozinha": { nome: "Antiga" } }));
      gravarCacheEstacao({ "loc-cozinha": { nome: "Nova" } });

      const perfil = resolverPerfilDoLocal("loc-cozinha", CONFIG);

      expect(perfil.impressoraQz).toBe("Nova");
    });

    it("cache de estação vazio ({}) NÃO cai no legado — estação sem vínculo é decisão explícita", () => {
      localStorage.setItem(LS_KEY_LEGADO, JSON.stringify({ "loc-cozinha": { nome: "Antiga" } }));
      gravarCacheEstacao({});

      // impressoras: {} é um objeto válido → é o mapa efetivo; loc-cozinha não está nele → global.
      expect(resolverPerfilDoLocal("loc-cozinha", CONFIG)).toBe(CONFIG.perfilImpressora);
    });
  });
});
