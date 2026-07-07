/**
 * F020 — conversões puras de largura de papel térmico (58mm/80mm) pra
 * pixels de CSS e pra colunas de texto monoespaçado (usado tanto no
 * preview raster quanto na quebra de linha do driver ESC/POS, que não
 * tem CSS e precisa quebrar o texto ele mesmo).
 *
 * Escala escolhida (3.75 px/mm) preserva o comportamento do F015: os
 * 300px fixos de body{width} equivaliam a 80mm (300/80 = 3.75).
 */

export const PX_POR_MM = 3.75;

// Largura média de um caractere de "Courier New" monoespaçada, em
// múltiplos do tamanho da fonte (aprox. 0.6em por caractere).
const LARGURA_CHAR_EM_EMS = 0.6;

const MINIMO_COLUNAS = 10;

/**
 * @param {number} larguraMm
 * @returns {number} largura em pixels de CSS, arredondada
 */
export function larguraEmPx(larguraMm) {
  const mm = Number(larguraMm) > 0 ? Number(larguraMm) : 80;
  return Math.round(mm * PX_POR_MM);
}

/**
 * Quantas colunas (caracteres) cabem numa linha, dada a largura do
 * papel e o tamanho da fonte usada — mais colunas em 80mm do que em
 * 58mm para a mesma fonte.
 *
 * @param {number} larguraMm
 * @param {number} [fontePx]
 * @returns {number}
 */
export function colunasPorLargura(larguraMm, fontePx = 13) {
  const larguraPx = larguraEmPx(larguraMm);
  const fonte = Number(fontePx) > 0 ? Number(fontePx) : 13;
  const colunas = Math.floor(larguraPx / (fonte * LARGURA_CHAR_EM_EMS));
  return Math.max(MINIMO_COLUNAS, colunas);
}

/**
 * Quebra um texto em linhas de no máximo `colunas` caracteres,
 * respeitando espaços entre palavras (quebra "dura" só se uma palavra
 * sozinha já excede `colunas`). Pura, sem dependência de DOM/CSS —
 * usada pelo driver ESC/POS (texto puro, sem word-wrap do navegador).
 *
 * @param {string} texto
 * @param {number} colunas
 * @returns {string[]}
 */
export function quebrarLinha(texto, colunas) {
  const largura = Math.max(1, Number(colunas) || MINIMO_COLUNAS);
  const palavras = String(texto ?? "").split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [""];

  const linhas = [];
  let atual = "";
  for (const palavra of palavras) {
    if (palavra.length > largura) {
      if (atual) { linhas.push(atual); atual = ""; }
      for (let i = 0; i < palavra.length; i += largura) {
        linhas.push(palavra.slice(i, i + largura));
      }
      continue;
    }
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (candidato.length > largura) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = candidato;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}
