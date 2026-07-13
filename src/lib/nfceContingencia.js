/**
 * NFC-e (modelo 65) — contingência offline (Leva 4, estrutura pura).
 *
 * Quando a SEFAZ está indisponível, a NFC-e pode ser emitida em
 * CONTINGÊNCIA OFFLINE (tpEmis=9): o cupom sai na hora para o consumidor e
 * a nota é TRANSMITIDA DEPOIS, quando a SEFAZ voltar. Este módulo monta a
 * ESTRUTURA disso — determinística, sem I/O, sem certificado:
 *   - a constante e a normalização do tpEmis parametrizável no fluxo;
 *   - o item da FILA de "notas a transmitir" (persistir e reenviar);
 *   - o que do QR de contingência DEPENDE DA ASSINATURA (o digVal), que é
 *     o "PLUG A CHAVE" da Leva 3 — deixado explícito, não escondido.
 *
 * FRONTEIRA DE SEGREDO intacta: nada aqui toca no certificado A1 nem no
 * CSC. O QR de contingência tem uma forma diferente da online (NT
 * 2015.002): antes do idCSC entram dhEmi, vNF, vICMS e o **digVal** — e o
 * digVal é o DigestValue da ASSINATURA do XML, que só existe com o
 * certificado (servidor). Por isso a montagem final do QR de contingência
 * (com hash do CSC) continua na Edge Function; aqui só descrevemos e
 * validamos a ESTRUTURA, para o dia da chave ser só encaixe.
 */

/** tpEmis aceitos na NFC-e: 1 = normal (online), 9 = contingência offline. */
export const TP_EMIS = Object.freeze({
  NORMAL: 1,
  CONTINGENCIA_OFFLINE: 9,
});

/**
 * Campos do QR Code de CONTINGÊNCIA que só existem DEPOIS da assinatura do
 * XML (ou dela derivam) — não dá para montar o QR offline sem eles, e o
 * `digVal` em especial vem do DigestValue da assinatura (PLUG A CHAVE,
 * Leva 3). `dhEmi`, `vNF` e `vICMS` vêm do próprio XML/totais.
 */
export const CAMPOS_QR_CONTINGENCIA = Object.freeze(["dhEmi", "vNF", "vICMS", "digVal"]);

/** Só o `digVal` depende da ASSINATURA (certificado). Os demais vêm do XML. */
export const CAMPO_QR_DEPENDE_ASSINATURA = "digVal";

/**
 * True se o tpEmis representa contingência offline (9).
 * @param {number|string} tpEmis
 * @returns {boolean}
 */
export function emContingencia(tpEmis) {
  return String(tpEmis) === String(TP_EMIS.CONTINGENCIA_OFFLINE);
}

/**
 * Normaliza o tpEmis vindo do fluxo (PDV/config) para 1 ou 9. Qualquer
 * outro valor é erro de entrada (prevenção de erro > nota inválida
 * silenciosa). Sem valor → 1 (emissão normal, o caminho feliz).
 *
 * @param {number|string|null|undefined} valor
 * @returns {1|9}
 */
export function normalizarTpEmis(valor) {
  if (valor === null || valor === undefined || valor === "") return TP_EMIS.NORMAL;
  const n = Number(valor);
  if (n === TP_EMIS.NORMAL) return TP_EMIS.NORMAL;
  if (n === TP_EMIS.CONTINGENCIA_OFFLINE) return TP_EMIS.CONTINGENCIA_OFFLINE;
  throw new Error(`tpEmis inválido para NFC-e: "${valor}" (só 1 ou 9).`);
}

/**
 * Quais campos obrigatórios do QR de contingência ainda faltam nos dados —
 * usado para deixar EXPLÍCITO o que depende da assinatura antes de tentar
 * montar/transmitir. Numa emissão normal (tpEmis≠9) não há exigência
 * (devolve lista vazia): o QR online não usa esses campos.
 *
 * @param {{tpEmis:number|string, dhEmi?:any, vNF?:any, vICMS?:any, digVal?:any}} dados
 * @returns {string[]} nomes dos campos ausentes (subconjunto de CAMPOS_QR_CONTINGENCIA)
 */
export function camposFaltantesQrContingencia(dados = {}) {
  if (!emContingencia(dados.tpEmis)) return [];
  return CAMPOS_QR_CONTINGENCIA.filter((campo) => {
    const v = dados[campo];
    return v === null || v === undefined || v === "";
  });
}

/**
 * Monta o item da FILA de notas a transmitir. Cada nota emitida em
 * contingência (ou que falhou a transmissão online e será reenviada) vira
 * uma linha desta fila, persistida para reenvio quando a SEFAZ voltar.
 * Estrutura pura — a persistência (tabela/localStorage) e o worker de
 * reenvio ficam para quem consumir isto; aqui só o formato.
 *
 * @param {{
 *   chave: string,
 *   tpEmis?: number|string,
 *   tpAmb?: number|string,
 *   vNF?: number,
 *   xml?: string|null,          // XML montado (não-assinado até a chave)
 *   dataEmissao?: Date|string,
 *   motivo?: string,            // por que entrou na fila (ex.: "sefaz_indisponivel")
 * }} nota
 * @returns {{chave:string, tpEmis:number, tpAmb:number, vNF:number,
 *   xml:string|null, status:"pendente", tentativas:number, motivo:string|null,
 *   criadoEm:string, atualizadoEm:string, transmitidaEm:null}}
 */
export function montarNotaPendenteTransmissao(nota = {}) {
  const chave = String(nota.chave ?? "").replace(/\D/g, "");
  if (chave.length !== 44) {
    throw new Error("Fila de transmissão exige a chave de acesso de 44 dígitos.");
  }
  const agora = nota.dataEmissao ? new Date(nota.dataEmissao) : new Date();
  const iso = Number.isNaN(agora.getTime()) ? new Date().toISOString() : agora.toISOString();
  return {
    chave,
    tpEmis: normalizarTpEmis(nota.tpEmis ?? TP_EMIS.CONTINGENCIA_OFFLINE),
    tpAmb: Number(nota.tpAmb) === 1 ? 1 : 2,
    vNF: Number(nota.vNF) || 0,
    xml: nota.xml ?? null,
    status: "pendente",
    tentativas: 0,
    motivo: nota.motivo ?? null,
    criadoEm: iso,
    atualizadoEm: iso,
    transmitidaEm: null,
  };
}
