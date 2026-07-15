import { describe, it, expect } from "vitest";
import { montarItemFiscal } from "./nfceItemFiscal";
import { grupoIcms } from "./nfceXml";

const BASE = {
  ncm: "21069090",
  cfop: "5102",
  origem_mercadoria: "0",
  aliquota_icms: "18",
};

describe("montarItemFiscal — Simples Nacional (CRT 1/2)", () => {
  it("CSOSN 102: só orig + csosn, sem base/valor de ICMS", () => {
    const r = montarItemFiscal(
      { ...BASE, csosn: "102" },
      { crt: 1, qCom: 2, vUnCom: 10, vProd: 20 },
    );
    expect(r.ncm).toBe("21069090");
    expect(r.cfop).toBe("5102");
    expect(r.icms).toEqual({ orig: 0, csosn: "102" });
  });

  it("CSOSN 101: carrega o crédito (pCredSN + vCredICMSSN calculado)", () => {
    const r = montarItemFiscal(
      { ...BASE, csosn: "101", aliquota_icms: "1,5" },
      { crt: 2, qCom: 1, vUnCom: 100, vProd: 100 },
    );
    expect(r.icms).toMatchObject({ orig: 0, csosn: "101", pCredSN: 1.5, vCredICMSSN: 1.5 });
    // o grupo do XML monta sem lançar
    expect(() => grupoIcms(2, r.icms)).not.toThrow();
  });

  it("falta CSOSN no Simples → erro claro nomeando o campo", () => {
    expect(() => montarItemFiscal(BASE, { crt: 1, qCom: 1, vUnCom: 5, vProd: 5 }))
      .toThrow(/CSOSN/);
  });
});

describe("montarItemFiscal — Regime Normal (CRT 3)", () => {
  it("CST 00: calcula vBC e vICMS a partir de vProd e alíquota", () => {
    const r = montarItemFiscal(
      { ...BASE, cst_icms: "00", aliquota_icms: "18" },
      { crt: 3, qCom: 1, vUnCom: 100, vProd: 100 },
    );
    expect(r.icms).toMatchObject({ orig: 0, cst: "00", modBC: 3, vBC: 100, pICMS: 18, vICMS: 18 });
    expect(() => grupoIcms(3, r.icms)).not.toThrow();
  });

  it("CST 00 com redução de base: vBC e vICMS refletem a redução", () => {
    const r = montarItemFiscal(
      { ...BASE, cst_icms: "00", aliquota_icms: "10", reducao_base_icms: "20" },
      { crt: 3, qCom: 1, vUnCom: 50, vProd: 50 },
    );
    // base reduzida em 20% = 40; ICMS 10% de 40 = 4
    expect(r.icms.vBC).toBe(40);
    expect(r.icms.vICMS).toBe(4);
  });

  it("CST 40 (isenta): só orig + cst, sem base/valor", () => {
    const r = montarItemFiscal(
      { ...BASE, cst_icms: "40" },
      { crt: 3, qCom: 1, vUnCom: 9, vProd: 9 },
    );
    expect(r.icms).toEqual({ orig: 0, cst: "40" });
  });

  it("falta CST no Normal → erro claro nomeando o campo", () => {
    expect(() => montarItemFiscal(BASE, { crt: 3, qCom: 1, vUnCom: 5, vProd: 5 }))
      .toThrow(/CST/);
  });
});

describe("montarItemFiscal — validações comuns e PIS/COFINS", () => {
  it("falta NCM → erro claro", () => {
    expect(() => montarItemFiscal({ cfop: "5102", csosn: "102" }, { crt: 1, vProd: 5 }))
      .toThrow(/NCM/);
  });

  it("falta CFOP → erro claro", () => {
    expect(() => montarItemFiscal({ ncm: "21069090", csosn: "102" }, { crt: 1, vProd: 5 }))
      .toThrow(/CFOP/);
  });

  it("CRT inválido → erro claro", () => {
    expect(() => montarItemFiscal(BASE, { crt: 9, vProd: 5 })).toThrow(/CRT/);
  });

  it("PIS/COFINS tributado (01) calcula base e valor; não tributado só o CST", () => {
    const r = montarItemFiscal(
      { ...BASE, csosn: "102", cst_pis: "01", aliquota_pis: "1,65", cst_cofins: "07" },
      { crt: 1, qCom: 1, vUnCom: 100, vProd: 100 },
    );
    expect(r.pis).toMatchObject({ cst: "01", vBC: 100, pPIS: 1.65, vPIS: 1.65 });
    expect(r.cofins).toEqual({ cst: "07" });
  });

  it("CEST incluído só quando cadastrado", () => {
    const semCest = montarItemFiscal({ ...BASE, csosn: "102" }, { crt: 1, vProd: 5 });
    expect(semCest).not.toHaveProperty("cest");
    const comCest = montarItemFiscal({ ...BASE, csosn: "102", cest: "0300100" }, { crt: 1, vProd: 5 });
    expect(comCest.cest).toBe("0300100");
  });
});
