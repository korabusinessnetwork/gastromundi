/**
 * Edge Function: importar-dados
 *
 * Migração de dados — Fase 3 (docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md).
 * Caminho PROGRAMÁTICO do mesmo pipeline da aba "Importar / Exportar":
 * volumes grandes/automação e, principalmente, o Console da plataforma
 * importando EM NOME de um tenant no onboarding assistido (provisiona o
 * estabelecimento com provisionar-estabelecimento e já sobe o cardápio
 * na mesma chamada de suporte).
 *
 * Reuso real: validação e planejamento vêm dos MESMOS módulos puros do
 * front (src/lib/importacao/planilha.js e plano.js, empacotados no
 * deploy) — as regras de parsing/idempotência existem num lugar só.
 *
 * Autorização (dois perfis, nunca anônimo):
 *   • super-admin `plataforma` → OBRIGADO a informar tenant_id (em quem
 *     está importando); padrão do provisionar-estabelecimento.
 *   • `admin` de estabelecimento → importa só no PRÓPRIO tenant (o
 *     tenant_id do corpo, se vier, tem que bater com o dele — senão 403).
 *
 * Segurança: o service_role fica só aqui (nunca no front). Como ele
 * ignora RLS e não tem claim de tenant, TODA leitura filtra e TODA
 * escrita seta `tenant_id` explicitamente — o tenant NUNCA vem do CSV.
 *
 * Corpo (JSON):
 *   { tipo: "produtos"|"clientes"|"estoque", csv: string,
 *     tenant_id?: uuid, dry_run?: boolean }
 * dry_run=true → só valida e devolve o plano (nada gravado) — é o
 * preview do wizard, em API.
 *
 * Deploy:
 *   supabase functions deploy importar-dados --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo para checar o papel)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validarPlanilhaProdutos,
  validarPlanilhaClientes,
  validarPlanilhaEstoque,
} from "../../../src/lib/importacao/planilha.js";
import {
  planejarImportacaoProdutos,
  paraPayloadProduto,
  planejarImportacaoClientes,
  paraPayloadCliente,
  planejarImportacaoEstoque,
} from "../../../src/lib/importacao/plano.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB — acima disso, dividir o arquivo
const LOTE = 500; // servidor aguenta lote maior que o front

const TIPOS_VALIDOS = ["produtos", "clientes", "estoque"] as const;
type Tipo = (typeof TIPOS_VALIDOS)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Valida o JWT do chamador e resolve papel + tenant ─────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado." }, 401);

    const supabaseCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseCaller.auth.getUser();
    if (authError || !caller) return json({ error: "Sessão inválida." }, 401);

    const { data: callerData } = await supabaseCaller
      .from("users")
      .select("role, tenant_id")
      .eq("auth_id", caller.id)
      .single();

    const papel = callerData?.role;
    if (papel !== "plataforma" && papel !== "admin") {
      return json({ error: "Acesso restrito a administradores." }, 403);
    }

    // ── 2. Valida a entrada e resolve o tenant alvo ──────────────────
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Corpo inválido." }, 400);

    const tipo = String(body.tipo ?? "") as Tipo;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return json({ error: `tipo precisa ser um de: ${TIPOS_VALIDOS.join(", ")}.` }, 400);
    }

    const csv = body.csv;
    if (typeof csv !== "string" || !csv.trim()) {
      return json({ error: "csv (texto do arquivo) é obrigatório." }, 400);
    }
    if (csv.length > MAX_CSV_BYTES) {
      return json({ error: "Arquivo maior que 5 MB — divida em partes menores." }, 400);
    }

    const dryRun = body.dry_run === true;
    const tenantCorpo = (body.tenant_id ?? "").trim?.() || null;
    let tenantAlvo: string;

    if (papel === "plataforma") {
      // Plataforma importa EM NOME de alguém — dizer em quem é obrigatório.
      if (!tenantCorpo) return json({ error: "tenant_id é obrigatório para a plataforma." }, 400);
      tenantAlvo = tenantCorpo;
    } else {
      // Admin comum só importa no próprio estabelecimento.
      if (!callerData?.tenant_id) return json({ error: "Usuário sem tenant — relogue e tente de novo." }, 403);
      if (tenantCorpo && tenantCorpo !== callerData.tenant_id) {
        return json({ error: "Você só pode importar no seu próprio estabelecimento." }, 403);
      }
      tenantAlvo = callerData.tenant_id;
    }

    // Cliente admin (service_role): ignora RLS, então TODA query abaixo
    // filtra/seta tenant_id explicitamente.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Tenant precisa existir (erro claro > FK estourando no meio do lote)
    const { data: tenant } = await supabaseAdmin
      .from("tenants").select("id").eq("id", tenantAlvo).maybeSingle();
    if (!tenant) return json({ error: "Estabelecimento (tenant_id) não encontrado." }, 404);

    const usuario = caller.user_metadata?.username ?? caller.email ?? "importar-dados";

    // ── 3. Valida o CSV + monta o plano (módulos puros do front) ─────
    // deno-lint-ignore no-explicit-any
    let validacao: { erros: any[]; avisos: any[] };
    // deno-lint-ignore no-explicit-any
    let executar: () => Promise<{ criados: number; atualizados: number; error: any }>;
    // deno-lint-ignore no-explicit-any
    let resumoPlano: Record<string, any>;

    if (tipo === "produtos") {
      const v = validarPlanilhaProdutos(csv);
      const { data: existentes, error: eBusca } = await supabaseAdmin
        .from("products")
        .select("id, name, price, category, emoji, active, unidade_estoque")
        .eq("tenant_id", tenantAlvo);
      if (eBusca) return json({ error: "Falha ao ler os produtos atuais do tenant." }, 500);

      const plano = planejarImportacaoProdutos(v.produtos, existentes ?? []);
      validacao = { erros: v.erros, avisos: v.avisos };
      resumoPlano = {
        criar: plano.criar.length,
        atualizar: plano.atualizar.length,
        iguais: plano.iguais.length,
        categorias_novas: plano.categoriasNovas,
      };
      executar = async () => {
        let criados = 0, atualizados = 0;
        for (let i = 0; i < plano.criar.length; i += LOTE) {
          const lote = plano.criar.slice(i, i + LOTE)
            .map((item) => ({ ...paraPayloadProduto(item), tenant_id: tenantAlvo }));
          const { error } = await supabaseAdmin.from("products").insert(lote);
          if (error) return { criados, atualizados, error };
          criados += lote.length;
        }
        for (const { id, changes } of plano.atualizar) {
          const { error } = await supabaseAdmin
            .from("products").update(changes).eq("id", id).eq("tenant_id", tenantAlvo);
          if (error) return { criados, atualizados, error };
          atualizados += 1;
        }
        return { criados, atualizados, error: null };
      };
    } else if (tipo === "clientes") {
      const v = validarPlanilhaClientes(csv);
      const { data: existentes, error: eBusca } = await supabaseAdmin
        .from("clientes")
        .select("id, nome, telefone, endereco, observacoes")
        .eq("tenant_id", tenantAlvo)
        .eq("anonimizado", false);
      if (eBusca) return json({ error: "Falha ao ler os clientes atuais do tenant." }, 500);

      const plano = planejarImportacaoClientes(v.clientes, existentes ?? []);
      validacao = { erros: v.erros, avisos: v.avisos };
      resumoPlano = {
        criar: plano.criar.length,
        atualizar: plano.atualizar.length,
        iguais: plano.iguais.length,
      };
      executar = async () => {
        let criados = 0, atualizados = 0;
        for (let i = 0; i < plano.criar.length; i += LOTE) {
          const lote = plano.criar.slice(i, i + LOTE)
            .map((item) => ({ ...paraPayloadCliente(item, usuario), tenant_id: tenantAlvo }));
          const { error } = await supabaseAdmin.from("clientes").insert(lote);
          if (error) return { criados, atualizados, error };
          criados += lote.length;
        }
        for (const { id, changes } of plano.atualizar) {
          const { error } = await supabaseAdmin
            .from("clientes")
            .update({ ...changes, updated_at: new Date().toISOString() })
            .eq("id", id).eq("tenant_id", tenantAlvo);
          if (error) return { criados, atualizados, error };
          atualizados += 1;
        }
        return { criados, atualizados, error: null };
      };
    } else {
      const v = validarPlanilhaEstoque(csv);
      const [{ data: produtos, error: eProdutos }, { data: atual, error: eAtual }] = await Promise.all([
        supabaseAdmin.from("products").select("id, name").eq("tenant_id", tenantAlvo),
        supabaseAdmin.from("estoque").select("produto_id, quantidade, minimo").eq("tenant_id", tenantAlvo),
      ]);
      if (eProdutos || eAtual) return json({ error: "Falha ao ler o estoque atual do tenant." }, 500);

      const plano = planejarImportacaoEstoque(v.itens, produtos ?? [], atual ?? []);
      // Produto fora do cardápio entra como erro por linha — mesma UX do wizard
      validacao = { erros: [...v.erros, ...plano.naoEncontrados], avisos: v.avisos };
      resumoPlano = {
        criar: 0,
        atualizar: plano.definir.length,
        iguais: plano.iguais.length,
      };
      executar = async () => {
        let atualizados = 0;
        for (let i = 0; i < plano.definir.length; i += LOTE) {
          const lote = plano.definir.slice(i, i + LOTE)
            .map(({ produto_id, quantidade, minimo }) => ({
              produto_id, quantidade, minimo,
              tenant_id: tenantAlvo,
              updated_at: new Date().toISOString(),
            }));
          const { error } = await supabaseAdmin
            .from("estoque").upsert(lote, { onConflict: "produto_id" });
          if (error) return { criados: 0, atualizados, error };
          atualizados += lote.length;
        }
        return { criados: 0, atualizados, error: null };
      };
    }

    // ── 4. Dry-run devolve o plano; execução real grava em lotes ─────
    const base = { tipo, tenant_id: tenantAlvo, dry_run: dryRun, plano: resumoPlano, ...validacao };
    if (dryRun) return json(base);

    const r = await executar();
    if (r.error) {
      // Parou no primeiro erro: devolve o que já entrou — reenviar o
      // MESMO arquivo continua de onde parou (o plano é idempotente).
      return json({
        ...base,
        criados: r.criados,
        atualizados: r.atualizados,
        error: `A gravação parou no meio: ${r.error.message ?? "erro no banco"}. Reenvie o mesmo arquivo que o resto continua de onde parou.`,
      }, 500);
    }

    return json({ ...base, criados: r.criados, atualizados: r.atualizados });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno." }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
