import { describe, it, expect } from "vitest";
import {
  montarXmlInutilizacao,
  decidirDesfechoInutilizacao,
} from "./nfceInutilizacao";

const CNPJ = "12345678000195";
const JUST = "Falha técnica pulou a numeração; faixa nunca emitida.";

describe("nfceInutilizacao — montarXmlInutilizacao", () => {
  it("monta o <inutNFe>/<infInut Id=ID...> com Id de 41 dígitos e todos os campos", () => {
    const { xml, id } = montarXmlInutilizacao({
      cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 45, nNFFin: 48,
      ano: 26, cUF: 43, justificativa: JUST,
    });
    // Id = ID + cUF(2) + ano(2) + CNPJ(14) + mod(2) + serie(3) + ini(9) + fin(9)
    expect(id).toBe("ID43261234567800019565001000000045000000048");
    expect(id.length).toBe(2 + 41); // "ID" + 41 dígitos
    expect(xml).toContain('<inutNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain(`<infInut Id="${id}">`);
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain("<xServ>INUTILIZACAO</xServ>");
    expect(xml).toContain("<cUF>43</cUF>");
    expect(xml).toContain("<ano>26</ano>");
    expect(xml).toContain(`<CNPJ>${CNPJ}</CNPJ>`);
    expect(xml).toContain("<mod>65</mod>");
    expect(xml).toContain("<serie>1</serie>");
    expect(xml).toContain("<nNFIni>45</nNFIni>");
    expect(xml).toContain("<nNFFin>48</nNFFin>");
    expect(xml).toContain(`<xJust>${JUST}</xJust>`);
  });

  it("deriva o ano (2 dígitos) do relógio quando não informado", () => {
    const { xml } = montarXmlInutilizacao({
      cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: JUST,
    });
    const aa = String(new Date().getFullYear()).slice(-2);
    expect(xml).toContain(`<ano>${aa}</ano>`);
  });

  it("valida CNPJ (14 dígitos) e cUF (2 dígitos)", () => {
    expect(() => montarXmlInutilizacao({ cnpj: "123", tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: JUST }))
      .toThrow(/CNPJ/);
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: "4", justificativa: JUST }))
      .toThrow(/cUF/);
  });

  it("valida tpAmb e série (0–999)", () => {
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 3, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: JUST }))
      .toThrow(/tpAmb/);
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1000, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: JUST }))
      .toThrow(/série/);
  });

  it("exige faixa coerente (nNFFin ≥ nNFIni, ambos ≥ 1)", () => {
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 0, nNFFin: 1, cUF: 43, justificativa: JUST }))
      .toThrow(/nNFIni/);
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 50, nNFFin: 40, cUF: 43, justificativa: JUST }))
      .toThrow(/final deve ser ≥/);
  });

  it("exige justificativa entre 15 e 255 caracteres", () => {
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: "curta" }))
      .toThrow(/15 e 255/);
    expect(() => montarXmlInutilizacao({ cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43, justificativa: "x".repeat(256) }))
      .toThrow(/15 e 255/);
  });

  it("escapa caracteres especiais na justificativa", () => {
    const { xml } = montarXmlInutilizacao({
      cnpj: CNPJ, tpAmb: 2, serie: 1, nNFIni: 1, nNFFin: 1, cUF: 43,
      justificativa: "Pulo de numeração <falha> & sistema fora do ar.",
    });
    expect(xml).toContain("&lt;falha&gt; &amp; sistema");
  });
});

describe("nfceInutilizacao — decidirDesfechoInutilizacao", () => {
  it("cStat 102 → inutilizada, carrega protocolo e procInutNFe", () => {
    const d = decidirDesfechoInutilizacao({
      retornoInterpretado: {
        homologada: true, cStat: "102", xMotivo: "Inutilização de número homologada",
        protocolo: "143260000999999", procInutNFe: "<procInutNFe>…</procInutNFe>",
      },
    });
    expect(d.status).toBe("inutilizada");
    expect(d.homologada).toBe(true);
    expect(d.protocolo).toBe("143260000999999");
    expect(d.procInutNFe).toContain("procInutNFe");
    expect(d.motivo).toBeNull();
  });

  it("rejeição da SEFAZ (ex.: 241 faixa já inutilizada) → rejeitada, guarda motivo", () => {
    const d = decidirDesfechoInutilizacao({
      retornoInterpretado: { cStat: "241", xMotivo: "Um número da faixa já foi inutilizado" },
    });
    expect(d.status).toBe("rejeitada");
    expect(d.homologada).toBe(false);
    expect(d.cStat).toBe("241");
    expect(d.motivo).toContain("rejeicao: 241");
  });

  it("erro de transmissão → rejeitada, motivo sem vazar segredo", () => {
    const d = decidirDesfechoInutilizacao({ erroTransmissao: "TLS handshake falhou" });
    expect(d.status).toBe("rejeitada");
    expect(d.homologada).toBe(false);
    expect(d.motivo).toContain("falha_transmissao");
    expect(d.procInutNFe).toBeNull();
  });

  it("sem retorno e sem erro → defensivo, não inutiliza", () => {
    const d = decidirDesfechoInutilizacao({});
    expect(d.homologada).toBe(false);
    expect(d.motivo).toBe("sem_retorno_interpretavel");
  });
});
