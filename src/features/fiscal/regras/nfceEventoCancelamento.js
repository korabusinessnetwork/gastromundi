/**
 * NFC-e (modelo 65) — núcleo PURO do evento de CANCELAMENTO (tpEvento=110111,
 * Leva 10). Mesma família dos outros nfce* (nfceXml/nfceSoap/nfceAssinatura):
 * sem I/O, sem rede, sem certificado — só montagem/validação de string,
 * testável no front com fixtures.
 *
 * Cancelar uma NFC-e autorizada NÃO é a mesma coisa que emiti-la: é um EVENTO
 * assinado (serviço RecepcaoEvento4), que precisa da CHAVE de acesso, do
 * PROTOCOLO de autorização (nProt) e de uma JUSTIFICATIVA (15–255 chars).
 * Sucesso = cStat 135 (evento registrado) ou 155 (registrado fora de prazo) →
 * a nota passa a `cancelada`.
 *
 * FRONTEIRA DE SEGREDO intacta: nada de certificado/CSC entra aqui. A
 * assinatura do <infEvento> (que exige a chave privada) acontece na Edge, pelo
 * mesmo callback RSA-SHA1 da NFe (ver nfceAssinatura.assinarInfEvento).
 */

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

// tpEvento/descEvento do cancelamento e versão do leiaute de evento.
const TP_EVENTO_CANCELAMENTO = "110111";
const DESC_EVENTO_CANCELAMENTO = "Cancelamento";
const VER_EVENTO = "1.00";

// Prazo de cancelamento de NFC-e — CURTO e variável por NT/UF. NÃO chutar: é
// um parâmetro nomeado, com valor-padrão só para o código rodar antes da
// chave. Conferir na legislação SEFAZ-RS ao plugar o certificado.
export const LIMITE_CANCELAMENTO_MINUTOS_PADRAO = 30; // ⟵ CONFIRMAR na legislação SEFAZ-RS ao plugar a chave

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Formata uma data no horário de Brasília (fuso -03:00), como a SEFAZ exige no
 * <dhEvento> (AAAA-MM-DDThh:mm:ss-03:00). Não usa a lib de timezone do host:
 * desloca o instante em -3h e serializa pelos getters UTC (roda igual no Deno
 * e no Node, sem depender do TZ da máquina).
 */
function formatarDhEventoBrasilia(data) {
  const d = new Date(data instanceof Date ? data.getTime() : new Date(data).getTime());
  if (!Number.isFinite(d.getTime())) throw new Error("Evento de cancelamento: dataEvento inválida.");
  const bsb = new Date(d.getTime() - 3 * 3600 * 1000);
  return (
    `${bsb.getUTCFullYear()}-${pad2(bsb.getUTCMonth() + 1)}-${pad2(bsb.getUTCDate())}` +
    `T${pad2(bsb.getUTCHours())}:${pad2(bsb.getUTCMinutes())}:${pad2(bsb.getUTCSeconds())}-03:00`
  );
}

/**
 * Monta o XML NÃO-ASSINADO do evento de cancelamento (<evento versao="1.00">
 * com o <infEvento Id="ID110111<chave><nSeqEvento 2 díg>">). A <Signature>
 * entra depois, na Edge (assinarInfEvento), DENTRO do <evento>, após o
 * </infEvento>.
 *
 * Prevenção de erro (Princípio nº1): valida chave/protocolo/justificativa/
 * tpAmb/nSeqEvento e lança mensagem clara ANTES de qualquer transmissão.
 *
 * @param {{
 *   chave: string, protocolo: string, justificativa: string,
 *   nSeqEvento?: number, cnpj: string, tpAmb: 1|2,
 *   cOrgao?: string|number, dataEvento?: Date|string,
 * }} p
 * @returns {{ xml: string, id: string, chave: string }}
 */
export function montarXmlEventoCancelamento({
  chave,
  protocolo,
  justificativa,
  nSeqEvento = 1,
  cnpj,
  tpAmb,
  cOrgao,
  dataEvento = new Date(),
} = {}) {
  const chaveDig = digitos(chave);
  if (chaveDig.length !== 44) {
    throw new Error("Evento de cancelamento: chave de acesso deve ter 44 dígitos.");
  }
  const nProt = String(protocolo ?? "").trim();
  if (!nProt) {
    throw new Error("Evento de cancelamento: protocolo de autorização (nProt) é obrigatório.");
  }
  const xJust = String(justificativa ?? "").trim();
  if (xJust.length < 15 || xJust.length > 255) {
    throw new Error("Evento de cancelamento: justificativa deve ter entre 15 e 255 caracteres.");
  }
  const seq = Number(nSeqEvento);
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("Evento de cancelamento: nSeqEvento deve ser um inteiro ≥ 1.");
  }
  const amb = Number(tpAmb);
  if (amb !== 1 && amb !== 2) {
    throw new Error("Evento de cancelamento: tpAmb deve ser 1 (produção) ou 2 (homologação).");
  }
  const cnpjDig = digitos(cnpj);
  if (cnpjDig.length !== 14) {
    throw new Error("Evento de cancelamento: CNPJ do emitente deve ter 14 dígitos.");
  }
  // cOrgao = UF do órgão. Deriva dos 2 primeiros dígitos da chave (cUF) quando
  // não informado — nunca hardcodar um tenant/UF (multi-tenant, decisão 002).
  const org = digitos(cOrgao) || chaveDig.slice(0, 2);
  if (org.length !== 2) {
    throw new Error("Evento de cancelamento: cOrgao (cUF) inválido.");
  }

  const seqStr = pad2(seq);
  const id = `ID${TP_EVENTO_CANCELAMENTO}${chaveDig}${seqStr}`;
  const dhEvento = formatarDhEventoBrasilia(dataEvento);

  const xml =
    `<evento versao="${VER_EVENTO}" xmlns="${NFE_NS}">` +
    `<infEvento Id="${id}">` +
    `<cOrgao>${org}</cOrgao>` +
    `<tpAmb>${amb}</tpAmb>` +
    `<CNPJ>${cnpjDig}</CNPJ>` +
    `<chNFe>${chaveDig}</chNFe>` +
    `<dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${TP_EVENTO_CANCELAMENTO}</tpEvento>` +
    `<nSeqEvento>${seq}</nSeqEvento>` +
    `<verEvento>${VER_EVENTO}</verEvento>` +
    `<detEvento versao="${VER_EVENTO}">` +
    `<descEvento>${DESC_EVENTO_CANCELAMENTO}</descEvento>` +
    `<nProt>${escaparXml(nProt)}</nProt>` +
    `<xJust>${escaparXml(xJust)}</xJust>` +
    `</detEvento>` +
    `</infEvento>` +
    `</evento>`;

  return { xml, id, chave: chaveDig };
}

/**
 * True se a NFC-e ainda está DENTRO do prazo de cancelamento. Puro. O
 * `limiteMinutos` é parâmetro nomeado (LIMITE_CANCELAMENTO_MINUTOS_PADRAO) —
 * ver comentário ⟵ CONFIRMAR: o valor exato varia por NT/UF.
 *
 * @param {{ dhEmi: Date|string, agora?: Date|string, limiteMinutos?: number }} p
 * @returns {boolean}
 */
export function dentroDoPrazoCancelamento({
  dhEmi,
  agora = new Date(),
  limiteMinutos = LIMITE_CANCELAMENTO_MINUTOS_PADRAO,
} = {}) {
  const emi = new Date(dhEmi instanceof Date ? dhEmi.getTime() : new Date(dhEmi).getTime()).getTime();
  const ref = new Date(agora instanceof Date ? agora.getTime() : new Date(agora).getTime()).getTime();
  if (!Number.isFinite(emi) || !Number.isFinite(ref)) return false;
  const diffMin = (ref - emi) / 60000;
  return diffMin >= 0 && diffMin <= Number(limiteMinutos);
}

// cStat de sucesso do evento: 135 (registrado) e 155 (registrado fora de prazo).
const CSTAT_EVENTO_OK = Object.freeze(new Set(["135", "155"]));

/** Encurta o texto de erro para o motivo (sem vazar nada sensível). */
function textoCurto(v, max = 160) {
  const s = String(v ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Decide o desfecho de uma tentativa de cancelamento. Mesma família de
 * decidirDesfechoReenvio: a Edge (cancelar-nfce) só orquestra I/O; a REGRA
 * mora aqui, testável, sem certificado nem rede.
 *
 *   • cStat 135/155         → cancelada (nota vira 'cancelada');
 *   • erro de transmissão   → NÃO cancela (mantém 'autorizada'), devolve motivo;
 *   • qualquer outro cStat  → NÃO cancela (rejeição do evento), devolve motivo.
 *
 * @param {{
 *   retornoInterpretado?: {registrado?:boolean, cStat?:string|null,
 *     xMotivo?:string|null, protocoloEvento?:string|null,
 *     procEventoNFe?:string|null} | null,
 *   erroTransmissao?: string|null,
 * }} entrada
 * @returns {{
 *   status: "cancelada"|"autorizada", cancelada: boolean,
 *   cStat: string|null, xMotivo: string|null,
 *   protocoloEvento: string|null, procEventoNFe: string|null,
 *   motivo: string|null,
 * }}
 */
export function decidirDesfechoCancelamento({
  retornoInterpretado = null,
  erroTransmissao = null,
} = {}) {
  // Falha de transmissão (rede/TLS/SEFAZ fora): a nota continua autorizada.
  if (erroTransmissao) {
    return {
      status: "autorizada",
      cancelada: false,
      cStat: null,
      xMotivo: null,
      protocoloEvento: null,
      procEventoNFe: null,
      motivo: `falha_transmissao: ${textoCurto(erroTransmissao)}`,
    };
  }

  const r = retornoInterpretado ?? {};
  const cStat = r.cStat != null && r.cStat !== "" ? String(r.cStat) : null;
  const xMotivo = r.xMotivo ?? null;

  // Evento registrado (135/155): a nota está cancelada.
  if (r.registrado || (cStat && CSTAT_EVENTO_OK.has(cStat))) {
    return {
      status: "cancelada",
      cancelada: true,
      cStat,
      xMotivo,
      protocoloEvento: r.protocoloEvento ?? null,
      procEventoNFe: r.procEventoNFe ?? null,
      motivo: null,
    };
  }

  // Qualquer outro cStat: o evento foi rejeitado (ex.: 573 duplicidade, 501
  // fora de prazo, 501/adiado). A nota permanece autorizada.
  return {
    status: "autorizada",
    cancelada: false,
    cStat,
    xMotivo,
    protocoloEvento: null,
    procEventoNFe: null,
    motivo: cStat ? `rejeicao_evento: ${cStat}${xMotivo ? ` ${xMotivo}` : ""}` : "sem_retorno_interpretavel",
  };
}
