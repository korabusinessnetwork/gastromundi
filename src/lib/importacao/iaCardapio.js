// ──────────────────────────────────────────────────────────────────
// Importador Inteligente — LEITURA POR IA (visão) do cardápio.
//
// A opção de MAIOR precisão para PDF escaneado/foto e layouts bagunçados:
// renderiza as páginas em imagem e envia para a Edge Function
// `ler-cardapio-ia`, que fala com o modelo de visão (Gemini) usando uma
// chave que vive SÓ no servidor (nunca no bundle/log — regra do CLAUDE.md).
//
// Confirmação do dono (decisão do dono): esta função só é chamada DEPOIS
// que a tela pede o "ok" — porque as imagens do cardápio saem do
// dispositivo e vão para um serviço externo (Google). A tela é a dona do
// consentimento; aqui apenas executamos o envio já autorizado.
//
// A resposta da IA passa pelo normalizador puro e testado
// (normalizarItensIA) — nunca confiamos cegamente no que a IA devolve.
// ──────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { pdfParaImagens } from "./pdfExtrator";
import { normalizarItensIA } from "./pdfCardapio";

// Envio para IA é caro (tokens/quota): tratamos poucas páginas por vez.
const MAX_PAGINAS_IA = 8;

/**
 * Lê um cardápio (PDF escaneado/foto) por IA de visão via Edge Function.
 * PRESSUPÕE consentimento já dado pela tela (as imagens saem para um
 * serviço externo). Devolve produtos no formato do pipeline.
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {(fase:string, feito:number, total:number) => void} [onProgresso]
 * @returns {Promise<{ produtos: Array<{name:string, price:number, category:string}>, avisos: Array<{linha:number, mensagem:string}> }>}
 */
export async function lerCardapioComIA(bytes, onProgresso) {
  const imagens = await pdfParaImagens(bytes, {
    maxPaginas: MAX_PAGINAS_IA,
    onProgresso: (feito, total) => onProgresso?.("render", feito, total),
  });

  if (imagens.length === 0) {
    return {
      produtos: [],
      avisos: [{ linha: 0, mensagem: "Não consegui abrir as páginas desse PDF para a leitura por IA." }],
    };
  }

  onProgresso?.("ia", 0, 1);
  const { data, error } = await supabase.functions.invoke("ler-cardapio-ia", {
    body: { imagens },
  });
  onProgresso?.("ia", 1, 1);

  if (error) {
    // A Edge Function responde não-2xx com a CAUSA no corpo, mas o
    // supabase-js transforma isso em `error` e não popula `data`. O corpo
    // vem em `error.context` (Response) — lemos para mostrar o motivo real
    // (ex.: chave inválida, cota esgotada) em vez de um genérico.
    const detalhe = await lerCorpoDoErro(error);
    const mensagem = detalhe
      ? detalhe
      : "A leitura por IA falhou. Tente de novo mais tarde ou importe por planilha.";
    return { produtos: [], avisos: [{ linha: 0, mensagem }] };
  }
  if (data?.erro) {
    const extra = data?.dica ? ` ${data.dica}` : "";
    return { produtos: [], avisos: [{ linha: 0, mensagem: `${data.erro}${extra}` }] };
  }

  return normalizarItensIA(data?.itens ?? data);
}

/**
 * Extrai a causa legível do erro de uma Edge Function. O supabase-js embrulha
 * respostas não-2xx num FunctionsHttpError cujo corpo fica em `error.context`
 * (um Response). Tenta ler `{ erro, dica }` de lá. Nunca lança — na dúvida,
 * devolve string vazia e o chamador usa a mensagem genérica.
 * @param {any} error
 * @returns {Promise<string>}
 */
export async function lerCorpoDoErro(error) {
  try {
    const ctx = error?.context;
    if (!ctx || typeof ctx.json !== "function") return "";
    const corpo = await ctx.json();
    if (!corpo?.erro) return "";
    return corpo.dica ? `${corpo.erro} ${corpo.dica}` : String(corpo.erro);
  } catch {
    return "";
  }
}
