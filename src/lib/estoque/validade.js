// Validade de produtos — C1.
//
// A validade real seria por lote de entrada; enquanto o estoque é um número
// agregado por produto, acompanhamos `proxima_validade` (date) preenchida
// manualmente. Estas funções puras calculam quantos dias faltam (ou já se
// passaram) e filtram os produtos vencendo dentro da janela configurada.

export const DIAS_ALERTA_VALIDADE_PADRAO = 7;

/**
 * Dias até a validade a partir de hoje (dia local, sem horas). Negativo =
 * já vencido; 0 = vence hoje. Retorna null quando não há data.
 *
 * @param {string|null|undefined} proximaValidade - "YYYY-MM-DD"
 * @param {Date} [hoje]
 * @returns {number|null}
 */
export function diasAteValidade(proximaValidade, hoje = new Date()) {
  if (!proximaValidade) return null;
  // "YYYY-MM-DD" + T00:00:00 → meia-noite local (não UTC), pra comparar dias
  const alvo = new Date(`${proximaValidade}T00:00:00`);
  if (isNaN(alvo.getTime())) return null;
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Produtos com validade dentro da janela de alerta (inclui já vencidos).
 * Ordena do mais urgente (menor nº de dias) para o menos urgente.
 *
 * @param {Array<object>} products - cada um pode ter `proxima_validade`
 * @param {number} [diasAlerta]
 * @param {Date} [hoje]
 * @returns {Array<{produto: object, dias: number, vencido: boolean}>}
 */
export function produtosVencendo(products, diasAlerta = DIAS_ALERTA_VALIDADE_PADRAO, hoje = new Date()) {
  const limite = Number(diasAlerta);
  const janela = Number.isFinite(limite) ? limite : DIAS_ALERTA_VALIDADE_PADRAO;
  return (Array.isArray(products) ? products : [])
    .map((produto) => ({ produto, dias: diasAteValidade(produto?.proxima_validade, hoje) }))
    .filter((x) => x.dias != null && x.dias <= janela)
    .map((x) => ({ ...x, vencido: x.dias < 0 }))
    .sort((a, b) => a.dias - b.dias);
}
