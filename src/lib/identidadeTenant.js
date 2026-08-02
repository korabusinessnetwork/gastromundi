// ──────────────────────────────────────────────────────────────────
// Identidade do estabelecimento — nome de exibição e logo (S1-3).
//
// Princípio nº 1: o dono tem o logo no computador ou no celular, não
// uma URL. Ele escolhe o arquivo e o sistema resolve — redimensiona,
// comprime e guarda. Nenhum campo de link, nenhum tamanho a calcular.
//
// Escrita: `tenants` não tem policy de UPDATE (ADR-005/008 §7), então
// tudo passa pela RPC `atualizar_identidade_tenant` (20260914), que
// resolve o tenant por auth.uid() — o front não escolhe o alvo.
//
// Armazenamento: reusa o bucket `delivery-fotos`, na pasta
// `{tenant_id}/identidade/`. As policies de 20260826 casam pela PRIMEIRA
// pasta do caminho, então o caminho aninhado já está autorizado e
// isolado por tenant, e o bucket já é público — que é o que a tela de
// login (pré-autenticação) precisa para exibir o logo. Bucket novo
// custaria mais um passo manual em produção sem ganho real.
//
// PNG, não JPEG: logo tem fundo transparente e a sidebar é escura. O
// `comprimirImagem` do Delivery pinta fundo branco de propósito (foto de
// prato não tem alpha) — usá-lo aqui poria um retângulo branco atrás da
// marca. Por isso a compressão é própria; só a matemática de dimensões
// (`calcularDimensoes`, pura e testada) é compartilhada.
// ──────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import {
  BUCKET_FOTOS, TAMANHO_MAX_ORIGINAL, ACCEPT_IMAGEM,
  tipoImagemAceito, calcularDimensoes, urlComVersao,
} from "@/lib/deliveryFotos";

export { ACCEPT_IMAGEM, TAMANHO_MAX_ORIGINAL };

/** Logo aparece pequeno (cabeçalho da sidebar, login, cardápio). */
export const MAX_LADO_LOGO = 512;
/** Limite do nome de exibição — o mesmo que a RPC valida no servidor. */
export const MAX_NOME_EXIBICAO = 40;

// ════════════════════════════════════════════════════════════════
// FUNÇÕES PURAS (testadas) — sem I/O, sem navegador
// ════════════════════════════════════════════════════════════════

/**
 * Caminho do logo no bucket: `{tenant_id}/identidade/logo.png`.
 * Determinístico — um logo por estabelecimento, troca sobrescreve, sem
 * órfão acumulando. Null sem tenant (não dá para montar o caminho).
 */
export function caminhoLogoTenant(tenantId) {
  const t = String(tenantId ?? "").trim();
  return t ? `${t}/identidade/logo.png` : null;
}

/** Nome como vai para o banco: sem espaço sobrando nas pontas. */
export function limparNomeExibicao(nome) {
  return String(nome ?? "").trim();
}

/**
 * Nome de exibição aceitável? Vazio não é erro do usuário — é "usar o
 * nome cadastrado" —, então quem valida o excesso é esta função e quem
 * decide o que fazer com o vazio é a tela.
 */
export function nomeExibicaoValido(nome) {
  return limparNomeExibicao(nome).length <= MAX_NOME_EXIBICAO;
}

/**
 * Houve mudança em relação ao que está salvo? É isto que mantém o botão
 * de salvar apagado enquanto não há o que salvar (prevenção de erro).
 */
export function identidadeMudou(atual, editado) {
  return limparNomeExibicao(atual?.nome) !== limparNomeExibicao(editado?.nome)
    || (atual?.logoUrl ?? "") !== (editado?.logoUrl ?? "");
}

// ════════════════════════════════════════════════════════════════
// NAVEGADOR (<canvas>) + I/O (Storage, RPC) — guardadas
// ════════════════════════════════════════════════════════════════

/**
 * Redimensiona um File de imagem para um Blob PNG, PRESERVANDO alpha.
 * Rejeita fora do navegador ou se a imagem não decodificar.
 * @returns {Promise<Blob>}
 */
export function comprimirLogo(file, { maxLado = MAX_LADO_LOGO } = {}) {
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
      // Sem fillRect: o fundo fica transparente, que é o ponto do logo.
      ctx.drawImage(img, 0, 0, largura, altura);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao processar a imagem."))),
        "image/png"
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler essa imagem. Tente um arquivo PNG ou JPG."));
    };
    img.src = objectUrl;
  });
}

/**
 * Comprime e envia o logo; devolve a URL pública VERSIONADA.
 * O caminho é fixo por tenant, então sem o `?v=` o navegador continuaria
 * mostrando o logo antigo depois da troca.
 * Nunca lança — sempre { url, error }.
 * @param {{ file: File, tenantId: string }} args
 */
export async function enviarLogoTenant({ file, tenantId }) {
  if (!file) return { url: null, error: new Error("Nenhuma imagem selecionada.") };
  if (!tipoImagemAceito(file.type)) {
    return { url: null, error: new Error("Envie um arquivo de imagem (PNG, JPG ou WEBP).") };
  }
  if (file.size > TAMANHO_MAX_ORIGINAL) {
    return { url: null, error: new Error("Imagem muito grande (máximo 8 MB).") };
  }
  const caminho = caminhoLogoTenant(tenantId);
  if (!caminho) return { url: null, error: new Error("Estabelecimento não identificado.") };

  let blob;
  try {
    blob = await comprimirLogo(file);
  } catch (e) {
    return { url: null, error: e instanceof Error ? e : new Error(String(e)) };
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(caminho, blob, { contentType: "image/png", upsert: true, cacheControl: "3600" });
  if (upErr) return { url: null, error: upErr };

  const { data } = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(caminho);
  return { url: urlComVersao(data?.publicUrl), error: null };
}

/**
 * Grava nome de exibição e logo em `tenants.tema` pela RPC.
 * Convenção da RPC: `null` não mexe na chave, string vazia REMOVE.
 * Nunca lança — sempre { data, error }.
 *
 * @param {{ nomeExibicao?: string|null, logoUrl?: string|null }} args
 */
export async function salvarIdentidadeTenant({ nomeExibicao = null, logoUrl = null } = {}) {
  if (nomeExibicao !== null && !nomeExibicaoValido(nomeExibicao)) {
    return {
      data: null,
      error: new Error(`O nome deve ter no máximo ${MAX_NOME_EXIBICAO} caracteres.`),
    };
  }
  try {
    const { data, error } = await supabase.rpc("atualizar_identidade_tenant", {
      p_nome_exibicao: nomeExibicao === null ? null : limparNomeExibicao(nomeExibicao),
      p_logo_url: logoUrl,
    });
    if (error) return { data: null, error };
    return { data: Array.isArray(data) ? data[0] : data, error: null };
  } catch (err) {
    return { data: null, error: new Error(err?.message ?? "Falha ao salvar a identidade.") };
  }
}
