import { describe, it, expect } from "vitest";
import {
  intervaloDoMes,
  intervaloMesPassado,
  intervaloUltimosDias,
  intervaloDoAno,
  detectarPreset,
  PRESETS_PERIODO,
} from "./periodos";

// Referência fixa: 2026-07-15 (meio de julho, ano não bissexto para fevereiro).
const REF = new Date(2026, 6, 15);

describe("intervaloDoMes", () => {
  it("cobre do dia 1 ao último dia do mês da referência", () => {
    expect(intervaloDoMes(REF)).toEqual({ de: "2026-07-01", ate: "2026-07-31" });
  });

  it("acerta o último dia de fevereiro (não bissexto)", () => {
    expect(intervaloDoMes(new Date(2026, 1, 10))).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });

  it("acerta o último dia de fevereiro (bissexto)", () => {
    expect(intervaloDoMes(new Date(2024, 1, 10))).toEqual({ de: "2024-02-01", ate: "2024-02-29" });
  });
});

describe("intervaloMesPassado", () => {
  it("cobre o mês anterior inteiro", () => {
    expect(intervaloMesPassado(REF)).toEqual({ de: "2026-06-01", ate: "2026-06-30" });
  });

  it("vira o ano quando a referência é janeiro", () => {
    expect(intervaloMesPassado(new Date(2026, 0, 10))).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
  });
});

describe("intervaloUltimosDias", () => {
  it("inclui hoje e os n-1 dias anteriores", () => {
    expect(intervaloUltimosDias(7, REF)).toEqual({ de: "2026-07-09", ate: "2026-07-15" });
  });

  it("atravessa a virada de mês", () => {
    expect(intervaloUltimosDias(7, new Date(2026, 6, 3))).toEqual({ de: "2026-06-27", ate: "2026-07-03" });
  });
});

describe("intervaloDoAno", () => {
  it("cobre 1º de janeiro a 31 de dezembro", () => {
    expect(intervaloDoAno(REF)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
  });
});

describe("detectarPreset", () => {
  it("reconhece cada preset a partir do seu próprio intervalo", () => {
    for (const p of PRESETS_PERIODO) {
      expect(detectarPreset(p.intervalo(REF), REF)).toBe(p.chave);
    }
  });

  it("devolve 'personalizado' para um intervalo à mão", () => {
    expect(detectarPreset({ de: "2026-07-03", ate: "2026-07-19" }, REF)).toBe("personalizado");
  });

  it("devolve 'personalizado' quando o período é nulo", () => {
    expect(detectarPreset(null, REF)).toBe("personalizado");
  });
});
