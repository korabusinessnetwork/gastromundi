/**
 * NFC-e (modelo 65) — núcleo PURO da INUTILIZAÇÃO de numeração (Leva 11,
 * serviço NFeInutilizacao4). Mesma família dos outros nfce* (nfceXml/nfceSoap/
 * nfceAssinatura/nfceEventoCancelamento): sem I/O, sem rede, sem certificado —
 * só montagem/validação de string, testável no front com fixtures.
 *
 * Inutilizar é "queimar" na SEFAZ uma FAIXA de nNF que pulou e nunca virou
 * (nem virará) nota autorizada — para justificar o buraco na sequência. NÃO é
 * cancelamento (Leva 10): cancelar age sobre uma nota AUTORIZADA; inutilizar
 * age sobre NÚMEROS que nunca viraram nota. O serviço é SÍNCRONO e distinto do
 * de autorização/evento. Sucesso = cStat 102 (Inutilização homologada) → guarda
 * o procInutNFe.
 *
 * FRONTEIRA DE SEGREDO intacta: nada de certificado/CSC entra aqui. A assinatura
 * do <infInut> (que exige a chave privada) acontece na Edge, pelo mesmo callback
 * RSA-SHA1 da NFe (ver nfceAssinatura.assinarInfInut).
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";
const VERSAO_INUT = "4.00";
const X_SERV_INUT = "INUTILIZACAO";

/** Só dígitos. */
function digitos(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/** Escapa texto para dentro de uma tag XML (& < > " '). */
function escaparXml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Zero-pad à esquerda com `n` casas (string de dígitos). */
function pad(v, n) {
  return String(v).padStart(n, "0");
}

/**
 * Monta o XML NÃO-ASSINADO da inutilização (<inutNFe versao="4.00"> com o
 * <infInut Id="ID<41 dígitos>">). A <Signature> entra depois, na Edge
 * (assinarInfInut), DENTRO do <inutNFe>, após o </infInut>.
 *
 * A mensagem de inutilização NÃO tem wrapper (tipo envEvento/enviNFe): o
 * próprio <inutNFe> é o corpo da mensagem SOAP (ver nfceSoap.montarEnvelope-
 * Inutilizacao).
 *
 * Id do infInut = "ID" + cUF(2) + ano(2) + CNPJ(14) + mod(2) + serie(3) +
 * nNFIni(9) + nNFFin(9) — 41 dígitos após "ID" (leiaute NFeInutilizacao4).
 *
 * Prevenção de erro (Princípio nº1): valida faixa/justificativa/tpAmb/cUF/ano
 * e lança mensagem clara ANTES de qualquer transmissão.
 *
 * @param {{
 *   cnpj: string, tpAmb: 1|2, serie: number|string,
 *   nNFIni: number|string, nNFFin: number|string,
 *   ano?: number|string, cUF: string|number,
 *   justificativa: string, mod?: string,
 * }} p
 * @returns {{ xml: string, id: string }}
 */
export function montarXmlInutilizacao({
  cnpj,
  tpAmb,
  serie,
  nNFIni,
  nNFFin,
  ano,
  cUF,
  justificativa,
  mod = "65",
} = {}) {
  const cnpjDig = digitos(cnpj);
  if (cnpjDig.length !== 14) {
    throw new Error("Inutilização: CNPJ do emitente deve ter 14 dígitos.");
  }
  const amb = Number(tpAmb);
  if (amb !== 1 && amb !== 2) {
    throw new Error("Inutilização: tpAmb deve ser 1 (produção) ou 2 (homologação).");
  }
  // Série: inteiro 0–999 (a faixa é sempre de UMA série).
  const serieNum = Number(serie);
  if (!Number.isInteger(serieNum) || serieNum < 0 || serieNum > 999) {
    throw new Error("Inutilização: série deve ser um inteiro de 0 a 999.");
  }
  const ini = Number(nNFIni);
  const fin = Number(nNFFin);
  if (!Number.isInteger(ini) || ini < 1) {
    throw new Error("Inutilização: numeração inicial (nNFIni) deve ser um inteiro ≥ 1.");
  }
  if (!Number.isInteger(fin) || fin < 1) {
    throw new Error("Inutilização: numeração final (nNFFin) deve ser um inteiro ≥ 1.");
  }
  if (fin < ini) {
    throw new Error("Inutilização: a numeração final deve ser ≥ a inicial.");
  }
  const xJust = String(justificativa ?? "").trim();
  if (xJust.length < 15 || xJust.length > 255) {
    throw new Error("Inutilização: justificativa deve ter entre 15 e 255 caracteres.");
  }
  // ano = AA (2 dígitos). Default: os 2 últimos dígitos do ano atual — nunca
  // hardcoda o ano; deriva do relógio quando não informado.
  const anoStr = ano != null && String(ano).trim() !== ""
    ? pad(digitos(ano).slice(-2), 2)
    : pad(String(new Date().getFullYear()).slice(-2), 2);
  if (!/^\d{2}$/.test(anoStr)) {
    throw new Error("Inutilização: ano deve ter 2 dígitos (AA).");
  }
  // cUF = código da UF (2 díg). Deriva/valida — nunca hardcoda uma UF
  // (multi-tenant, decisão 002).
  const org = digitos(cUF);
  if (org.length !== 2) {
    throw new Error("Inutilização: cUF (código da UF) deve ter 2 dígitos.");
  }

  const serieStr = pad(serieNum, 3);
  const iniStr = pad(ini, 9);
  const finStr = pad(fin, 9);
  const id = `ID${org}${anoStr}${cnpjDig}${mod}${serieStr}${iniStr}${finStr}`;

  const xml =
    `<inutNFe versao="${VERSAO_INUT}" xmlns="${NFE_NS}">` +
    `<infInut Id="${id}">` +
    `<tpAmb>${amb}</tpAmb>` +
    `<xServ>${X_SERV_INUT}</xServ>` +
    `<cUF>${org}</cUF>` +
    `<ano>${anoStr}</ano>` +
    `<CNPJ>${cnpjDig}</CNPJ>` +
    `<mod>${mod}</mod>` +
    `<serie>${serieNum}</serie>` +
    `<nNFIni>${ini}</nNFIni>` +
    `<nNFFin>${fin}</nNFFin>` +
    `<xJust>${escaparXml(xJust)}</xJust>` +
    `</infInut>` +
    `</inutNFe>`;

  return { xml, id };
}

// cStat de SUCESSO da inutilização: 102 (Inutilização de número homologada).
const CSTAT_INUT_OK = Object.freeze(new Set(["102"]));

/** Encurta o texto de erro para o motivo (sem vazar nada sensível). */
function textoCurto(v, max = 160) {
  const s = String(v ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Decide o desfecho de uma tentativa de inutilização. Espelha
 * decidirDesfechoCancelamento: a Edge (inutilizar-nfce) só orquestra I/O; a
 * REGRA mora aqui, testável, sem certificado nem rede.
 *
 *   • cStat 102             → inutilizada (faixa queimada na SEFAZ);
 *   • erro de transmissão   → rejeitada, devolve motivo;
 *   • qualquer outro cStat  → rejeitada (rejeição da SEFAZ), devolve motivo.
 *
 * @param {{
 *   retornoInterpretado?: {homologada?:boolean, cStat?:string|null,
 *     xMotivo?:string|null, protocolo?:string|null,
 *     procInutNFe?:string|null} | null,
 *   erroTransmissao?: string|null,
 * }} entrada
 * @returns {{
 *   status: "inutilizada"|"rejeitada", homologada: boolean,
 *   cStat: string|null, xMotivo: string|null,
 *   protocolo: string|null, procInutNFe: string|null,
 *   motivo: string|null,
 * }}
 */
export function decidirDesfechoInutilizacao({
  retornoInterpretado = null,
  erroTransmissao = null,
} = {}) {
  // Falha de transmissão (rede/TLS/SEFAZ fora): não inutilizou.
  if (erroTransmissao) {
    return {
      status: "rejeitada",
      homologada: false,
      cStat: null,
      xMotivo: null,
      protocolo: null,
      procInutNFe: null,
      motivo: `falha_transmissao: ${textoCurto(erroTransmissao)}`,
    };
  }

  const r = retornoInterpretado ?? {};
  const cStat = r.cStat != null && r.cStat !== "" ? String(r.cStat) : null;
  const xMotivo = r.xMotivo ?? null;

  // Homologada (102): a faixa foi inutilizada.
  if (r.homologada || (cStat && CSTAT_INUT_OK.has(cStat))) {
    return {
      status: "inutilizada",
      homologada: true,
      cStat,
      xMotivo,
      protocolo: r.protocolo ?? null,
      procInutNFe: r.procInutNFe ?? null,
      motivo: null,
    };
  }

  // Qualquer outro cStat: a SEFAZ rejeitou (ex.: 241 faixa já inutilizada,
  // 563 já emitida uma nota da faixa).
  return {
    status: "rejeitada",
    homologada: false,
    cStat,
    xMotivo,
    protocolo: null,
    procInutNFe: null,
    motivo: cStat ? `rejeicao: ${cStat}${xMotivo ? ` ${xMotivo}` : ""}` : "sem_retorno_interpretavel",
  };
}
