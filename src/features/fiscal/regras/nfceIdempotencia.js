/**
 * NFC-e (modelo 65) — idempotência por venda (F1, pura/testável). A Edge
 * (emitir-nfce) só orquestra I/O (ler as notas da venda); a REGRA de QUAL
 * nota existente é REAPROVEITÁVEL — para não emitir duas NFC-e para a mesma
 * venda — vive aqui, testável no front, sem certificado nem rede.
 *
 * Uma venda pode ter mais de uma linha em nfce_emitidas ao longo do tempo:
 *   • autorizada → nota definitiva: SEMPRE reaproveitável (idempotente);
 *   • pendente COM xml assinado (xml_tipo='assinado') → contingência real na
 *     fila; o worker reenviar-nfce fecha o ciclo → reaproveitável;
 *   • pendente SEM xml assinado (xml_tipo null) → FANTASMA de falha_pos_reserva
 *     (passo 10z): número reservado cuja emissão morreu antes de assinar. NÃO
 *     há o que retransmitir e o reenviar-nfce nunca o completa. Tratá-lo como
 *     reaproveitável TRAVARIA a venda para sempre (nunca reemite) — por isso
 *     ele é IGNORADO aqui: a venda pode reemitir (novo número), e o número
 *     morto fica registrado para o gestor inutilizar;
 *   • rejeitada → não reaproveitável (nunca deveria chegar aqui — o chamador
 *     já filtra por status, mas defendemos mesmo assim).
 *
 * FRONTEIRA DE SEGREDO intacta: nada de certificado/CSC entra aqui — só os
 * campos públicos da nota (status/chave/protocolo/xml_tipo…).
 */

/**
 * Uma nota é reaproveitável se está autorizada, ou se é pendente COM XML
 * assinado a retransmitir. Fantasma (pendente sem xml assinado) não conta.
 *
 * @param {{status?: string, xml_tipo?: string|null}} [nota]
 * @returns {boolean}
 */
export function notaReaproveitavel(nota) {
  if (!nota || typeof nota !== "object") return false;
  if (nota.status === "autorizada") return true;
  if (nota.status === "pendente" && nota.xml_tipo === "assinado") return true;
  return false;
}

/**
 * Escolhe, dentre as notas de uma venda (já ordenadas da mais recente para a
 * mais antiga), a primeira REAPROVEITÁVEL — a que a emissão idempotente deve
 * devolver em vez de emitir outra. Ignora fantasmas de falha_pos_reserva.
 * Retorna null quando não há nenhuma reaproveitável (a venda pode emitir).
 *
 * @param {Array<{status?: string, xml_tipo?: string|null}>} [notas]
 * @returns {object|null}
 */
export function escolherNotaReaproveitavel(notas) {
  if (!Array.isArray(notas)) return null;
  return notas.find((n) => notaReaproveitavel(n)) ?? null;
}
