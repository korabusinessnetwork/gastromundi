/**
 * Design tokens — F018: fonte única de verdade é agora tema.css (CSS Custom Properties).
 * Este objeto contém apenas os NOMES dos tokens (sem hex), usados como índice para
 * acessar as vars em var(${C.key}). Valores default (idênticos aos hex legados)
 * vivem em src/styles/tema.css.
 *
 * Razão: ao usar var(${C.accent}) em qualquer inline style ou helper, a cor
 * é resolvida em runtime via CSS, permitindo que tenant.tema (via aplicarVariaveisTema)
 * recolora tudo sem código JS. Props que precisam de valor hex real
 * (ícones, charts) usam o hook useCor(C.accent) em vez de C.accent direto.
 *
 * ADR-007, Decisão 018, Plano F018.
 */
const C = {
  bg:      "--gm-bg",
  card:    "--gm-card",
  surface: "--gm-surface",
  border:  "--gm-border",
  accent:  "--gm-accent",
  alow:    "--gm-alow",
  green:   "--gm-green",
  red:     "--gm-red",
  blue:    "--gm-blue",
  text:    "--gm-text",
  muted:   "--gm-muted",
  faint:   "--gm-faint",
};

export default C;
