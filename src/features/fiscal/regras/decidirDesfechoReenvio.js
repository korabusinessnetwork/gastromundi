/**
 * NFC-e (modelo 65) — decisão do desfecho de um REENVIO da fila de
 * contingência (Leva 9, pura/testável). Mesma família de
 * montarRegistroNfceEmitida: a Edge (reenviar-nfce) só orquestra I/O
 * (ler a fila, transmitir, atualizar a linha); a REGRA de o que fazer com
 * o retorno vive aqui, testável no front, sem certificado nem rede.
 *
 * Recebe o retorno JÁ interpretado da SEFAZ (interpretarRetornoSefaz) e/ou
 * o erro de transmissão, mais as tentativas atuais da linha, e decide:
 *   • autorizada — SEFAZ autorizou (cStat 100/150): sai da fila;
 *   • rejeitada  — rejeição definitiva: sai da fila (trilha), +1 tentativa;
 *   • pendente   — SEFAZ indisponível / erro de transmissão / serviço
 *                  paralisado: CONTINUA na fila, +1 tentativa (o backoff é
 *                  decisão do agendamento, não trava aqui).
 *
 * FRONTEIRA DE SEGREDO intacta: nada de certificado/CSC entra aqui — só o
 * retorno público (cStat/xMotivo/protocolo) e um contador.
 */

// cStat que pedem RETENTAR (serviço indisponível momentâneo), não rejeição:
//   108 = serviço paralisado momentaneamente; 109 = sem previsão.
const CSTAT_RETENTAR = Object.freeze(new Set(["108", "109"]));

/** Encurta o texto de erro para caber no motivo (sem vazar nada sensível). */
function textoCurto(v, max = 160) {
  const s = String(v ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Decide o desfecho de uma tentativa de reenvio.
 *
 * @param {{
 *   retornoInterpretado?: {autorizada?:boolean, cStat?:string|null,
 *     xMotivo?:string|null, protocolo?:string|null, nfeProc?:string|null,
 *     dhRecbto?:string|null} | null,
 *   erroTransmissao?: string|null,
 *   tentativasAtuais?: number,
 * }} entrada
 * @returns {{
 *   status: "autorizada"|"rejeitada"|"pendente",
 *   tentativas: number, motivo: string|null, autorizada: boolean,
 *   cStat: string|null, xMotivo: string|null, protocolo: string|null,
 *   nfeProc: string|null, dhRecbto: string|null,
 * }}
 */
export function decidirDesfechoReenvio({
  retornoInterpretado = null,
  erroTransmissao = null,
  tentativasAtuais = 0,
} = {}) {
  const tentativas = Number.isFinite(Number(tentativasAtuais)) ? Number(tentativasAtuais) : 0;

  // 1) Falha de transmissão (rede/TLS/SEFAZ fora): continua na fila.
  if (erroTransmissao) {
    return {
      status: "pendente",
      tentativas: tentativas + 1,
      motivo: `falha_transmissao: ${textoCurto(erroTransmissao)}`,
      autorizada: false,
      cStat: null, xMotivo: null, protocolo: null, nfeProc: null, dhRecbto: null,
    };
  }

  const r = retornoInterpretado ?? {};
  const cStat = r.cStat != null && r.cStat !== "" ? String(r.cStat) : null;
  const xMotivo = r.xMotivo ?? null;

  // 2) Autorizada (cStat 100/150): sai da fila. A tentativa que deu certo não
  //    incrementa o contador de FALHAS.
  if (r.autorizada) {
    return {
      status: "autorizada",
      tentativas,
      motivo: null,
      autorizada: true,
      cStat, xMotivo,
      protocolo: r.protocolo ?? null,
      nfeProc: r.nfeProc ?? null,
      dhRecbto: r.dhRecbto ?? null,
    };
  }

  // 3) Serviço indisponível (108/109): mantém pendente para nova rodada.
  if (cStat && CSTAT_RETENTAR.has(cStat)) {
    return {
      status: "pendente",
      tentativas: tentativas + 1,
      motivo: `sefaz_indisponivel: ${cStat}${xMotivo ? ` ${xMotivo}` : ""}`,
      autorizada: false,
      cStat, xMotivo, protocolo: null, nfeProc: null, dhRecbto: null,
    };
  }

  // 4) Rejeição definitiva (qualquer outro cStat): sai da fila (trilha).
  if (cStat) {
    return {
      status: "rejeitada",
      tentativas: tentativas + 1,
      motivo: `rejeitada: ${cStat}${xMotivo ? ` ${xMotivo}` : ""}`,
      autorizada: false,
      cStat, xMotivo,
      protocolo: r.protocolo ?? null,
      nfeProc: null, dhRecbto: null,
    };
  }

  // 5) Sem retorno interpretável e sem erro explícito: defensivo, mantém na
  //    fila (nunca some com a nota por resposta que não deu para ler).
  return {
    status: "pendente",
    tentativas: tentativas + 1,
    motivo: "sem_retorno_interpretavel",
    autorizada: false,
    cStat: null, xMotivo: null, protocolo: null, nfeProc: null, dhRecbto: null,
  };
}
