import { describe, it, expect } from "vitest";
import {
  decidirTpEmisInicial,
  deveEntrarContingencia,
  deveSairContingencia,
  decidirDesfechoEmissao,
  CSTAT_SERVICO_PARALISADO,
} from "./nfceContingenciaDecisao";

describe("nfceContingenciaDecisao — decidirTpEmisInicial", () => {
  it("contingência ativa → sai direto em 9 (pula o online lento)", () => {
    expect(decidirTpEmisInicial({ contingenciaAtiva: true, tpEmisSolicitado: 1 })).toBe(9);
  });
  it("sem contingência → normaliza o solicitado (default 1)", () => {
    expect(decidirTpEmisInicial({ contingenciaAtiva: false })).toBe(1);
    expect(decidirTpEmisInicial({ contingenciaAtiva: false, tpEmisSolicitado: 9 })).toBe(9);
    expect(decidirTpEmisInicial({})).toBe(1);
  });
  it("tpEmis inválido lança (prevenção de erro, reusa normalizarTpEmis)", () => {
    expect(() => decidirTpEmisInicial({ tpEmisSolicitado: 5 })).toThrow(/tpEmis/);
  });
});

describe("nfceContingenciaDecisao — deveEntrarContingencia", () => {
  it("erro de transmissão → entra", () => {
    expect(deveEntrarContingencia({ erroTransmissao: "timeout" })).toBe(true);
  });
  it("cStat 108/109 (serviço paralisado) → entra", () => {
    expect(deveEntrarContingencia({ cStat: "108" })).toBe(true);
    expect(deveEntrarContingencia({ cStat: "109" })).toBe(true);
  });
  it("rejeição de negócio (ex.: 217) NÃO vira contingência", () => {
    expect(deveEntrarContingencia({ cStat: "217" })).toBe(false);
  });
  it("sem erro e sem cStat → não entra", () => {
    expect(deveEntrarContingencia({})).toBe(false);
  });
  it("expõe os códigos de serviço paralisado", () => {
    expect(CSTAT_SERVICO_PARALISADO.has("108")).toBe(true);
    expect(CSTAT_SERVICO_PARALISADO.has("109")).toBe(true);
  });
});

describe("nfceContingenciaDecisao — deveSairContingencia", () => {
  it("autorizada online → sai (SEFAZ voltou)", () => {
    expect(deveSairContingencia({ autorizada: true })).toBe(true);
  });
  it("não-autorizada → permanece", () => {
    expect(deveSairContingencia({ autorizada: false })).toBe(false);
    expect(deveSairContingencia({})).toBe(false);
  });
});

describe("nfceContingenciaDecisao — decidirDesfechoEmissao", () => {
  it("autorizada → status autorizada, sem contingência", () => {
    const d = decidirDesfechoEmissao({ tpEmis: 1, autorizada: true });
    expect(d).toEqual({ status: "autorizada", contingencia: false, motivo: null });
  });

  it("erro de transmissão em online → pendente sem flag de contingência", () => {
    const d = decidirDesfechoEmissao({ tpEmis: 1, erroTransmissao: "SEFAZ fora" });
    expect(d.status).toBe("pendente");
    expect(d.contingencia).toBe(false);
    expect(d.motivo).toBe("sefaz_indisponivel");
  });

  it("contingência (tpEmis=9) não-autorizada → pendente COM flag de contingência", () => {
    const d = decidirDesfechoEmissao({ tpEmis: 9, autorizada: false });
    expect(d.status).toBe("pendente");
    expect(d.contingencia).toBe(true);
    expect(d.motivo).toBe("sefaz_indisponivel");
  });

  it("rejeição de negócio (online, sem erro de transmissão) → rejeitada", () => {
    const d = decidirDesfechoEmissao({ tpEmis: 1, autorizada: false, cStat: "217" });
    expect(d).toEqual({ status: "rejeitada", contingencia: false, motivo: null });
  });
});
