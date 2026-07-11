import * as browserRaster from "./browserRaster";
import * as escposQzTray from "./escposQzTray";

/**
 * F020 — registro de drivers de impressão (decisão 025). Cada driver
 * implementa a MESMA interface — `{ imprimir(documento, perfil) =>
 * Promise<{error}> }` — então templates (src/lib/impressao.js,
 * renderizar.js) e UI (PerfilImpressora.jsx) nunca falam com um driver
 * específico, só com essa interface. Um driver novo (WebUSB/
 * WebSerial, agente local, etc.) só precisa:
 *   1. implementar `imprimir(documento, perfil)`;
 *   2. entrar no mapa `DRIVERS` abaixo com uma chave nova;
 * nada mais muda — nem os templates, nem a tela de perfil.
 */
export const DRIVER_PADRAO = "browser-raster";

const DRIVERS = {
  "browser-raster": browserRaster,
  "escpos-qztray": escposQzTray,
};

export const OPCOES_DRIVER = [
  { id: "browser-raster", label: "Impressão do navegador (gratuito)" },
  { id: "escpos-qztray", label: "QZ Tray (ESC/POS, impressora térmica dedicada)" },
];

/**
 * Resolve qual driver usar a partir do perfil — pura (só um lookup em
 * mapa, sem I/O). Cai no default (browser-raster) se o perfil não
 * tiver driver configurado, ou apontar pra um nome desconhecido.
 *
 * @param {{driver?: string}} [perfil]
 * @returns {{imprimir: (documento: object, perfil: object) => Promise<{error: object|null}>}}
 */
export function selecionarDriver(perfil) {
  return DRIVERS[perfil?.driver] ?? DRIVERS[DRIVER_PADRAO];
}

/**
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} [perfil] - perfilImpressora (ver src/lib/impressao.js)
 * @returns {Promise<{error: object|null}>}
 */
export async function imprimirDocumento(documento, perfil) {
  const driver = selecionarDriver(perfil);
  return driver.imprimir(documento, perfil);
}
