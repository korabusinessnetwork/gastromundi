
export const CARD_W   = 110;

export const CARD_H   = 96;

export const CARD_GAP = 12;

export const MIN_COLS = 4;

export const MIN_ROWS = 3;

export const EMPTY_FORM = { numero: "", capacidade: "4" };

export function proximaPosicaoLivre(mesas) {
  if (mesas.length === 0) return { posicao_x: 1, posicao_y: 1 };
  const maxX = Math.max(...mesas.map(m => m.posicao_x ?? 1));
  return { posicao_x: maxX + 1, posicao_y: 1 };
}
