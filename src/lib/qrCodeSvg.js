/**
 * Render de QR Code como SVG — offline e gratuito (Restrições de Custo).
 *
 * Único ponto do app que sabe transformar um texto (a URL do QR da NFC-e,
 * já pronta pela Leva 3) num SVG desenhável. Isolado de propósito: se um
 * dia trocarmos a biblioteca ou a forma de render (imagem, canvas), muda
 * só aqui — o componente <CupomNfce> não sabe como o QR é gerado.
 *
 * Usa a lib `qrcode` (MIT, gratuita, sem serviço pago e sem rede): gera o
 * SVG localmente, no próprio dispositivo — coerente com a impressão de
 * cupom, que precisa funcionar mesmo com a internet instável (o mesmo
 * cenário da contingência offline). Sem canvas, então roda igual no
 * browser e nos testes (jsdom).
 */

import QRCode from "qrcode";

/**
 * Gera o SVG (string) de um QR Code para o texto dado.
 *
 * @param {string} texto conteúdo do QR (ex.: URL de consulta da NFC-e)
 * @param {{ margin?: number }} [opts]
 * @returns {Promise<string>} markup <svg>…</svg> pronto para injeção
 */
export async function montarSvgQrCode(texto, { margin = 1 } = {}) {
  const conteudo = String(texto ?? "");
  if (!conteudo) {
    throw new Error("QR Code exige um texto (a URL de consulta da NFC-e).");
  }
  // Nível de correção de erro M: equilíbrio padrão da NFC-e (bom para
  // impressão térmica sem exagerar no tamanho do módulo).
  return QRCode.toString(conteudo, { type: "svg", margin, errorCorrectionLevel: "M" });
}
