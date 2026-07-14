import { describe, it, expect } from "vitest";
import {
  podeReimprimir,
  montarResultadoReimpressao,
  descreverEstadoReimpressao,
} from "./nfceReimpressao";

const CHAVE = "43260712345678000195650010000000011000000017";

function registro(over = {}) {
  return {
    venda_id: "v-1",
    chave: CHAVE,
    protocolo: "135260000123456",
    tp_amb: 2,
    tp_emis: 1,
    dh_emi: "2026-07-13T14:00:00.000Z",
    url_qrcode: "https://sefaz.rs.gov.br/nfce?p=X|2|1|1|HASH",
    status: "autorizada",
    ...over,
  };
}

describe("nfceReimpressao — reabrir o cupom da nota guardada (Leva 9)", () => {
  it("podeReimprimir: só autorizada com chave de 44 dígitos", () => {
    expect(podeReimprimir(registro())).toBe(true);
    expect(podeReimprimir(registro({ status: "pendente" }))).toBe(false);
    expect(podeReimprimir(registro({ status: "rejeitada" }))).toBe(false);
    expect(podeReimprimir(registro({ chave: "123" }))).toBe(false);
    expect(podeReimprimir(null)).toBe(false);
  });

  it("montarResultadoReimpressao: mapeia a linha (snake_case) para o resultado da modal", () => {
    const emit = { xNome: "Zé Lanches LTDA", cnpj: "12345678000195" };
    const r = montarResultadoReimpressao(registro(), { emit });
    expect(r.status).toBe("autorizada");
    expect(r.vendaId).toBe("v-1");
    expect(r.chave).toBe(CHAVE);
    expect(r.protocolo).toBe("135260000123456");
    expect(r.tpAmb).toBe(2);
    expect(r.tpEmis).toBe(1);
    expect(r.dhEmi).toBe("2026-07-13T14:00:00.000Z");
    expect(r.urlQrCode).toContain("nfce?p=");
    expect(r.emit).toEqual(emit);
    expect(r.reimpressao).toBe(true);
  });

  it("lança ao tentar reimprimir nota não-autorizada (prevenção de erro)", () => {
    expect(() => montarResultadoReimpressao(registro({ status: "pendente" }))).toThrow(/autorizada/);
  });

  it("emit é null-safe quando não informado", () => {
    const r = montarResultadoReimpressao(registro());
    expect(r.emit).toBeNull();
  });

  it("descreverEstadoReimpressao: texto humano por estado (nada de botão morto)", () => {
    expect(descreverEstadoReimpressao(registro())).toMatch(/pronta para reimprimir/i);
    expect(descreverEstadoReimpressao(registro({ status: "pendente" }))).toMatch(/contingência/i);
    expect(descreverEstadoReimpressao(registro({ status: "rejeitada" }))).toMatch(/rejeitada/i);
    expect(descreverEstadoReimpressao(null)).toMatch(/ainda não tem NFC-e/i);
  });
});
