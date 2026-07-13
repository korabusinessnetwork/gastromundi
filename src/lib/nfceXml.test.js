import { describe, it, expect } from "vitest";
import { montarXmlNfce, grupoIcms } from "./nfceXml";
import { montarChaveAcesso } from "./nfce";

// Emitente-base (RS). Reaproveitado nos testes do documento completo.
const emit = {
  cnpj: "12.345.678/0001-95",
  xNome: "Restaurante Exemplo LTDA",
  xFant: "GastroMundi",
  ie: "1234567890",
  crt: 1, // Simples Nacional
  uf: "RS",
  cMun: "4314902", // Porto Alegre
  xMun: "PORTO ALEGRE",
  xLgr: "Av. Ipiranga",
  nro: "100",
  xBairro: "Centro",
  cep: "90000-000",
};

const ide = {
  serie: 1,
  numero: 1,
  dataEmissao: new Date("2026-07-13T13:00:00Z"), // 10:00 em -03:00
  codigoNumerico: 12345678,
  tpAmb: 2,
};

const itemSimples = {
  cProd: "SKU-1",
  xProd: "X-Salada",
  ncm: "21069090",
  cfop: "5102",
  uCom: "UN",
  qCom: 2,
  vUnCom: 10,
  icms: { orig: 0, csosn: 102 },
};

const pagamentos = [{ tPag: "01", vPag: 20 }];

function docBase(over = {}) {
  return {
    ide: { ...ide, ...(over.ide || {}) },
    emit: { ...emit, ...(over.emit || {}) },
    itens: over.itens || [itemSimples],
    pagamentos: over.pagamentos || pagamentos,
    ...over.extra,
  };
}

describe("nfceXml — grupoIcms (regime decide o grupo)", () => {
  it("Simples (CRT 1) → ICMSSN com CSOSN, sem base/valor", () => {
    const xml = grupoIcms(1, { orig: 0, csosn: 102 });
    expect(xml).toBe("<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>");
  });

  it("Simples CSOSN 101 carrega crédito (pCredSN/vCredICMSSN)", () => {
    const xml = grupoIcms(2, { orig: 0, csosn: 101, pCredSN: 2.5, vCredICMSSN: 0.5 });
    expect(xml).toContain("<ICMSSN101>");
    expect(xml).toContain("<pCredSN>2.5000</pCredSN>");
    expect(xml).toContain("<vCredICMSSN>0.50</vCredICMSSN>");
  });

  it("Regime Normal (CRT 3) CST 00 tributado → base, alíquota e valor", () => {
    const xml = grupoIcms(3, { orig: 0, cst: "00", vBC: 100, pICMS: 18, vICMS: 18 });
    expect(xml).toContain("<ICMS00>");
    expect(xml).toContain("<CST>00</CST>");
    expect(xml).toContain("<vBC>100.00</vBC>");
    expect(xml).toContain("<pICMS>18.0000</pICMS>");
    expect(xml).toContain("<vICMS>18.00</vICMS>");
  });

  it("Regime Normal CST 40 (isento) → só orig + CST", () => {
    const xml = grupoIcms(3, { orig: 0, cst: 40 });
    expect(xml).toContain("<ICMS40><orig>0</orig><CST>40</CST></ICMS40>");
  });

  it("Simples sem CSOSN é erro claro (não gera grupo inválido)", () => {
    expect(() => grupoIcms(1, { orig: 0 })).toThrow(/CSOSN/);
  });

  it("Regime Normal sem CST é erro claro", () => {
    expect(() => grupoIcms(3, { orig: 0, cst: "" })).toThrow(/CST/);
  });
});

describe("nfceXml — montarXmlNfce (documento completo)", () => {
  it("produz <NFe> com namespace e <infNFe> Id/versão corretos", () => {
    const { xml, chave } = montarXmlNfce(docBase());
    expect(xml).toContain('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain(`<infNFe Id="NFe${chave}" versao="4.00">`);
    expect(chave).toHaveLength(44);
  });

  it("a chave do XML é a mesma que a Leva 1 monta com os mesmos dados", () => {
    const { chave } = montarXmlNfce(docBase());
    const esperada = montarChaveAcesso({
      uf: emit.uf,
      dataEmissao: ide.dataEmissao,
      cnpj: emit.cnpj,
      modelo: 65,
      serie: ide.serie,
      numero: ide.numero,
      tpEmis: 1,
      codigoNumerico: ide.codigoNumerico,
    });
    expect(chave).toBe(esperada);
  });

  it("ide traz mod 65, tpAmb, cUF e cDV coerentes com a chave", () => {
    const { xml, chave } = montarXmlNfce(docBase());
    expect(xml).toContain("<mod>65</mod>");
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain(`<cUF>${chave.slice(0, 2)}</cUF>`);
    expect(xml).toContain(`<cDV>${chave[43]}</cDV>`);
    expect(xml).toContain(`<cNF>${chave.slice(35, 43)}</cNF>`);
  });

  it("dhEmi sai com offset -03:00 e é determinística (independe do TZ)", () => {
    const { xml } = montarXmlNfce(docBase());
    expect(xml).toContain("<dhEmi>2026-07-13T10:00:00-03:00</dhEmi>");
  });

  it("emit leva CNPJ/IE só com dígitos e o CRT do tenant", () => {
    const { xml } = montarXmlNfce(docBase());
    expect(xml).toContain("<CNPJ>12345678000195</CNPJ>");
    expect(xml).toContain("<IE>1234567890</IE>");
    expect(xml).toContain("<CRT>1</CRT>");
    expect(xml).toContain("<CEP>90000000</CEP>");
  });

  it("tpAmb default é 2 (homologação) quando não informado", () => {
    const { xml } = montarXmlNfce(docBase({ ide: { tpAmb: undefined } }));
    expect(xml).toContain("<tpAmb>2</tpAmb>");
  });

  it("total ICMSTot soma vProd e vNF dos itens", () => {
    const { xml } = montarXmlNfce(
      docBase({ itens: [itemSimples, { ...itemSimples, qCom: 1, vUnCom: 5 }] }),
    );
    // 2*10 + 1*5 = 25
    expect(xml).toContain("<vProd>25.00</vProd>");
    expect(xml).toContain("<vNF>25.00</vNF>");
  });

  it("desconto no item reduz o vNF total", () => {
    const { xml } = montarXmlNfce(
      docBase({ itens: [{ ...itemSimples, vDesc: 5 }] }),
    );
    expect(xml).toContain("<vDesc>5.00</vDesc>");
    expect(xml).toContain("<vNF>15.00</vNF>"); // 20 - 5
  });

  it("pag é obrigatório e monta detPag com tPag/vPag", () => {
    const { xml } = montarXmlNfce(docBase());
    expect(xml).toContain("<pag><detPag><tPag>01</tPag><vPag>20.00</vPag></detPag></pag>");
  });

  it("troco em dinheiro aparece como vTroco somado", () => {
    const { xml } = montarXmlNfce(
      docBase({ pagamentos: [{ tPag: "01", vPag: 50, vTroco: 30 }] }),
    );
    expect(xml).toContain("<vTroco>30.00</vTroco>");
  });

  it("dest é OMITIDO quando não há CPF/CNPJ do consumidor (NFC-e anônima)", () => {
    const { xml } = montarXmlNfce(docBase());
    expect(xml).not.toContain("<dest>");
  });

  it("dest aparece com CPF quando o consumidor se identifica", () => {
    const { xml } = montarXmlNfce(
      docBase({ extra: { dest: { cpf: "111.444.777-35", xNome: "Fulano" } } }),
    );
    expect(xml).toContain("<dest><CPF>11144477735</CPF>");
    expect(xml).toContain("<indIEDest>9</indIEDest>");
  });

  it("escapa caracteres especiais de XML nos textos", () => {
    const { xml } = montarXmlNfce(
      docBase({ itens: [{ ...itemSimples, xProd: "Pão & Cia <100%>" }] }),
    );
    expect(xml).toContain("Pão &amp; Cia &lt;100%&gt;");
    expect(xml).not.toContain("Pão & Cia <100%>");
  });

  it("um item do Simples embute o grupo ICMSSN correspondente", () => {
    const { xml } = montarXmlNfce(docBase());
    expect(xml).toContain("<ICMSSN102>");
    expect(xml).toContain("<CSOSN>102</CSOSN>");
  });

  it("um cliente do Regime Normal (CRT 3) gera ICMS/CST — mesmo código", () => {
    const { xml } = montarXmlNfce(
      docBase({
        emit: { crt: 3 },
        itens: [{ ...itemSimples, icms: { orig: 0, cst: "00", vBC: 20, pICMS: 18, vICMS: 3.6 } }],
      }),
    );
    expect(xml).toContain("<ICMS00>");
    expect(xml).toContain("<CST>00</CST>");
    expect(xml).not.toContain("ICMSSN");
  });

  it("exige ao menos um item", () => {
    expect(() => montarXmlNfce(docBase({ itens: [] }))).toThrow(/item/);
  });

  it("exige ao menos uma forma de pagamento", () => {
    expect(() => montarXmlNfce(docBase({ pagamentos: [] }))).toThrow(/pagamento/);
  });

  it("exige o CRT do emitente (regime tributário)", () => {
    expect(() => montarXmlNfce(docBase({ emit: { crt: undefined } }))).toThrow(/crt/i);
  });
});
