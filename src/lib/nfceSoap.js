/**
 * NFC-e (modelo 65) — envelope SOAP de autorização e leitura do retorno
 * (Leva 6, parte pura). Monta o <enviNFe> dentro do envelope SOAP 1.2 do
 * serviço NFeAutorizacao4 e interpreta o retorno SÍNCRONO da SEFAZ. Sem
 * rede, sem certificado, sem I/O — só montagem/parse de string, testável
 * com fixtures de retorno montadas à mão.
 *
 * A transmissão em si (POST com TLS mútuo pelo certificado A1) fica na Edge
 * Function; aqui só produzimos o corpo a enviar e entendemos a resposta.
 *
 * Multi-tenant / white-label: nada de URL/UF de um estabelecimento aqui —
 * a URL do webservice vem de tenant_fiscal_config, na Edge.
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const SOAP_NS = "http://www.w3.org/2003/05/soap-envelope";
const WSDL_NS = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4";

/**
 * Monta o envelope SOAP 1.2 do NFeAutorizacao4 com o <enviNFe> síncrono.
 *
 * @param {{ xmlAssinado:string, idLote:string|number, indSinc?:0|1, versao?:string }} p
 *   xmlAssinado = o <NFe>…</NFe> já assinado (Leva 6, Parte B/D).
 * @returns {string} envelope SOAP pronto para POST no webservice
 */
export function montarEnvelopeEnviNfe({ xmlAssinado, idLote, indSinc = 1, versao = "4.00" }) {
  const nfe = String(xmlAssinado ?? "").trim();
  if (!/^<NFe[\s>]/.test(nfe)) {
    throw new Error("Envelope enviNFe exige o XML da NFe assinada (<NFe>…</NFe>).");
  }
  const lote = String(idLote ?? "").replace(/\D/g, "");
  if (!lote) throw new Error("Envelope enviNFe exige um idLote numérico.");
  const sinc = Number(indSinc) === 1 ? 1 : 0;

  const enviNFe =
    `<enviNFe versao="${versao}" xmlns="${NFE_NS}">` +
    `<idLote>${lote}</idLote>` +
    `<indSinc>${sinc}</indSinc>` +
    nfe +
    `</enviNFe>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap12:Envelope xmlns:soap12="${SOAP_NS}">` +
    `<soap12:Body>` +
    `<nfeDadosMsg xmlns="${WSDL_NS}">` +
    enviNFe +
    `</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

// ── Leitura do retorno ─────────────────────────────────────────────────

/** Conteúdo textual de uma tag (tolerante a prefixo de namespace). */
function tagTexto(xml, nome) {
  const m = String(xml ?? "").match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1].trim() : null;
}

/** Elemento inteiro (com as tags) — usado para recortar o protNFe. */
function tagBloco(xml, nome) {
  const m = String(xml ?? "").match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>[\\s\\S]*?</(?:\\w+:)?${nome}>`));
  return m ? m[0] : null;
}

// cStat de AUTORIZAÇÃO: 100 (autorizado) e 150 (autorizado fora de prazo).
const CSTAT_AUTORIZADO = new Set(["100", "150"]);

/**
 * Interpreta o retorno síncrono do NFeAutorizacao4. O status de autorização
 * mora no <protNFe><infProt> (quando o lote foi processado); na ausência
 * dele, cai no cStat/xMotivo do <retEnviNFe> (rejeição de lote).
 *
 * Quando autorizada e o XML assinado é fornecido, monta o <nfeProc>
 * (NFe assinada + protNFe) — o documento fiscal final a guardar.
 *
 * @param {string} xmlResposta corpo da resposta da SEFAZ
 * @param {{ xmlAssinado?:string, versao?:string }} [opts]
 * @returns {{ autorizada:boolean, cStat:string|null, xMotivo:string|null,
 *   protocolo:string|null, nProt:string|null, chNFe:string|null,
 *   nfeProc:string|null }}
 */
export function interpretarRetornoSefaz(xmlResposta, { xmlAssinado, versao = "4.00" } = {}) {
  const protNFe = tagBloco(xmlResposta, "protNFe");
  const escopo = protNFe ?? xmlResposta;

  const cStat = tagTexto(escopo, "cStat") ?? tagTexto(xmlResposta, "cStat");
  const xMotivo = tagTexto(escopo, "xMotivo") ?? tagTexto(xmlResposta, "xMotivo");
  const nProt = protNFe ? tagTexto(protNFe, "nProt") : null;
  const chNFe = protNFe ? tagTexto(protNFe, "chNFe") : null;
  const autorizada = cStat != null && CSTAT_AUTORIZADO.has(cStat);

  let nfeProc = null;
  if (autorizada && xmlAssinado && protNFe) {
    // nfeProc = NFe assinada + protNFe do retorno (documento final).
    nfeProc =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<nfeProc versao="${versao}" xmlns="${NFE_NS}">` +
      String(xmlAssinado).trim() +
      protNFe +
      `</nfeProc>`;
  }

  return { autorizada, cStat, xMotivo, protocolo: nProt, nProt, chNFe, nfeProc };
}
