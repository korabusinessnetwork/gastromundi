import { describe, it, expect } from "vitest";
import { montarEnvelopeEnviNfe, interpretarRetornoSefaz } from "./nfceSoap";

const NFE = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe43260712345678000195650010000000011000000017"></infNFe><Signature></Signature></NFe>';

describe("nfceSoap — montarEnvelopeEnviNfe", () => {
  it("monta o envelope SOAP 1.2 com enviNFe síncrono e a NFe embutida", () => {
    const env = montarEnvelopeEnviNfe({ xmlAssinado: NFE, idLote: "1", indSinc: 1 });
    expect(env).toContain("soap12:Envelope");
    expect(env).toContain('xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"');
    expect(env).toContain('<enviNFe versao="4.00"');
    expect(env).toContain("<idLote>1</idLote>");
    expect(env).toContain("<indSinc>1</indSinc>");
    expect(env).toContain(NFE);
  });

  it("exige a NFe assinada e um idLote numérico", () => {
    expect(() => montarEnvelopeEnviNfe({ xmlAssinado: "<foo/>", idLote: "1" })).toThrow(/NFe assinada/);
    expect(() => montarEnvelopeEnviNfe({ xmlAssinado: NFE, idLote: "" })).toThrow(/idLote/);
  });
});

describe("nfceSoap — interpretarRetornoSefaz (autorizada)", () => {
  const RETORNO_OK =
    '<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    "<cStat>104</cStat><xMotivo>Lote processado</xMotivo>" +
    "<protNFe versao=\"4.00\"><infProt>" +
    "<chNFe>43260712345678000195650010000000011000000017</chNFe>" +
    "<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>" +
    "<nProt>143260000123456</nProt>" +
    "</infProt></protNFe></retEnviNFe>";

  it("lê o cStat/xMotivo/nProt de dentro do protNFe (não o do lote)", () => {
    const r = interpretarRetornoSefaz(RETORNO_OK);
    expect(r.autorizada).toBe(true);
    expect(r.cStat).toBe("100");
    expect(r.xMotivo).toContain("Autorizado");
    expect(r.protocolo).toBe("143260000123456");
    expect(r.nProt).toBe("143260000123456");
    expect(r.chNFe).toBe("43260712345678000195650010000000011000000017");
  });

  it("monta o nfeProc (NFe assinada + protNFe) quando autorizada", () => {
    const r = interpretarRetornoSefaz(RETORNO_OK, { xmlAssinado: NFE });
    expect(r.nfeProc).toContain("<nfeProc");
    expect(r.nfeProc).toContain(NFE);
    expect(r.nfeProc).toContain("<protNFe");
    expect(r.nfeProc).toContain("<nProt>143260000123456</nProt>");
  });

  it("reconhece 150 (autorizado fora de prazo) como autorizada", () => {
    const r = interpretarRetornoSefaz(RETORNO_OK.replace("<cStat>100</cStat>", "<cStat>150</cStat>"));
    expect(r.autorizada).toBe(true);
    expect(r.cStat).toBe("150");
  });
});

describe("nfceSoap — interpretarRetornoSefaz (rejeitada/denegada)", () => {
  it("rejeição de lote sem protNFe: usa o cStat/xMotivo do retEnviNFe", () => {
    const rej =
      '<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
      "<cStat>225</cStat><xMotivo>Falha no Schema XML</xMotivo></retEnviNFe>";
    const r = interpretarRetornoSefaz(rej, { xmlAssinado: NFE });
    expect(r.autorizada).toBe(false);
    expect(r.cStat).toBe("225");
    expect(r.xMotivo).toContain("Schema");
    expect(r.nfeProc).toBeNull();
    expect(r.protocolo).toBeNull();
  });

  it("denegada no protNFe (cStat 302): autorizada=false com motivo correto", () => {
    const den =
      '<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe"><cStat>104</cStat>' +
      "<protNFe><infProt><cStat>302</cStat><xMotivo>Uso Denegado: Irregularidade fiscal do destinatario</xMotivo>" +
      "<nProt>143260000999999</nProt></infProt></protNFe></retEnviNFe>";
    const r = interpretarRetornoSefaz(den, { xmlAssinado: NFE });
    expect(r.autorizada).toBe(false);
    expect(r.cStat).toBe("302");
    expect(r.xMotivo).toContain("Denegado");
    expect(r.nfeProc).toBeNull();
  });
});
