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
    fontBase:         17,
    fontSm:           15,
    fontLg:           20,
    fontXl:           26,
    pad:              18,
    padSm:            12,
    gap:              10,
  };

  if (width >= 1920) return {
    sidebarWidth:     260,
    comandaCardMin:   220,
    productCardMin:   185,
    cartWidth:        420,
    checkoutResumo:   860,
    fontBase:         19,
    fontSm:           17,
    fontLg:           24,
    fontXl:           34,
    pad:              32,
    padSm:            20,
    gap:              18,
  };

  if (width >= 1440) return {
    sidebarWidth:     240,
    comandaCardMin:   200,
    productCardMin:   165,
    cartWidth:        380,
    checkoutResumo:   760,
    fontBase:         18,
    fontSm:           16,
    fontLg:           22,
    fontXl:           30,
    pad:              28,
    padSm:            18,
    gap:              16,
  };

  if (width >= 1280) return {
    sidebarWidth:     220,
    comandaCardMin:   180,
    productCardMin:   148,
    cartWidth:        350,
    checkoutResumo:   680,
    fontBase:         17,
    fontSm:           15,
    fontLg:           21,
    fontXl:           28,
    pad:              24,
    padSm:            16,
    gap:              14,
  };

  // sm: 1024–1279
  return {
    sidebarWidth:     200,
    comandaCardMin:   155,
    productCardMin:   130,
    cartWidth:        320,
    checkoutResumo:   560,
    fontBase:         16,
    fontSm:           14,
    fontLg:           19,
    fontXl:           24,
    pad:              20,
    padSm:            14,
    gap:              12,
  };
}
