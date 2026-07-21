/**
 * Edge Function: ler-cardapio-ia
 *
 * Leitura de cardápio por IA de VISÃO (Importador Inteligente). Recebe as
 * imagens das páginas de um cardápio (PDF escaneado/foto) e devolve os
 * itens estruturados { name, price, category } usando o Gemini Flash.
 *
 * Por que no servidor: a chave da IA (GEMINI_API_KEY) NUNCA pode ir ao
 * frontend/bundle/log (regra do CLAUDE.md). Aqui ela vive em Deno.env.
 *
 * Autenticação: exige JWT válido (usuário autenticado do estabelecimento).
 * Sem gate a função vira um proxy aberto e queima a quota grátis de
 * qualquer um — por isso barramos anônimo.
 *
 * A IA só EXTRAI o que está visível e com preço — nunca inventa itens ou
 * valores (mesma regra do Jarvas). O front ainda passa tudo pelo
 * normalizador e pelo validador de produtos antes de gravar.
 *
 * Secrets necessários (supabase secrets set):
 *   GEMINI_API_KEY  — obrigatório (gerar grátis no Google AI Studio)
 *   GEMINI_MODEL    — opcional (default: gemini-2.0-flash)
 *
 * Deploy (MANUAL, pelo dono):
 *   supabase functions deploy ler-cardapio-ia --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_IMAGENS = 10; // trava de custo/quota — cardápio real cabe nisso
const PREFIXO_JPEG = "data:image/jpeg;base64,";

/**
 * Traduz a falha do Gemini numa CAUSA clara para o dono — sem nunca expor a
 * chave (que só viaja no header `x-goog-api-key`, jamais no corpo de erro do
 * Google). Devolve { motivo, dica } a partir do status HTTP e da mensagem
 * que o Gemini retorna em `error.message`/`error.status`.
 */
function causaGemini(status: number, body: string): { motivo: string; dica: string } {
  let msgGoogle = "";
  try {
    const j = JSON.parse(body);
    msgGoogle = j?.error?.message ?? j?.error?.status ?? "";
  } catch {
    msgGoogle = body.slice(0, 160);
  }
  const base = msgGoogle ? ` (Google: ${msgGoogle})` : "";
  switch (status) {
    case 400:
      return {
        motivo: `Requisição recusada pelo Gemini${base}.`,
        dica: "Confira o nome do modelo em GEMINI_MODEL (ex.: gemini-2.0-flash) e se as imagens são JPEG válidos.",
      };
    case 401:
    case 403:
      return {
        motivo: `Chave da IA inválida ou API não habilitada${base}.`,
        dica: "Gere a chave no Google AI Studio e habilite a 'Generative Language API' no projeto. Reconfigure o secret GEMINI_API_KEY.",
      };
    case 404:
      return {
        motivo: `Modelo do Gemini não encontrado${base}.`,
        dica: "Ajuste GEMINI_MODEL para um modelo válido (ex.: gemini-2.0-flash ou gemini-1.5-flash).",
      };
    case 429:
      return {
        motivo: `Cota da IA esgotada no momento${base}.`,
        dica: "Aguarde alguns minutos (limite grátis por minuto/dia) e tente de novo.",
      };
    default:
      return {
        motivo: `Gemini indisponível (HTTP ${status})${base}.`,
        dica: "Instabilidade do serviço do Google — tente novamente em instantes.",
      };
  }
}


const PROMPT = [
  "Você lê CARDÁPIOS de restaurante/lanchonete a partir de imagens.",
  "Extraia TODOS os itens que têm um PREÇO visível.",
  "Responda SOMENTE com um JSON array, sem texto fora dele, no formato:",
  '[{"name":"nome do item","price":"24,90","category":"seção do cardápio"}]',
  "REGRAS OBRIGATÓRIAS:",
  "- NUNCA invente itens, preços ou seções. Extraia apenas o que está visível.",
  "- Se um item não tiver preço claro, NÃO o inclua.",
  "- price no formato brasileiro (vírgula decimal), sem o símbolo R$.",
  "- category = o título da seção onde o item aparece (ex: Lanches, Bebidas). Se não houver, deixe \"\".",
  "- Não inclua descrições, endereço, telefone ou textos que não sejam itens.",
].join("\n");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Exige usuário autenticado (evita proxy aberto) ───────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ erro: "Não autorizado." }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !caller) return json({ erro: "Sessão inválida." }, 401);

    // ── 2. Valida as imagens recebidas ──────────────────────────────
    const { imagens } = await req.json();
    if (!Array.isArray(imagens) || imagens.length === 0) {
      return json({ erro: "Nenhuma imagem de cardápio recebida." }, 400);
    }
    if (imagens.length > MAX_IMAGENS) {
      return json({ erro: `Envie no máximo ${MAX_IMAGENS} páginas por vez.` }, 400);
    }

    const partesImagem = [];
    for (const img of imagens) {
      if (typeof img !== "string" || !img.startsWith(PREFIXO_JPEG)) {
        return json({ erro: "Formato de imagem inválido." }, 400);
      }
      partesImagem.push({
        inline_data: { mime_type: "image/jpeg", data: img.slice(PREFIXO_JPEG.length) },
      });
    }

    // ── 3. Chama o Gemini (visão) ───────────────────────────────────
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ erro: "GEMINI_API_KEY não configurada no Supabase." }, 500);

    const modelo = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, ...partesImagem] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      // Nunca logamos a chave; só status e um trecho do corpo de erro.
      console.error("Gemini API error:", resp.status, errBody.slice(0, 300));
      const { motivo, dica } = causaGemini(resp.status, errBody);
      return json({ erro: motivo, dica, status_gemini: resp.status }, 502);
    }

    const resultado = await resp.json();
    const texto = (resultado?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    if (!texto) return json({ erro: "A IA não retornou itens legíveis." }, 502);

    // Devolve o texto cru da IA; o front normaliza/valida antes de gravar.
    return json({ itens: texto });
  } catch (err) {
    console.error("ler-cardapio-ia error:", err);
    return json({ erro: "Erro interno na leitura por IA." }, 500);
  }
});
