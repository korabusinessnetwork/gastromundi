import C from "./colors";

// Mapa reverso hex → token de tema, usado por `alfa()` pra saber se uma
// cor é de marca (segue o tenant) ou uma cor semântica fixa (ex.: AMBER
// de alertas de tempo em ComandaGrid, que não é customizável por tenant).
const HEX_PARA_TOKEN = Object.fromEntries(
  Object.entries(C)
    .filter(([, v]) => typeof v === "string" && v.startsWith("#"))
    .map(([nome, hex]) => [hex.toLowerCase(), `--gm-${nome}`])
);

/**
 * Blend com transparência, ADR-007 (color-mix como padrão de blend com
 * alfa). Substitui o antigo truque `${C.accent}44` (hex + sufixo de
 * alfa, incompatível com CSS Custom Properties) preservando a mesma
 * opacidade renderizada (sufixo hex → porcentagem, arredondado ao %
 * mais próximo).
 *
 * Se `cor` for um token de marca conhecido (ex. `C.accent`), o blend
 * usa `var(--gm-*)` e segue o tema do tenant (decisão 017); senão (cor
 * semântica fixa, não vinda de `colors.js`), usa a cor literal.
 *
 * @param {string} cor - hex (ex. "#7c3aed") ou já um token C.xxx
 * @param {string} hexAlfa - sufixo de alfa em hex, 2 dígitos (ex. "44")
 * @returns {string}
 */
export function alfa(cor, hexAlfa) {
  const pct = Math.round((parseInt(hexAlfa, 16) / 255) * 100);
  const token = HEX_PARA_TOKEN[cor?.toLowerCase?.()];
  const base = token ? `var(${token})` : cor;
  return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
}
