// ──────────────────────────────────────────────────────────────────
// Importador Inteligente — OCR OFFLINE no navegador (Tesseract.js).
//
// A "leva de IA" GRÁTIS e sem chave: para PDF escaneado/foto (sem camada
// de texto), renderiza cada página em imagem e roda OCR em português no
// próprio navegador do dono. Nada sai do dispositivo — 100% offline.
//
// Tesseract é pesado e busca o worker + dados de idioma sob demanda, então
// carregamos por `import()` dinâmico (lazy): só baixa quando o dono escolhe
// "ler no navegador". As linhas reconhecidas seguem para o MESMO núcleo
// puro e testado (extrairProdutosDoTextoPdf) — zero regra nova aqui.
//
// Trade-off honesto: OCR erra mais que PDF de texto ou que a IA de visão.
// É a opção grátis/offline; a IA (Gemini) fica para quem quiser mais
// precisão, sempre com confirmação do dono antes de enviar o cardápio.
// ──────────────────────────────────────────────────────────────────

import { pdfParaImagens } from "./pdfExtrator";
import { extrairProdutosDoTextoPdf } from "./pdfCardapio";

/**
 * Roda OCR (português) em cada página de um PDF escaneado e devolve os
 * produtos no formato do pipeline. Puxa Tesseract sob demanda.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {(fase:string, feito:number, total:number) => void} [onProgresso]
 * @returns {Promise<{ produtos: Array<{name:string, price:number, category:string}>, avisos: Array<{linha:number, mensagem:string}> }>}
 */
export async function pdfParaProdutosOCR(bytes, onProgresso) {
  const imagens = await pdfParaImagens(bytes, {
    onProgresso: (feito, total) => onProgresso?.("render", feito, total),
  });

  if (imagens.length === 0) {
    return {
      produtos: [],
      avisos: [{ linha: 0, mensagem: "Não consegui abrir as páginas desse PDF para leitura." }],
    };
  }

  const { default: Tesseract } = await import("tesseract.js");

  const todasLinhas = [];
  for (let i = 0; i < imagens.length; i++) {
    const { data } = await Tesseract.recognize(imagens[i], "por", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgresso?.("ocr", i + (m.progress ?? 0), imagens.length);
        }
      },
    });
    const linhas = String(data?.text ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    todasLinhas.push(...linhas);
  }

  return extrairProdutosDoTextoPdf(todasLinhas);
}
