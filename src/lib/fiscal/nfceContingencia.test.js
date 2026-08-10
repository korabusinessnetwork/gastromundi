import { describe, it, expect } from "vitest";
import {
  TP_EMIS,
  CAMPO_QR_DEPENDE_ASSINATURA,
  emContingencia,
  normalizarTpEmis,
  camposFaltantesQrContingencia,
  montarNotaPendenteTransmissao,
} from "./nfceContingencia";

const CHAVE = "43260712345678000195650090000000011900000012";

describe("nfceContingencia — tpEmis", () => {
  it("emContingencia reconhece 9 (offline) e não 1 (normal)", () => {
    expect(emContingencia(9)).toBe(true);
    expect(emContingencia("9")).toBe(true);
    expect(emContingencia(1)).toBe(false);
  });

  it("normalizarTpEmis: vazio → 1; aceita 1 e 9; rejeita o resto", () => {
    expect(normalizarTpEmis(undefined)).toBe(TP_EMIS.NORMAL);
    expect(normalizarTpEmis("")).toBe(1);
    expect(normalizarTpEmis(9)).toBe(9);
    expect(normalizarTpEmis("1")).toBe(1);
    expect(() => normalizarTpEmis(4)).toThrow(/tpEmis/);
  });
});

describe("nfceContingencia — dependência da assinatura (digVal)", () => {
  it("em emissão normal não exige campos de contingência", () => {
    expect(camposFaltantesQrContingencia({ tpEmis: 1 })).toEqual([]);
  });

  it("em contingência sem os campos, aponta o que falta (inclui digVal)", () => {
    const faltam = camposFaltantesQrContingencia({ tpEmis: 9 });
    expect(faltam).toContain(CAMPO_QR_DEPENDE_ASSINATURA); // digVal
    expect(faltam).toEqual(["dhEmi", "vNF", "vICMS", "digVal"]);
  });

  it("com dhEmi/vNF/vICMS presentes, só o digVal (da assinatura) fica pendente", () => {
    const faltam = camposFaltantesQrContingencia({
      tpEmis: 9,
      dhEmi: "2026-07-13T14:00:00-03:00",
      vNF: 35,
      vICMS: 0,
      // digVal ausente — vem da assinatura (PLUG A CHAVE)
    });
    expect(faltam).toEqual(["digVal"]);
  });
});

describe("nfceContingencia — fila de notas a transmitir", () => {
  it("monta o item pendente com status e contadores zerados", () => {
    const item = montarNotaPendenteTransmissao({
      chave: CHAVE,
      tpEmis: 9,
      tpAmb: 2,
      vNF: 35,
      motivo: "sefaz_indisponivel",
      dataEmissao: "2026-07-13T14:00:00Z",
    });
    expect(item.chave).toBe(CHAVE);
    expect(item.tpEmis).toBe(9);
    expect(item.tpAmb).toBe(2);
    expect(item.status).toBe("pendente");
    expect(item.tentativas).toBe(0);
    expect(item.transmitidaEm).toBeNull();
    expect(item.motivo).toBe("sefaz_indisponivel");
    expect(item.criadoEm).toBe("2026-07-13T14:00:00.000Z");
  });

  it("exige a chave de 44 dígitos", () => {
    expect(() => montarNotaPendenteTransmissao({ chave: "123" })).toThrow(/44/);
  });

  it("default de tpEmis na fila é contingência (9), pois é o caso típico da fila", () => {
    const item = montarNotaPendenteTransmissao({ chave: CHAVE });
    expect(item.tpEmis).toBe(9);
  });
});
