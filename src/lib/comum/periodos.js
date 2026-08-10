/**
 * Intervalos de período (De/Até) para filtros financeiros e relatórios.
 *
 * Funções puras: recebem a data de referência (default: hoje) e devolvem
 * `{ de, ate }` como strings `YYYY-MM-DD` no fuso LOCAL. Usar componentes
 * locais (getFullYear/getMonth/getDate) em vez de toISOString evita o desvio
 * de UTC que, em fusos positivos, joga o primeiro dia do mês para o mês
 * anterior — os lançamentos comparam `competencia` como string, então o
 * formato precisa bater exatamente com o que o <input type="date"> emite.
 */

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** Mês inteiro da referência: [dia 1, último dia]. */
export function intervaloDoMes(ref = new Date()) {
  const de  = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const ate = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { de: fmt(de), ate: fmt(ate) };
}

/** Mês anterior inteiro. */
export function intervaloMesPassado(ref = new Date()) {
  const de  = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const ate = new Date(ref.getFullYear(), ref.getMonth(), 0);
  return { de: fmt(de), ate: fmt(ate) };
}

/** Últimos `n` dias contando hoje (n=7 → hoje e os 6 anteriores). */
export function intervaloUltimosDias(n, ref = new Date()) {
  const ate = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const de  = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - (n - 1));
  return { de: fmt(de), ate: fmt(ate) };
}

/** Ano inteiro da referência: [1º de jan, 31 de dez]. */
export function intervaloDoAno(ref = new Date()) {
  const de  = new Date(ref.getFullYear(), 0, 1);
  const ate = new Date(ref.getFullYear(), 11, 31);
  return { de: fmt(de), ate: fmt(ate) };
}

/**
 * Atalhos de período oferecidos na UI (intuitividade: um toque cobre os
 * recortes mais pedidos; o De/Até fica para quando o usuário quer um
 * intervalo específico). Cada `intervalo(hoje)` é uma função pura.
 */
export const PRESETS_PERIODO = [
  { chave: "mes",        rotulo: "Este mês",    intervalo: (h) => intervaloDoMes(h) },
  { chave: "mesPassado", rotulo: "Mês passado", intervalo: (h) => intervaloMesPassado(h) },
  { chave: "7d",         rotulo: "7 dias",      intervalo: (h) => intervaloUltimosDias(7, h) },
  { chave: "30d",        rotulo: "30 dias",     intervalo: (h) => intervaloUltimosDias(30, h) },
  { chave: "ano",        rotulo: "Este ano",    intervalo: (h) => intervaloDoAno(h) },
];

/**
 * Qual atalho corresponde ao período atual (para destacar o chip ativo).
 * Devolve a `chave` do preset que bate exatamente com `{de, ate}`, ou
 * `"personalizado"` quando o usuário escolheu um intervalo à mão.
 */
export function detectarPreset(periodo, ref = new Date()) {
  if (!periodo) return "personalizado";
  for (const p of PRESETS_PERIODO) {
    const { de, ate } = p.intervalo(ref);
    if (de === periodo.de && ate === periodo.ate) return p.chave;
  }
  return "personalizado";
}
