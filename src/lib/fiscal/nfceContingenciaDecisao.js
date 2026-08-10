/**
 * NFC-e (modelo 65) — DECISÃO de contingência (Leva 14, núcleo PURO).
 *
 * A estrutura de contingência já existia (Leva 4: tpEmis=9, QR offline, fila
 * de pendentes, reenviar-nfce). Esta camada é a REGRA que ACIONA a
 * contingência: quando a SEFAZ-RS cai, o estabelecimento não pode parar de
 * vender — a lei manda emitir offline (tpEmis=9), o cupom sai na hora e a nota
 * é transmitida depois. Toda a decisão é lógica PURA (sem I/O, sem certificado,
 * sem rede), extraída de dentro do Edge para ser testável com mocks.
 *
 * DECISÃO DE ARQUITETURA (não reabrir): o tpEmis é decidido no SERVIDOR (Edge),
 * com estado por tenant (contingencia_ativa) e auto-fallback reusando o MESMO
 * número. Motivo: o dígito tpEmis faz parte da chave de acesso (posição 35) —
 * trocar de modo reconstrói o XML/chave, e só o Edge (que tem o certificado)
 * monta o documento final. Reusar o mesmo nNF no fallback evita queimar
 * numeração e criar nota duplicada.
 *
 * FRONTEIRA DE SEGREDO intacta: nada aqui toca no A1/CSC. O estado
 * `contingencia_ativa` é só um booleano de operação (não-secreto).
 */

import { normalizarTpEmis, TP_EMIS } from "./nfceContingencia.js";

// cStat de "serviço da SEFAZ paralisado" — o gatilho legítimo de contingência
// por indisponibilidade (não por rejeição de negócio):
//   108 = Serviço Paralisado Momentaneamente
//   109 = Serviço Paralisado sem Previsão
// ⟵ CONFIRMAR SEFAZ-RS: validar os códigos na tabela oficial ao plugar a chave.
export const CSTAT_SERVICO_PARALISADO = Object.freeze(new Set(["108", "109"]));

/**
 * Decide o tpEmis com que a emissão COMEÇA. Se o tenant já está em
 * contingência (a SEFAZ caiu antes), sai direto em 9 — pula a tentativa online
 * lenta a cada venda. Senão, normaliza o solicitado (default 1 = normal).
 *
 * @param {{ contingenciaAtiva?: boolean, tpEmisSolicitado?: number|string }} p
 * @returns {1|9}
 */
export function decidirTpEmisInicial({ contingenciaAtiva = false, tpEmisSolicitado } = {}) {
  if (contingenciaAtiva) return TP_EMIS.CONTINGENCIA_OFFLINE;
  return normalizarTpEmis(tpEmisSolicitado);
}

/**
 * True se a emissão deve ENTRAR em contingência: houve erro de transmissão
 * (SEFAZ inalcançável / timeout) ou a SEFAZ respondeu "serviço paralisado"
 * (cStat 108/109). NÃO entra em contingência por rejeição de negócio (nota
 * errada, cadastro fiscal inválido) — isso é problema da nota, não da SEFAZ.
 *
 * @param {{ erroTransmissao?: string|null, cStat?: string|null }} p
 * @returns {boolean}
 */
export function deveEntrarContingencia({ erroTransmissao = null, cStat = null } = {}) {
  if (erroTransmissao) return true;
  const c = cStat != null && cStat !== "" ? String(cStat) : null;
  return c != null && CSTAT_SERVICO_PARALISADO.has(c);
}

/**
 * True se a contingência deve SAIR (voltar ao normal): uma emissão online foi
 * autorizada, o que prova que a SEFAZ voltou. Barato e sem ping extra — o
 * próprio fluxo de venda faz o health-check de graça.
 *
 * @param {{ autorizada?: boolean }} p
 * @returns {boolean}
 */
export function deveSairContingencia({ autorizada = false } = {}) {
  return autorizada === true;
}

/**
 * Regra ÚNICA do desfecho de uma emissão (antes inline no Edge, ~281–285),
 * agora testável:
 *   • autorizada                                 → "autorizada" (contingencia=false);
 *   • erro de transmissão OU tpEmis=9 não-autor. → "pendente"  (fila Leva 9),
 *       contingencia = (tpEmis===9), motivo "sefaz_indisponivel";
 *   • senão (rejeição de negócio)                → "rejeitada".
 *
 * @param {{ tpEmis:number|string, erroTransmissao?:string|null,
 *   autorizada?:boolean, cStat?:string|null }} p
 * @returns {{ status:"autorizada"|"rejeitada"|"pendente",
 *   contingencia:boolean, motivo:string|null }}
 */
export function decidirDesfechoEmissao({ tpEmis, erroTransmissao = null, autorizada = false, cStat = null } = {}) {
  void cStat; // aceito na assinatura para simetria/futuro; o desfecho não depende dele.
  const contingenciaOffline = String(tpEmis) === String(TP_EMIS.CONTINGENCIA_OFFLINE);

  if (autorizada) {
    return { status: "autorizada", contingencia: false, motivo: null };
  }
  if (erroTransmissao || contingenciaOffline) {
    return { status: "pendente", contingencia: contingenciaOffline, motivo: "sefaz_indisponivel" };
  }
  return { status: "rejeitada", contingencia: false, motivo: null };
}
