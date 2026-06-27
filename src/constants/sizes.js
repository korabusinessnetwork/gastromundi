/**
 * Tokens de tamanho responsivos.
 * Uso: const sz = getSizes(width)  — onde width vem de useResponsive()
 *
 * Breakpoints:
 *   xl : 1920+ (Full HD — alvo principal)
 *   lg : 1440–1919
 *   md : 1280–1439
 *   sm : 1024–1279
 */
export function getSizes(width) {
  if (width < 768) return {
    sidebarWidth:     0,
    comandaCardMin:   140,
    productCardMin:   120,
    cartWidth:        0,
    checkoutResumo:   0,
    fontBase:         14,
    fontSm:           12,
    fontLg:           17,
    fontXl:           22,
    pad:              16,
    padSm:            10,
    gap:              10,
  };

  if (width >= 1920) return {
    // Layout
    sidebarWidth:     260,
    // PDV
    comandaCardMin:   220,
    productCardMin:   185,
    cartWidth:        380,
    checkoutResumo:   640,
    // Tipografia
    fontBase:         15,
    fontSm:           13,
    fontLg:           20,
    fontXl:           28,
    // Espaçamento
    pad:              28,
    padSm:            16,
    gap:              16,
  };

  if (width >= 1440) return {
    sidebarWidth:     240,
    comandaCardMin:   200,
    productCardMin:   165,
    cartWidth:        340,
    checkoutResumo:   560,
    fontBase:         14,
    fontSm:           12,
    fontLg:           18,
    fontXl:           24,
    pad:              24,
    padSm:            14,
    gap:              14,
  };

  if (width >= 1280) return {
    sidebarWidth:     220,
    comandaCardMin:   180,
    productCardMin:   148,
    cartWidth:        310,
    checkoutResumo:   500,
    fontBase:         14,
    fontSm:           12,
    fontLg:           17,
    fontXl:           22,
    pad:              20,
    padSm:            12,
    gap:              12,
  };

  // sm: 1024–1279
  return {
    sidebarWidth:     200,
    comandaCardMin:   155,
    productCardMin:   130,
    cartWidth:        280,
    checkoutResumo:   420,
    fontBase:         13,
    fontSm:           11,
    fontLg:           15,
    fontXl:           19,
    pad:              16,
    padSm:            10,
    gap:              10,
  };
}
