import { describe, it, expect } from "vitest";
import { montarRegistroNfceEmitida } from "./nfceRegistro";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CHAVE = "43260712345678000195650010000000011000000017";

function base(over = {}) {
  return {
    tenantId: TENANT,
    vendaId: "v-1",
    chave: CHAVE,
    numero: 1,
    serie: 1,
    status: "autorizada",
    tpAmb: 1,
    tpEmis: 1,
    protocolo: "135260000123456",
    cStat: "100",
    xMotivo: "Autorizado o uso da NF-e",
    vNF: "30.00",
    dhEmi: "2026-07-13T14:00:00Z",
    urlQrCode: "https://sefaz.rs.gov.br/nfce?p=X|2|1|1|HASH",
    xmlProc: "<nfeProc>…</nfeProc>",
    ...over,
  };
}

describe("montarRegistroNfceEmitida — normalização/validação", () => {
  it("autorizada: guarda o nfeProc como xml (xml_tipo='proc') e marca transmitida_em", () => {
    const r = montarRegistroNfceEmitida(base());
    expect(r.tenant_id).toBe(TENANT);
    expect(r.venda_id).toBe("v-1");
    expect(r.status).toBe("autorizada");
    expect(r.xml).toBe("<nfeProc>…</nfeProc>");
    expect(r.xml_tipo).toBe("proc");
    expect(r.transmitida_em).toBe("2026-07-13T14:00:00.000Z");
    expect(r.tentativas).toBe(0);
  });

  it("rejeitada: sem nfeProc, xml null e transmitida_em null (só trilha)", () => {
    const r = montarRegistroNfceEmitida(base({ status: "rejeitada", xmlProc: null, protocolo: null, cStat: "217", xMotivo: "NF-e não consta" }));
    expect(r.status).toBe("rejeitada");
    expect(r.xml).toBeNull();
    expect(r.xml_tipo).toBeNull();
    expect(r.transmitida_em).toBeNull();
    expect(r.c_stat).toBe("217");
  });

  it("rejeita status fora do conjunto do CHECK", () => {
    expect(() => montarRegistroNfceEmitida(base({ status: "enviada" }))).toThrow(/status inválido/);
  });

  it("rejeita chave com tamanho ≠ 44", () => {
    expect(() => montarRegistroNfceEmitida(base({ chave: "123" }))).toThrow(/44 dígitos/);
  });

  it("exige o tenantId", () => {
    expect(() => montarRegistroNfceEmitida(base({ tenantId: "" }))).toThrow(/tenantId/);
  });

  it("chave com máscara é normalizada para só dígitos", () => {
    const mascarada = CHAVE.replace(/(\d{4})/g, "$1 ").trim();
    const r = montarRegistroNfceEmitida(base({ chave: mascarada }));
    expect(r.chave).toBe(CHAVE);
  });

  it("dhEmi vira ISO; vNF numérico; tpAmb default 2 quando não é 1", () => {
    const r = montarRegistroNfceEmitida(base({ dhEmi: new Date("2026-01-02T03:04:05Z"), vNF: "12.5", tpAmb: 9 }));
    expect(r.dh_emi).toBe("2026-01-02T03:04:05.000Z");
    expect(r.v_nf).toBe(12.5);
    expect(r.tp_amb).toBe(2);
  });

  it("campos opcionais são null-safe (venda_id, protocolo, numero, vNF, dhEmi)", () => {
    const r = montarRegistroNfceEmitida({ tenantId: TENANT, chave: CHAVE, status: "autorizada", xmlProc: "<nfeProc/>" });
    expect(r.venda_id).toBeNull();
    expect(r.protocolo).toBeNull();
    expect(r.numero).toBeNull();
    expect(r.serie).toBeNull();
    expect(r.v_nf).toBeNull();
    expect(r.dh_emi).toBeNull();
    // autorizada sem dhEmi ainda registra a transmissão (fallback "agora")
    expect(typeof r.transmitida_em).toBe("string");
  });

  it("tp_emis normaliza para 1 ou 9", () => {
    expect(montarRegistroNfceEmitida(base({ tpEmis: 9 })).tp_emis).toBe(9);
    expect(montarRegistroNfceEmitida(base({ tpEmis: 5 })).tp_emis).toBe(1);
  });
});
