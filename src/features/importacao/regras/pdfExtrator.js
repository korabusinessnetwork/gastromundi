// ──────────────────────────────────────────────────────────────────
// Importador Inteligente — EXTRATOR de texto de PDF (só navegador).
//
// Camada FINA e sem lógica de negócio: usa o pdfjs-dist para transformar
// os bytes de um PDF em LINHAS DE TEXTO (o "trabalho pesado" de ler o
// arquivo). A organização em produtos é do núcleo puro e testado
// (pdfCardapio.js) — aqui só montamos as linhas por posição na página.
//
// pdfjs é pesado: carregamos por `import()` dinâmico (lazy) para NÃO
// inflar o bundle principal do PDV — só baixa quando o dono realmente
// importa um PDF. O worker entra via `?url` (Vite empacota e serve).
//
// Só lê PDF de TEXTO (cardápio digital). PDF escaneado/foto não tem
// camada de texto → sai vazio, e o núcleo avisa o dono (IA fica pra
// depois, conforme decisão de escopo).
// ──────────────────────────────────────────────────────────────────

const MAX_PAGINAS = 40; // cardápio real não passa disso; trava PDF gigante
const TOLERANCIA_Y = 3; // px: itens nessa faixa vertical são a mesma linha

// Imagem (OCR/IA): 2x deixa o texto nítido para leitura sem estourar
// memória; JPEG 0.85 equilibra qualidade e peso do upload.
const ESCALA_PADRAO = 2;
const QUALIDADE_JPEG = 0.85;
const MAX_PAGINAS_IMAGEM = 10; // imagem é pesada — trava mais que texto

/**
 * Carrega o pdfjs (lazy) e abre o documento. pdfjs é pesado, então só é
 * baixado quando o dono realmente importa um PDF — não infla o bundle do
 * PDV. O worker entra via `?url` (Vite empacota e serve no navegador).
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<import("pdfjs-dist").PDFDocumentProxy>}
 */
async function abrirPdf(bytes) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
}

/**
 * Extrai as linhas de texto de um PDF, na ordem de leitura (topo→base,
 * esquerda→direita), página a página.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<string[]>}
 */
export async function pdfParaLinhas(bytes) {
  const doc = await abrirPdf(bytes);

  const linhas = [];
  const total = Math.min(doc.numPages, MAX_PAGINAS);
  try {
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p);
      const conteudo = await page.getTextContent();
      linhas.push(...montarLinhasDaPagina(conteudo.items));
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }
  return linhas;
}

/**
 * Renderiza cada página do PDF em uma imagem JPEG (dataURL) — insumo para
 * o OCR de navegador (Tesseract) e para a leitura por IA (visão). É o
 * caminho para PDF escaneado/foto, que não tem camada de texto.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {{ escala?: number, maxPaginas?: number, qualidade?: number, onProgresso?: (feito:number, total:number) => void }} [opcoes]
 * @returns {Promise<string[]>} dataURLs "data:image/jpeg;base64,..."
 */
export async function pdfParaImagens(bytes, opcoes = {}) {
  const {
    escala = ESCALA_PADRAO,
    maxPaginas = MAX_PAGINAS_IMAGEM,
    qualidade = QUALIDADE_JPEG,
    onProgresso,
  } = opcoes;

  const doc = await abrirPdf(bytes);
  const imagens = [];
  const total = Math.min(doc.numPages, maxPaginas);
  try {
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const contexto = canvas.getContext("2d");
      await page.render({ canvasContext: contexto, viewport }).promise;
      imagens.push(canvas.toDataURL("image/jpeg", qualidade));
      // Libera a memória do canvas antes da próxima página (PDF grande).
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgresso?.(p, total);
    }
  } finally {
    doc.destroy();
  }
  return imagens;
}

/**
 * Agrupa os fragmentos de texto de uma página em linhas, usando a
 * posição (y para a linha, x para a ordem dentro dela). PDF costuma
 * quebrar uma frase em vários "items" — sem reagrupar, "X-Salada 24,90"
 * viria partido e a heurística de preço falharia.
 * @param {Array<{str:string, transform:number[]}>} items
 * @returns {string[]}
 */
function montarLinhasDaPagina(items) {
  const buckets = []; // { y, partes: [{x, str}] }

  for (const it of items) {
    const str = it?.str ?? "";
    if (!str.trim()) continue;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;

    let bucket = buckets.find((b) => Math.abs(b.y - y) <= TOLERANCIA_Y);
    if (!bucket) {
      bucket = { y, partes: [] };
      buckets.push(bucket);
    }
    bucket.partes.push({ x, str });
  }

  // y maior = mais alto na página → ordem de leitura é y decrescente.
  buckets.sort((a, b) => b.y - a.y);
  return buckets
    .map((b) =>
      b.partes
        .sort((a, c) => a.x - c.x)
        .map((parte) => parte.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}
