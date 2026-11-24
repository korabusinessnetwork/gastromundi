// Regras do mapa de mesas, usadas pelas Mesas do computador e pela seção Mesas
// das Configurações do celular (refatoração 4.10; antes cada tela tinha a sua).

// Medidas da grade do mapa: o gancho calcula quantas colunas e linhas cabem.
export const CARD_W   = 110;
export const CARD_H   = 96;
export const CARD_GAP = 12;
export const MIN_COLS = 4;
export const MIN_ROWS = 3;

export const EMPTY_FORM = { numero: "", capacidade: "4" };

/**
 * A mesa nova entra numa coluna livre à direita da última, sempre na linha 1.
 * Não é bonito, mas é uma posição sempre válida: o mapa nunca quebra por causa
 * de uma mesa criada no celular.
 */
export function proximaPosicaoLivre(mesas) {
  if (mesas.length === 0) return { posicao_x: 1, posicao_y: 1 };
  const maxX = Math.max(...mesas.map((m) => m.posicao_x ?? 1));
  return { posicao_x: maxX + 1, posicao_y: 1 };
}

/** Capacidade digitada: pelo menos 1 lugar; vazio ou inválido vira 4. */
export function capacidadeDaMesa(texto) {
  return Math.max(1, parseInt(texto, 10) || 4);
}

/**
 * Por que a mesa nova não pode ser criada, ou `null` se pode: sem número, ou
 * número que já existe.
 */
export function erroNovaMesa(numero, mesas) {
  if (!numero) return "Informe o número ou nome da mesa.";
  if (mesas.some((m) => m.numero === numero)) return "Já existe uma mesa com este número/nome.";
  return null;
}
