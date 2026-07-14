/**
 * Testes do núcleo de assinatura XML-DSig da NFC-e (Leva 6, parte pura).
 *
 * FIXTURE DE TESTE (certificado FAKE, auto-assinado — NÃO é o A1 real, é só
 * para provar a corretude criptográfica; nunca use em produção). Gerado com
 * OpenSSL 3.x (o `-legacy` deixa o .pfx legível pelo node-forge):
 *
 *   openssl req -x509 -newkey rsa:2048 -keyout nfce-teste.key.pem \
 *     -out nfce-teste.cert.pem -days 3650 -nodes -sha1 \
 *     -subj "/C=BR/ST=RS/O=CERTIFICADO DE TESTE GASTROMUNDI/CN=NFCe TESTE FAKE"
 *   openssl pkcs12 -export -legacy -inkey nfce-teste.key.pem \
 *     -in nfce-teste.cert.pem -passout pass:teste123 -out nfce-teste.pfx \
 *     -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
 *
 * O RSA-sign entra pelo MESMO callback que a Edge Function usa — o módulo
 * nfceAssinatura NUNCA vê a chave privada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import forge from "node-forge";
import {
  canonicalizarInfNfe,
  digestInfNfe,
  montarSignedInfo,
  montarAssinatura,
  assinarInfNfe,
  assinarInfEvento,
} from "./nfceAssinatura";
import { montarXmlNfce } from "./nfceXml";
import { montarXmlEventoCancelamento } from "./nfceEventoCancelamento";

const dir = fileURLToPath(new URL("./__fixtures__/", import.meta.url));
const certPem = readFileSync(dir + "nfce-teste.cert.pem", "utf8");
const keyPem = readFileSync(dir + "nfce-teste.key.pem", "utf8");
const chavePrivada = forge.pki.privateKeyFromPem(keyPem);
const certificado = forge.pki.certificateFromPem(certPem);
const certX509Base64 = forge.util.encode64(
  forge.asn1.toDer(forge.pki.certificateToAsn1(certificado)).getBytes(),
);

/** O MESMO shape do callback que a Edge injeta (RSA-SHA1 com a chave). */
function assinarComForge(signedInfoC14n) {
  const md = forge.md.sha1.create();
  md.update(signedInfoC14n, "utf8");
  const signatureBytes = chavePrivada.sign(md); // RSASSA-PKCS1-v1_5 + SHA1
  return { signatureValue: forge.util.encode64(signatureBytes), certificadoX509Base64: certX509Base64 };
}

function xmlDeTeste(xProd = "X-Salada") {
  return montarXmlNfce({
    ide: { serie: 1, numero: 1, dataEmissao: new Date("2026-07-13T13:00:00Z"), codigoNumerico: "12345678", tpAmb: 2 },
    emit: {
      cnpj: "12345678000195", xNome: "TESTE LTDA", ie: "1234567890", crt: 1,
      uf: "RS", cMun: "4314902", xMun: "PORTO ALEGRE", xLgr: "RUA X", nro: "10",
      xBairro: "CENTRO", cep: "90000000",
    },
    itens: [{ cProd: "p1", xProd, qCom: 1, uCom: "UN", vUnCom: 10, vProd: 10, ncm: "21069090", cfop: "5102", icms: { orig: 0, csosn: "102" } }],
    pagamentos: [{ tPag: "01", vPag: 10 }],
  });
}

describe("nfceAssinatura — canonicalização (C14N 1.0) do infNFe", () => {
  it("declara o namespace default da NFe no ápice <infNFe>", () => {
    const { xml } = xmlDeTeste();
    const c14n = canonicalizarInfNfe(xml);
    expect(c14n.startsWith('<infNFe xmlns="http://www.portalfiscal.inf.br/nfe" Id="NFe')).toBe(true);
    expect(c14n.endsWith("</infNFe>")).toBe(true);
  });

  it("elementos vazios ficam <x></x> (nunca self-closing) e sem prefixos herdados", () => {
    const { xml } = xmlDeTeste();
    const c14n = canonicalizarInfNfe(xml);
    expect(c14n).not.toContain("/>");
    // filhos não repetem o xmlns (herdam do ápice)
    expect(c14n.match(/xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"/g)).toHaveLength(1);
  });

  it("apóstrofo volta a literal (&apos; do gerador → ' na C14N 1.0)", () => {
    const { xml } = xmlDeTeste("AGUA D'COCO");
    expect(xml).toContain("&apos;"); // o gerador escapa
    const c14n = canonicalizarInfNfe(xml);
    expect(c14n).toContain("AGUA D'COCO"); // C14N mantém literal
    expect(c14n).not.toContain("&apos;");
  });
});

describe("nfceAssinatura — digest", () => {
  it("DigestValue é estável (mesmo XML → mesmo digest) e é Base64", async () => {
    const { xml } = xmlDeTeste();
    const a = await digestInfNfe(xml);
    const b = await digestInfNfe(xml);
    expect(a.digestValue).toBe(b.digestValue);
    expect(a.digestValue).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // SHA-1 = 20 bytes → 28 chars Base64
    expect(a.digestValue).toHaveLength(28);
  });

  it("mudar o conteúdo do infNFe muda o DigestValue", async () => {
    const a = await digestInfNfe(xmlDeTeste("Item A").xml);
    const b = await digestInfNfe(xmlDeTeste("Item B").xml);
    expect(a.digestValue).not.toBe(b.digestValue);
  });
});

describe("nfceAssinatura — SignedInfo e Signature", () => {
  it("SignedInfo exige referenceUri #NFe<44> e carrega os algoritmos NFe 4.00", async () => {
    const { xml } = xmlDeTeste();
    const { digestValue } = await digestInfNfe(xml);
    const chave = xml.match(/Id="NFe(\d{44})"/)[1];
    const si = montarSignedInfo({ referenceUri: `#NFe${chave}`, digestValue });
    expect(si).toContain(`URI="#NFe${chave}"`);
    expect(si).toContain("REC-xml-c14n-20010315");
    expect(si).toContain("#rsa-sha1");
    expect(si).toContain("#enveloped-signature");
    expect(si).toContain(`<DigestValue>${digestValue}</DigestValue>`);
    expect(() => montarSignedInfo({ referenceUri: "#semNFe", digestValue })).toThrow(/referenceUri/);
  });

  it("montarAssinatura valida presença de signatureValue e certificado", () => {
    expect(() => montarAssinatura({ signedInfo: "<SignedInfo/>", signatureValue: "", certificadoX509Base64: "x" }))
      .toThrow(/SignatureValue/);
  });
});

describe("nfceAssinatura — assinarInfNfe (fluxo completo com cert de teste)", () => {
  it("assina, insere infNFeSupl e Signature, e a assinatura VALIDA contra o certificado", async () => {
    const { xml } = xmlDeTeste();
    const chave = xml.match(/Id="NFe(\d{44})"/)[1];
    const supl = `<infNFeSupl><qrCode>http://x/qr?p=1</qrCode><urlChave>http://x/chave</urlChave></infNFeSupl>`;

    let signedInfoAssinado;
    const { xmlAssinado, digestValue } = await assinarInfNfe(xml, {
      infNFeSupl: supl,
      assinarSignedInfo: (si) => { signedInfoAssinado = si; return assinarComForge(si); },
    });

    // Estrutura: Signature bem-formada, na ordem infNFe · infNFeSupl · Signature.
    expect(xmlAssinado).toContain("<infNFeSupl>");
    expect(xmlAssinado.indexOf("</infNFe>")).toBeLessThan(xmlAssinado.indexOf("<infNFeSupl>"));
    expect(xmlAssinado.indexOf("<infNFeSupl>")).toBeLessThan(xmlAssinado.indexOf("<Signature"));
    expect(xmlAssinado).toContain(`URI="#NFe${chave}"`);
    expect(xmlAssinado).toContain("<X509Certificate>");
    expect(xmlAssinado.endsWith("</Signature></NFe>")).toBe(true);

    // Corretude criptográfica: RSA-SHA1(SignedInfo) valida com a pública do cert.
    const signatureValue = xmlAssinado.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)[1];
    const md = forge.md.sha1.create();
    md.update(signedInfoAssinado, "utf8");
    const ok = certificado.publicKey.verify(md.digest().bytes(), forge.util.decode64(signatureValue));
    expect(ok).toBe(true);

    // O digestValue devolvido é o insumo do digVal do QR de contingência.
    expect(xmlAssinado).toContain(`<DigestValue>${digestValue}</DigestValue>`);
  });

  it("exige o callback assinarSignedInfo (a chave nunca vem do módulo)", async () => {
    await expect(assinarInfNfe(xmlDeTeste().xml, {})).rejects.toThrow(/assinarSignedInfo/);
  });
});

describe("nfceAssinatura — assinarInfEvento (cancelamento, Leva 10)", () => {
  const chave = "43260712345678000195650010000000011000000017";

  it("assina o <infEvento> (#ID110111…), com a Signature DENTRO do <evento>", async () => {
    const { xml } = montarXmlEventoCancelamento({
      chave, protocolo: "143260000123456", cnpj: "12345678000195", tpAmb: 2,
      justificativa: "Cliente desistiu da compra e pediu o cancelamento.",
    });

    let signedInfoAssinado;
    const { xmlAssinado } = await assinarInfEvento(xml, {
      assinarSignedInfo: (si) => { signedInfoAssinado = si; return assinarComForge(si); },
    });

    // Reference aponta para o Id do infEvento; Signature após </infEvento>,
    // ainda dentro de </evento>.
    expect(xmlAssinado).toContain(`URI="#ID110111${chave}01"`);
    expect(xmlAssinado.indexOf("</infEvento>")).toBeLessThan(xmlAssinado.indexOf("<Signature"));
    expect(xmlAssinado.endsWith("</Signature></evento>")).toBe(true);

    // Corretude criptográfica: RSA-SHA1(SignedInfo) valida com a pública do cert.
    const signatureValue = xmlAssinado.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)[1];
    const md = forge.md.sha1.create();
    md.update(signedInfoAssinado, "utf8");
    const ok = certificado.publicKey.verify(md.digest().bytes(), forge.util.decode64(signatureValue));
    expect(ok).toBe(true);
  });

  it("exige o callback assinarSignedInfo", async () => {
    const { xml } = montarXmlEventoCancelamento({
      chave, protocolo: "143260000123456", cnpj: "12345678000195", tpAmb: 2,
      justificativa: "Cliente desistiu da compra e pediu o cancelamento.",
    });
    await expect(assinarInfEvento(xml, {})).rejects.toThrow(/assinarSignedInfo/);
  });
});
