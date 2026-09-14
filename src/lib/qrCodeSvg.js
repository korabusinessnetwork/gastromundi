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
  const svg = await QRCode.toString(conteudo, { type: "svg", margin, errorCorrectionLevel: "M" });
  if (!svgSeguro(svg)) {
    // Não deve acontecer com a lib atual, que desenha só `path`. Existe
    // porque este é o ÚNICO `dangerouslySetInnerHTML` do app: se um dia a
    // biblioteca mudar, ou for trocada por uma que ecoe o texto de entrada
    // dentro de um `<title>`, o cupom passaria a injetar markup vindo de
    // dado. Recusar aqui faz o <CupomNfce> cair no estado de erro que ele
    // já tem, em vez de injetar.
    throw new Error("QR Code recusado: o SVG gerado não tem a forma esperada.");
  }
  return svg;
}

/**
 * O markup é um SVG simples, sem nada executável?
 *
 * Allowlist de forma, não blocklist de palavra: começa com `<svg`, termina
 * com `</svg>`, e não contém elemento de script/estrangeiro, atributo de
 * evento (`onload=`), `javascript:` nem `<foreignObject>`. Função pura,
 * exportada para o teste conseguir cobrar cada caso.
 *
 * @param {unknown} svg
 * @returns {boolean}
 */
export function svgSeguro(svg) {
  if (typeof svg !== "string") return false;
  const texto = svg.trim();
  if (!texto.startsWith("<svg") || !texto.endsWith("</svg>")) return false;
  // `on...=` cobre onload, onerror, onclick e o que a especificação
  // inventar depois; a fronteira à esquerda evita raspar um atributo
  // legítimo que só termine em "on" (ex.: `version=`).
  if (/<\s*(script|foreignObject|iframe|embed|object|use|animate|set)\b/i.test(texto)) return false;
  if (/(?:^|[\s"'])on[a-z]+\s*=/i.test(texto)) return false;
  if (/javascript\s*:/i.test(texto)) return false;
  // `href`/`xlink:href` num QR só aparece se alguém pendurar link no
  // desenho, o que esta lib não faz e o cupom não precisa.
  if (/\bxlink:href\b|\shref\s*=/i.test(texto)) return false;
  return true;
}
