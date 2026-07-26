/**
 * Formatadores compartilhados da superfície /palm (mobile garçom+comanda).
 * Fonte única para os componentes de apresentação em src/pages/mobile/.
 *
 * Mantém EXATAMENTE o comportamento atual do MobilePage:
 * - dinheiro como `R$ 12.50` (ponto, toFixed(2)) — não muda a aparência
 *   herdada; qualquer troca para vírgula pt-BR seria decisão de produto à parte.
 * - nº de comanda puramente numérico ganha o prefixo "Comanda"; nomes
 *   livres (ex.: "Mesa VIP") passam intactos.
 */

export function fmtComanda(name) {
  return /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;
}

export function fmtDinheiro(v) {
  return `R$ ${Number(v ?? 0).toFixed(2)}`;
}
