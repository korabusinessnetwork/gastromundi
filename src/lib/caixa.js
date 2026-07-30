import { round2 } from "./vendas";

/**
 * Conferência de caixa — uma conta só, usada pelo fechamento, pelo relatório,
 * pela exportação e pelo Jarvas.
 *
 * Existia a mesma fórmula copiada em quatro lugares (`totalVendas + fundo`), e
 * ela estava errada nos quatro: valor recebido em método que não tem linha de
 * conferência (fiado, voucher, método desativado nas configurações) entrava no
 * "esperado em caixa" sem ter onde ser contado. O caixa fechado no centavo
 * aparecia com falta do valor inteiro desses métodos — no relatório, na
 * planilha exportada e como alerta do Jarvas.
 */

/** Abaixo de meio centavo não é diferença de caixa, é arredondamento. */
export const TOLERANCIA_CENTAVO = 0.004;

/**
 * Quanto deveria estar na gaveta, segundo o fechamento `f`.
 *
 * Fechamentos gravados a partir desta versão trazem `totalEsperado`: a soma
 * apenas dos métodos que tinham linha de conferência, mais o fundo. Nos
 * anteriores o campo não existe e o melhor palpite possível é vendas + fundo,
 * que era exatamente o que a tela mostrava quando aquele caixa foi fechado.
 *
 * @param {object} f Payload do fechamento (`fechamentos.data`).
 * @returns {number}
 */
export function esperadoEmCaixa(f) {
  if (typeof f?.totalEsperado === "number" && Number.isFinite(f.totalEsperado)) {
    return round2(f.totalEsperado);
  }
  return round2((f?.totalVendas ?? 0) + (f?.fundo ?? 0));
}

/**
 * Diferença entre o que foi contado e o que era esperado, já sem deriva de
 * ponto flutuante (positiva = sobra, negativa = falta).
 *
 * @param {object} f Payload do fechamento.
 * @returns {number}
 */
export function diferencaCaixa(f) {
  return round2((f?.totalConferido ?? 0) - esperadoEmCaixa(f));
}

/**
 * Situação do caixa a partir da diferença.
 *
 * @param {number} diferenca
 * @returns {"conferido"|"sobra"|"falta"}
 */
export function situacaoCaixa(diferenca) {
  const d = Number(diferenca);
  if (!Number.isFinite(d) || Math.abs(d) <= TOLERANCIA_CENTAVO) return "conferido";
  return d > 0 ? "sobra" : "falta";
}

/** Rótulo humano de cada situação — o mesmo texto em toda tela. */
export const ROTULO_SITUACAO = {
  conferido: "Caixa Conferido",
  sobra: "Sobra no Caixa",
  falta: "Falta no Caixa",
};
