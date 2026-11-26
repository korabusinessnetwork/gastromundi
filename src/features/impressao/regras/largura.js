/**
 * F020 — conversões puras de largura de papel térmico (58mm/80mm).
 *
 * São dois mundos diferentes e eles não se misturam:
 * - o PREVIEW na tela, que é HTML com CSS: `larguraEmPx` e
 *   `colunasPorLargura` estimam quanto cabe numa fonte de tela;
 * - a IMPRESSORA térmica, que não tem CSS nenhum: `colunasEscpos` dá o
 *   número de colunas fixado pelo hardware.
 * Quem manda papel pra impressora usa `colunasEscpos`.
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

// Colunas REAIS da impressora térmica, na Fonte A (a que a Ponte usa —
// ela manda `ESC @` e nunca troca de fonte). Isso é hardware: o papel de
// 80mm imprime 48 caracteres por linha e o de 58mm imprime 32, sempre,
// não importa o que a tela mostra. NADA a ver com `colunasPorLargura`,
// que é conta de pixel de CSS e serve só pro preview raster do navegador.
const COLUNAS_FONTE_A_POR_LARGURA = { 80: 48, 58: 32 };

// Papel fora do padrão (nem 80mm nem 58mm) não existe em impressora
// térmica comum, mas o campo é digitável no perfil do estabelecimento.
// Regra: usamos as colunas do maior papel padrão que ainda CABE no que
// foi informado — assim a linha nunca fica mais larga que o papel, que é
// o erro que embaralha a comanda. Papel mais estreito que 58mm cai no 32
// (não há padrão menor), e largura ausente/inválida cai em 80mm, o mesmo
// default do resto do módulo.
const LARGURA_PADRAO_MM = 80;

/**
 * Quantas colunas de texto a impressora térmica realmente imprime nesta
 * largura de papel. É essa a conta que vale pra comanda impressa.
 *
 * @param {number} larguraMm - largura do papel configurada no perfil do estabelecimento
 * @returns {number} colunas (inteiro positivo)
 */
export function colunasEscpos(larguraMm) {
  const mm = Number(larguraMm) > 0 ? Number(larguraMm) : LARGURA_PADRAO_MM;
  if (mm >= 80) return COLUNAS_FONTE_A_POR_LARGURA[80];
  return COLUNAS_FONTE_A_POR_LARGURA[58];
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
