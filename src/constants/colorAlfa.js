/**
 * Blend com transparência, ADR-007 (color-mix como padrão de blend com
 * alfa). Substitui o antigo truque `${C.accent}44` (hex + sufixo de
 * alfa, incompatível com CSS Custom Properties) preservando a mesma
 * opacidade renderizada (sufixo hex → porcentagem, arredondado ao %
 * mais próximo).
 *
 * F018 update: `colors.js` agora contém nomes de tokens (ex. "--gm-accent")
 * em vez de hex. Então:
 * - Se `cor` começa com "--gm-", é um token name → usa `var(cor)` direto
 *   e segue o tema do tenant (decisão 017).
 * - Senão, usa a cor como veio. Dois casos caem aqui: uma string `var(--gm-x)`
 *   já montada por `varColor()` (o color-mix é aplicado por cima do var, então
 *   o blend segue o tema do tenant do mesmo jeito), e as poucas paletas
 *   categóricas que ainda são hex literal (impostos, métodos de pagamento,
 *   força de senha — resíduo do TD018).
 *
 * @param {string} cor - token name (ex. "--gm-accent" via C.xxx) ou hex literal
 * @param {string} hexAlfa - sufixo de alfa em hex, 2 dígitos (ex. "44")
 * @returns {string}
 */
export function alfa(cor, hexAlfa) {
  const pct = Math.round((parseInt(hexAlfa, 16) / 255) * 100);
  // F018: colors.js agora retorna nomes de tokens, check direto por "--gm-"
  const base = (cor && typeof cor === "string" && cor.startsWith("--gm-"))
    ? `var(${cor})`
    : cor; // fallback: cor literal (hex ou outra)
  return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
}
