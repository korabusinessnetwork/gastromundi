/**
 * Tokens de tamanho responsivos.
 * Uso: const sz = getSizes(width)  — onde width vem de useResponsive()
 *
 * Breakpoints (do maior para o menor):
 *   xxxl : 3840+ (4K)
 *   xxl  : 2560–3839 (2K / ultrawide)
 *   xl   : 1920–2559 (Full HD)
 *   lg   : 1440–1919
 *   md   : 1280–1439
 *   sm   : 1024–1279
 *   tab  : 768–1023  (tablet)
 *   mob  : 360–767   (mobile)
 *   mini : <360      (celular muito pequeno)
 *
 * Propriedades extras:
 *   gridCols — valor CSS para gridTemplateColumns em grids de 2 colunas mobile
 *   isMini   — true quando width < 360
 *
 * NOTA (2026-07-23): `comandaCardMin` é consumido SÓ pelo grid da Frente de
 * Caixa (ComandaGrid.jsx). Foi reduzido ~12% em todos os breakpoints porque o
 * card estava grande demais — cabem mais comandas por tela sem o operador
 * precisar rolar. `productCardMin` (grade de produtos) ficou como estava.
 * Tamanho de FONTE não mora mais aqui: veja src/styles/tipografia.css.
 */
export function getSizes(width) {
  // 4K
  if (width >= 3840) return {
    sidebarWidth:   360, comandaCardMin: 245, productCardMin: 240,
    cartWidth:      560, checkoutResumo: 1200,
    fontBase:        22, fontSm:  19, fontLg:  28, fontXl:  52,
    pad:             48, padSm:   28, gap:     24,
    gridCols: "1fr 1fr", isMini: false,
  };

  // 2K / ultrawide
  if (width >= 2560) return {
    sidebarWidth:   300, comandaCardMin: 220, productCardMin: 210,
    cartWidth:      480, checkoutResumo: 1060,
    fontBase:        20, fontSm:  18, fontLg:  26, fontXl:  44,
    pad:             40, padSm:   24, gap:     20,
    gridCols: "1fr 1fr", isMini: false,
  };

  // Full HD
  if (width >= 1920) return {
    sidebarWidth:   260, comandaCardMin: 195, productCardMin: 185,
    cartWidth:      420, checkoutResumo: 860,
    fontBase:        19, fontSm:  17, fontLg:  24, fontXl:  34,
    pad:             32, padSm:   20, gap:     18,
    gridCols: "1fr 1fr", isMini: false,
  };

  if (width >= 1440) return {
    sidebarWidth:   240, comandaCardMin: 176, productCardMin: 165,
    cartWidth:      380, checkoutResumo: 760,
    fontBase:        18, fontSm:  16, fontLg:  22, fontXl:  30,
    pad:             28, padSm:   18, gap:     16,
    gridCols: "1fr 1fr", isMini: false,
  };

  if (width >= 1280) return {
    sidebarWidth:   220, comandaCardMin: 158, productCardMin: 148,
    cartWidth:      350, checkoutResumo: 680,
    fontBase:        17, fontSm:  15, fontLg:  21, fontXl:  28,
    pad:             24, padSm:   16, gap:     14,
    gridCols: "1fr 1fr", isMini: false,
  };

  // sm: 1024–1279
  if (width >= 1024) return {
    sidebarWidth:   200, comandaCardMin: 136, productCardMin: 130,
    cartWidth:      320, checkoutResumo: 560,
    fontBase:        16, fontSm:  14, fontLg:  19, fontXl:  24,
    pad:             20, padSm:   14, gap:     12,
    gridCols: "1fr 1fr", isMini: false,
  };

  // tablet: 768–1023
  if (width >= 768) return {
    sidebarWidth:   180, comandaCardMin: 124, productCardMin: 120,
    cartWidth:        0, checkoutResumo: 0,
    fontBase:        16, fontSm:  14, fontLg:  20, fontXl:  26,
    pad:             20, padSm:   14, gap:     10,
    gridCols: "1fr 1fr 1fr", isMini: false,
  };

  // mini: <360 (celulares muito pequenos)
  if (width < 360) return {
    sidebarWidth:     0, comandaCardMin: 100, productCardMin: 100,
    cartWidth:        0, checkoutResumo:   0,
    fontBase:        14, fontSm:  12, fontLg:  17, fontXl:  20,
    pad:             12, padSm:    8, gap:      8,
    gridCols: "1fr", isMini: true,
  };

  // mobile: 360–767
  return {
    sidebarWidth:     0, comandaCardMin: 124, productCardMin: 120,
    cartWidth:        0, checkoutResumo:   0,
    fontBase:        17, fontSm:  15, fontLg:  20, fontXl:  26,
    pad:             18, padSm:   12, gap:     10,
    gridCols: "1fr 1fr", isMini: false,
  };
}
