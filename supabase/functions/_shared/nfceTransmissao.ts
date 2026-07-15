/**
 * NFC-e (modelo 65) — transmissão à SEFAZ compartilhada (Leva 9).
 *
 * Extraído de emitir-nfce para ser reusado pela reenviar-nfce (worker de
 * contingência) SEM duplicar a lógica que toca no certificado. Estas são as
 * ÚNICAS funções que abrem o A1 (.pfx) e fazem o TLS mútuo — vivem só aqui
 * na borda (Edge), nunca em src/lib, nunca no front.
 *
 * ┌─ PLUG A CHAVE ────────────────────────────────────────────────────┐
 * │ assinarXmlDSig() e transmitirSefazRS() só fecham de verdade com o  │
 * │ A1 real + a SEFAZ (TLS mútuo). Sem o certificado, emitir-nfce nem  │
 * │ chega aqui (barra antes) e reenviar-nfce varre a fila e devolve o  │
 * │ resumo sem autorizar nenhuma — comportamento esperado.            │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * SECRET BOUNDARY: certBase64/certSenha entram como parâmetro e NUNCA saem
 * (nem em log, nem em retorno). O resultado é só documento público (cStat,
 * xMotivo, protocolo, nfeProc, dhRecbto).
 */

// node-forge: PKCS#12 (.pfx) + RSA-SHA1 — pura, roda no Deno.
import forge from "https://esm.sh/node-forge@1.3.1";
import {
  montarEnvelopeEnviNfe,
  interpretarRetornoSefaz,
  montarEnvelopeEvento,
  interpretarRetornoEvento,
  montarEnvelopeInutilizacao,
  interpretarRetornoInutilizacao,
} from "../../../src/lib/nfceSoap.js";
import { assinarInfNfe, assinarInfEvento, assinarInfInut } from "../../../src/lib/nfceAssinatura.js";

/**
 * Abre o PKCS#12 (.pfx base64) com a senha e extrai a chave privada e o
 * certificado X509. É a ÚNICA função que toca no SEGREDO (chave privada);
 * o resultado NUNCA sai da Edge nem vai para log.
 */
export function abrirCertificadoA1(certBase64: string, certSenha: string) {
  const der = forge.util.decode64(certBase64);
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), certSenha);
  let privateKey: unknown = null;
  let certificate: unknown = null;
  for (const sc of p12.safeContents) {
    for (const bag of sc.safeBags) {
      if (bag.key) privateKey = bag.key;
      if (bag.cert) certificate = bag.cert;
    }
  }
  if (!privateKey || !certificate) {
    throw new Error("Certificado A1 inválido: PKCS#12 sem chave privada ou sem certificado.");
  }
  return { privateKey, certificate };
}

/**
 * Assina o <infNFe> (XML-DSig enveloped, RSA-SHA1) com o certificado A1 e
 * insere o <infNFeSupl> (QR) + a <Signature>. O RSA-sign com a chave privada
 * acontece SÓ aqui, no callback — a chave nunca entra em src/lib.
 */
export async function assinarXmlDSig(
  xml: string,
  { certBase64, certSenha, infNFeSupl }: { certBase64: string; certSenha: string; infNFeSupl: string },
): Promise<{ xmlAssinado: string; digestValue: string }> {
  const assinarSignedInfo = criarCallbackRsaSha1(certBase64, certSenha);
  return await assinarInfNfe(xml, { assinarSignedInfo, infNFeSupl });
}

/**
 * Assina o <infEvento> do evento de CANCELAMENTO (Leva 10) com o A1, reusando
 * o MESMO callback RSA-SHA1 da NFe (a chave privada só entra no callback,
 * aqui na Edge). Sem duplicar a lógica de assinatura.
 */
export async function assinarEventoDSig(
  xml: string,
  { certBase64, certSenha }: { certBase64: string; certSenha: string },
): Promise<{ xmlAssinado: string; digestValue: string }> {
  const assinarSignedInfo = criarCallbackRsaSha1(certBase64, certSenha);
  return await assinarInfEvento(xml, { assinarSignedInfo });
}

/**
 * Assina o <infInut> da INUTILIZAÇÃO de numeração (Leva 11) com o A1, reusando
 * o MESMO callback RSA-SHA1 da NFe (a chave privada só entra no callback, aqui
 * na Edge). Sem duplicar a lógica de assinatura.
 */
export async function assinarInutDSig(
  xmlInut: string,
  { certBase64, certSenha }: { certBase64: string; certSenha: string },
): Promise<{ xmlAssinado: string; digestValue: string }> {
  const assinarSignedInfo = criarCallbackRsaSha1(certBase64, certSenha);
  return await assinarInfInut(xmlInut, { assinarSignedInfo });
}

/**
 * Cria o callback RSA-SHA1 que o núcleo puro (nfceAssinatura) injeta para
 * assinar o <SignedInfo>. A chave privada do A1 vive SÓ dentro deste closure,
 * na Edge — nunca sai para src/lib nem para log/retorno.
 */
function criarCallbackRsaSha1(certBase64: string, certSenha: string) {
  const { privateKey, certificate } = abrirCertificadoA1(certBase64, certSenha);
  const certX509Base64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
  );
  return (signedInfoC14n: string) => {
    const md = forge.md.sha1.create();
    md.update(signedInfoC14n, "utf8");
    return {
      signatureValue: forge.util.encode64((privateKey as { sign: (m: unknown) => string }).sign(md)),
      certificadoX509Base64: certX509Base64,
    };
  };
}

/**
 * Transmite o XML assinado à SEFAZ-RS (NFeAutorizacao4, síncrono) por SOAP
 * sobre TLS MÚTUO com o mesmo certificado A1, e interpreta o retorno.
 *
 * Devolve também o `dhRecbto` do protocolo (data/hora REAL do recebimento
 * pela SEFAZ) — é o carimbo correto de "transmitida_em" no reenvio (Leva 9),
 * mais preciso que o dhEmi da nota.
 */
export async function transmitirSefazRS(
  xmlAssinado: string,
  { urlAutorizacao, certBase64, certSenha }: { urlAutorizacao: string; certBase64: string; certSenha: string },
): Promise<{
  autorizada: boolean; cStat: string | null; xMotivo: string | null;
  protocolo: string | null; nfeProc: string | null; dhRecbto: string | null;
}> {
  if (!urlAutorizacao) throw new Error("URL de autorização da SEFAZ ausente na configuração do tenant.");

  const envelope = montarEnvelopeEnviNfe({
    xmlAssinado,
    idLote: Date.now().toString().slice(-15), // lote numérico único
    indSinc: 1,
  });

  // TLS mútuo: o A1 (em PEM) autentica o cliente no handshake com a SEFAZ.
  const { privateKey, certificate } = abrirCertificadoA1(certBase64, certSenha);
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  const certPem = forge.pki.certificateToPem(certificate);

  const client = (globalThis as { Deno?: { createHttpClient: (o: unknown) => unknown } })
    .Deno!.createHttpClient({ cert: certPem, key: keyPem });

  const resp = await fetch(urlAutorizacao, {
    method: "POST",
    // @ts-ignore client é opção específica do Deno fetch
    client,
    headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
    body: envelope,
  });
  const textoResposta = await resp.text();

  const retorno = interpretarRetornoSefaz(textoResposta, { xmlAssinado });
  // dhRecbto vem do <infProt> do protocolo — carimbo real da SEFAZ.
  const dhRecbto = textoResposta.match(/<(?:\w+:)?dhRecbto>([^<]+)<\/(?:\w+:)?dhRecbto>/)?.[1] ?? null;
  return {
    autorizada: retorno.autorizada,
    cStat: retorno.cStat,
    xMotivo: retorno.xMotivo,
    protocolo: retorno.protocolo,
    nfeProc: retorno.nfeProc, // documento final autorizado (para reimpressão)
    dhRecbto,
  };
}

/**
 * Transmite o EVENTO de cancelamento assinado à SEFAZ-RS (NFeRecepcaoEvento4)
 * por SOAP sobre TLS MÚTUO com o mesmo A1, e interpreta o retorno. Devolve o
 * procEventoNFe (documento durável do cancelamento) quando registrado.
 *
 * SECRET BOUNDARY: certBase64/certSenha entram como parâmetro e nunca saem.
 */
export async function transmitirEventoSefazRS(
  xmlEventoAssinado: string,
  { urlRecepcaoEvento, certBase64, certSenha }:
    { urlRecepcaoEvento: string; certBase64: string; certSenha: string },
): Promise<{
  registrado: boolean; cStat: string | null; xMotivo: string | null;
  protocoloEvento: string | null; procEventoNFe: string | null;
}> {
  if (!urlRecepcaoEvento) {
    throw new Error("URL de recepção de evento da SEFAZ ausente na configuração do tenant.");
  }

  const envelope = montarEnvelopeEvento({
    xmlEventoAssinado,
    idLote: Date.now().toString().slice(-15),
  });

  // TLS mútuo: o A1 (em PEM) autentica o cliente no handshake com a SEFAZ.
  const { privateKey, certificate } = abrirCertificadoA1(certBase64, certSenha);
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  const certPem = forge.pki.certificateToPem(certificate);

  const client = (globalThis as { Deno?: { createHttpClient: (o: unknown) => unknown } })
    .Deno!.createHttpClient({ cert: certPem, key: keyPem });

  const resp = await fetch(urlRecepcaoEvento, {
    method: "POST",
    // @ts-ignore client é opção específica do Deno fetch
    client,
    headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
    body: envelope,
  });
  const textoResposta = await resp.text();

  return interpretarRetornoEvento(textoResposta, { xmlEventoAssinado });
}

/**
 * Transmite a INUTILIZAÇÃO assinada à SEFAZ-RS (NFeInutilizacao4, síncrono) por
 * SOAP sobre TLS MÚTUO com o mesmo A1, e interpreta o retorno. Devolve o
 * procInutNFe (documento durável) quando homologada.
 *
 * SECRET BOUNDARY: certBase64/certSenha entram como parâmetro e nunca saem.
 */
export async function transmitirInutSefazRS(
  xmlAssinado: string,
  { urlInutilizacao, certBase64, certSenha }:
    { urlInutilizacao: string; certBase64: string; certSenha: string },
): Promise<{
  homologada: boolean; cStat: string | null; xMotivo: string | null;
  protocolo: string | null; procInutNFe: string | null;
}> {
  if (!urlInutilizacao) {
    throw new Error("URL de inutilização da SEFAZ ausente na configuração do tenant.");
  }

  const envelope = montarEnvelopeInutilizacao({ xmlInutAssinado: xmlAssinado });

  // TLS mútuo: o A1 (em PEM) autentica o cliente no handshake com a SEFAZ.
  const { privateKey, certificate } = abrirCertificadoA1(certBase64, certSenha);
  const keyPem = forge.pki.privateKeyToPem(privateKey);
  const certPem = forge.pki.certificateToPem(certificate);

  const client = (globalThis as { Deno?: { createHttpClient: (o: unknown) => unknown } })
    .Deno!.createHttpClient({ cert: certPem, key: keyPem });

  const resp = await fetch(urlInutilizacao, {
    method: "POST",
    // @ts-ignore client é opção específica do Deno fetch
    client,
    headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
    body: envelope,
  });
  const textoResposta = await resp.text();

  return interpretarRetornoInutilizacao(textoResposta, { xmlInutAssinado: xmlAssinado });
}
