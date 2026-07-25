// ──────────────────────────────────────────────────────────────────
// Delivery — upload de FOTO do produto (armazenamento direto).
//
// Princípio nº 1 (intuitividade): o dono tem a foto no CELULAR, não uma
// URL. Então ele ESCOLHE/ TIRA a foto e o sistema cuida do resto —
// redimensiona, comprime e guarda. Sem colar link, sem hospedar fora.
//
// Zero custo (bootstrap): compressão client-side via <canvas> (nenhuma
// dependência paga) + Supabase Storage (bucket `delivery-fotos`, já no
// plano gratuito). A foto vai comprimida como JPEG, então o upload é
// leve e o custo de armazenamento fica mínimo.
//
// Caminho no bucket: `{tenant_id}/{produto_id}.jpg` — determinístico
// (uma foto por produto, troca sobrescreve, sem órfãos) e isolado por
// tenant (a policy de Storage só deixa o autenticado gravar na PRÓPRIA
// pasta — ver migration 20260806). Como o caminho é fixo, versionamos a
// URL pública (?v=timestamp) para o navegador/CDN não mostrar a antiga.
//
// Funções puras (caminho, dimensões, versão, tipo) nascem com teste
// (deliveryFotos.test.js). As de <canvas>/Storage são guardadas para não
// quebrarem fora do navegador.
// ──────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

export const BUCKET_FOTOS = "delivery-fotos";
export const MAX_LADO_PX = 1200;         // maior lado após redimensionar
export const QUALIDADE_JPEG = 0.8;       // 0..1 — bom equilíbrio p/ cardápio
export const TAMANHO_MAX_ORIGINAL = 8 * 1024 * 1024; // 8 MB antes de comprimir
// Aceito no seletor de arquivo (mobile: abre câmera + galeria).
export const ACCEPT_IMAGEM = "image/*";

// ════════════════════════════════════════════════════════════════
// FUNÇÕES PURAS (testadas) — sem I/O, sem navegador
// ════════════════════════════════════════════════════════════════

/** É uma imagem? (gate leve — o canvas decide se decodifica de fato). */
export function tipoImagemAceito(mime) {
  return String(mime || "").toLowerCase().startsWith("image/");
}

/**
 * Caminho do arquivo no bucket: `{tenant_id}/{produto_id}.jpg`.
 * Sempre .jpg porque comprimimos tudo para JPEG antes de enviar.
 * Devolve null se faltar tenant ou produto (não dá pra montar o caminho).
 */
export function caminhoFotoProduto(tenantId, produtoId) {
  const t = String(tenantId ?? "").trim();
  const p = String(produtoId ?? "").trim();
  if (!t || !p) return null;
  return `${t}/${p}.jpg`;
}

/**
 * Dimensões finais mantendo a proporção, sem NUNCA ampliar.
 * Se o maior lado já cabe em `maxLado`, devolve o tamanho original.
 */
export function calcularDimensoes(largura, altura, maxLado = MAX_LADO_PX) {
  const w = Math.max(0, Number(largura) || 0);
  const h = Math.max(0, Number(altura) || 0);
  if (w === 0 || h === 0) return { largura: 0, altura: 0 };
  const maior = Math.max(w, h);
  if (maior <= maxLado) return { largura: Math.round(w), altura: Math.round(h) };
  const escala = maxLado / maior;
  return { largura: Math.round(w * escala), altura: Math.round(h * escala) };
}

/**
 * Anexa um cache-buster à URL pública. O caminho é fixo por produto, então
 * sem isso o navegador/CDN mostraria a foto ANTIGA após uma troca.
 */
export function urlComVersao(url, versao = Date.now()) {
  if (!url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${versao}`;
}

/** Pasta do tenant no bucket (prefixo do .list()). Null se faltar tenant. */
export function pastaTenant(tenantId) {
  const t = String(tenantId ?? "").trim();
  return t || null;
}

/** É um arquivo de foto? (ignora placeholders/pastas que o Storage devolve). */
export function ehArquivoDeFoto(name) {
  return /\.(jpe?g|png|webp)$/i.test(String(name || ""));
}

/**
 * Versão estável (cache-friendly) de um item do Storage: usa a data de
 * atualização como carimbo, então a URL só muda quando a foto muda de fato.
 * Cai para 0 quando não há data (a URL fica sem ?v=, mas ainda válida).
 */
export function versaoDoArquivo(arquivo) {
  const quando = arquivo?.updated_at || arquivo?.created_at || arquivo?.metadata?.lastModified;
  const t = quando ? Date.parse(quando) : NaN;
  return Number.isFinite(t) ? t : 0;
}

// ════════════════════════════════════════════════════════════════
// NAVEGADOR (<canvas>) + I/O (Storage) — guardadas
// ════════════════════════════════════════════════════════════════

/**
 * Redimensiona/comprime um File de imagem para um Blob JPEG usando <canvas>.
 * Fundo branco (JPEG não tem transparência — um PNG transparente viraria
 * preto sem isso). Rejeita fora do navegador ou se a imagem não decodificar.
 * @returns {Promise<Blob>}
 */
export function comprimirImagem(file, { maxLado = MAX_LADO_PX, qualidade = QUALIDADE_JPEG } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
      return reject(new Error("Processamento de imagem indisponível neste ambiente."));
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { largura, altura } = calcularDimensoes(img.naturalWidth, img.naturalHeight, maxLado);
      if (!largura || !altura) return reject(new Error("Imagem inválida."));
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Não foi possível processar a imagem."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao processar a imagem."))),
        "image/jpeg",
        qualidade
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler essa imagem. Tente uma foto JPG ou PNG."));
    };
    img.src = objectUrl;
  });
}

/**
 * Comprime e envia a foto do produto ao bucket; devolve a URL pública
 * VERSIONADA pronta para gravar em produto_delivery.foto_url.
 * Nunca lança — sempre { url, error }.
 * @param {{ file: File, tenantId: string, produtoId: string|number }} args
 */
export async function enviarFotoProduto({ file, tenantId, produtoId }) {
  if (!file) return { url: null, error: new Error("Nenhuma foto selecionada.") };
  if (!tipoImagemAceito(file.type)) {
    return { url: null, error: new Error("Envie um arquivo de imagem (JPG, PNG ou WEBP).") };
  }
  if (file.size > TAMANHO_MAX_ORIGINAL) {
    return { url: null, error: new Error("Imagem muito grande (máximo 8 MB).") };
  }
  const caminho = caminhoFotoProduto(tenantId, produtoId);
  if (!caminho) {
    return { url: null, error: new Error("Estabelecimento ou produto não identificado.") };
  }

  let blob;
  try {
    blob = await comprimirImagem(file);
  } catch (e) {
    return { url: null, error: e instanceof Error ? e : new Error(String(e)) };
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(caminho, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (upErr) return { url: null, error: upErr };

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho);
  return { url: urlComVersao(data?.publicUrl), error: null };
}

/**
 * Lista TODAS as fotos já enviadas pelo tenant (galeria do Delivery).
 * A policy de SELECT do bucket é escopada por tenant, então isto só
 * enxerga a PRÓPRIA pasta. Devolve itens prontos para exibir:
 *   { path, nome, url } — `url` pública e versionada (cache-friendly).
 * Nunca lança — sempre { fotos, error }.
 * @param {string} tenantId
 */
export async function listarFotosDelivery(tenantId) {
  const pasta = pastaTenant(tenantId);
  if (!pasta) return { fotos: [], error: new Error("Estabelecimento não identificado.") };

  const { data, error } = await supabase.storage
    .from(BUCKET_FOTOS)
    .list(pasta, { limit: 1000, sortBy: { column: "updated_at", order: "desc" } });
  if (error) return { fotos: [], error };

  const fotos = (data || [])
    .filter((arq) => ehArquivoDeFoto(arq?.name))
    .map((arq) => {
      const path = `${pasta}/${arq.name}`;
      const { data: pub } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path);
      return { path, nome: arq.name, url: urlComVersao(pub?.publicUrl, versaoDoArquivo(arq)) };
    });
  return { fotos, error: null };
}

/**
 * Reaproveita uma foto já existente na galeria para o produto atual,
 * COPIANDO-a para o slot próprio `{tenant}/{produto}.jpg`. Copiar (em vez
 * de só apontar a URL) mantém os produtos INDEPENDENTES: trocar a foto de
 * um depois não mexe no outro. Devolve a URL nova versionada.
 * Nunca lança — sempre { url, error }.
 * @param {{ tenantId: string, produtoId: string|number, origemPath: string }} args
 */
export async function copiarFotoParaProduto({ tenantId, produtoId, origemPath }) {
  const destino = caminhoFotoProduto(tenantId, produtoId);
  if (!destino) return { url: null, error: new Error("Estabelecimento ou produto não identificado.") };
  if (!origemPath) return { url: null, error: new Error("Nenhuma foto selecionada.") };

  // Já é a foto deste produto? Nada a copiar — só devolve a URL atual.
  if (origemPath === destino) {
    const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(destino);
    return { url: urlComVersao(data?.publicUrl), error: null };
  }

  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_FOTOS).download(origemPath);
  if (dlErr) return { url: null, error: dlErr };

  const { error: upErr } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(destino, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (upErr) return { url: null, error: upErr };

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(destino);
  return { url: urlComVersao(data?.publicUrl), error: null };
}
