/**
 * Edge Function: jarvas-assistente
 *
 * Assistente conversacional do Jarvas (fase 5 — JARVAS.md).
 * Responde perguntas sobre o negócio usando SOMENTE dados reais
 * agregados aqui no servidor (vendas 30d, estoque, fechamentos,
 * insights abertos), via API da Anthropic.
 *
 * A chave da Anthropic NUNCA vai ao frontend (regra do CLAUDE.md).
 *
 * Autenticação: JWT válido com role admin ou gerente (verificado aqui).
 *
 * Secrets necessários (supabase secrets set):
 *   ANTHROPIC_API_KEY  — obrigatório
 *   JARVAS_MODEL       — opcional (default: claude-haiku-4-5-20251001)
 *
 * Deploy:
 *   supabase functions deploy jarvas-assistente --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo para checar role)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Valida JWT e role do chamador ───────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado." }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !caller) return json({ error: "Sessão inválida." }, 401);

    const { data: callerData } = await supabaseClient
      .from("users")
      .select("role, name")
      .eq("auth_id", caller.id)
      .single();

    if (!callerData || !["admin", "gerente"].includes(callerData.role)) {
      return json({ error: "Assistente disponível apenas para gerência." }, 403);
    }

    const { pergunta, historico } = await req.json();
    if (!pergunta || typeof pergunta !== "string" || pergunta.length > 1000) {
      return json({ error: "Pergunta inválida." }, 400);
    }

    // ── 2. Agrega contexto do negócio (server-side, campos mínimos) ─
    const corte30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [vendasRes, fechRes, configRes, produtosRes, insightsRes] = await Promise.all([
      supabaseClient.from("sales").select("data, at").gte("at", corte30).order("at", { ascending: false }).limit(2000),
      supabaseClient.from("fechamentos").select("data, created_at").order("created_at", { ascending: false }).limit(5),
      supabaseClient.from("config").select("key, value").in("key", ["estoque", "caixa_aberto"]),
      supabaseClient.from("products").select("id, name, price, category, active").eq("active", true),
      supabaseClient.from("jarvas_insights").select("tipo, severidade, modulo, titulo, descricao, status, created_at").in("status", ["novo", "lido"]).order("created_at", { ascending: false }).limit(20),
    ]);

    // Resumo de vendas: total, por dia, top produtos (unidades e receita)
    const porDia: Record<string, number> = {};
    const porProduto: Record<string, { unidades: number; receita: number }> = {};
    let totalVendas = 0;
    for (const row of vendasRes.data ?? []) {
      const venda = (row as { data?: Record<string, unknown> }).data ?? row;
      const total = Number((venda as { total?: number }).total ?? 0);
      totalVendas += total;
      const dia = String((venda as { at?: string }).at ?? (row as { at?: string }).at ?? "").slice(0, 10);
      porDia[dia] = (porDia[dia] ?? 0) + total;
      for (const it of ((venda as { items?: Array<Record<string, unknown>> }).items ?? [])) {
        if (it.cancelado || !it.name) continue;
        const nome = String(it.name);
        porProduto[nome] = porProduto[nome] ?? { unidades: 0, receita: 0 };
        porProduto[nome].unidades += Number(it.qty ?? 1);
        porProduto[nome].receita += Number(it.price ?? 0) * Number(it.qty ?? 1);
      }
    }
    const topProdutos = Object.entries(porProduto)
      .sort((a, b) => b[1].receita - a[1].receita)
      .slice(0, 15)
      .map(([nome, v]) => ({ nome, ...v, receita: +v.receita.toFixed(2) }));

    const estoque = (configRes.data ?? []).find((c) => c.key === "estoque")?.value ?? {};
    const caixaAberto = (configRes.data ?? []).find((c) => c.key === "caixa_aberto")?.value ?? null;
    const nomesPorId: Record<string, string> = {};
    for (const p of produtosRes.data ?? []) nomesPorId[String(p.id)] = String(p.name);
    const estoqueLegivel = Object.fromEntries(
      Object.entries(estoque as Record<string, number>).map(([id, q]) => [nomesPorId[id] ?? id, q]),
    );

    const contexto = {
      data_atual: new Date().toISOString(),
      caixa_aberto: caixaAberto,
      vendas_30_dias: {
        total: +totalVendas.toFixed(2),
        numero_de_vendas: (vendasRes.data ?? []).length,
        por_dia: porDia,
        top_produtos: topProdutos,
      },
      estoque_atual: estoqueLegivel,
      ultimos_fechamentos: (fechRes.data ?? []).map((f) => f.data),
      insights_jarvas_abertos: insightsRes.data ?? [],
    };

    // ── 3. Chama a API da Anthropic ────────────────────────────────
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY não configurada no Supabase." }, 500);

    const system = [
      "Você é o Jarvas, a IA do GastroMundi — sistema de gestão de restaurante/varejo.",
      `Está conversando com ${callerData.name} (${callerData.role}).`,
      "Responda em português do Brasil, de forma direta e prática, como um braço direito do dono.",
      "REGRAS OBRIGATÓRIAS:",
      "- Use SOMENTE os dados do contexto JSON fornecido. NUNCA invente números.",
      "- Se o dado não estiver no contexto, diga que não tem essa informação.",
      "- Valores em R$. Sempre que possível, termine com uma sugestão de ação concreta.",
      "- Você não executa ações — apenas informa e sugere.",
      `CONTEXTO DO NEGÓCIO:\n${JSON.stringify(contexto)}`,
    ].join("\n");

    const mensagens = [
      ...(Array.isArray(historico) ? historico.slice(-6) : []).map((m: { papel: string; texto: string }) => ({
        role: m.papel === "jarvas" ? "assistant" : "user",
        content: String(m.texto).slice(0, 2000),
      })),
      { role: "user", content: pergunta },
    ];

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("JARVAS_MODEL") ?? "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system,
        messages: mensagens,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("Anthropic API error:", resp.status, errBody.slice(0, 300));
      return json({ error: "Falha ao consultar o assistente. Tente novamente." }, 502);
    }

    const resultado = await resp.json();
    const resposta = (resultado.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n");

    return json({ resposta });
  } catch (err) {
    console.error("jarvas-assistente error:", err);
    return json({ error: "Erro interno do assistente." }, 500);
  }
});
