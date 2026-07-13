/**
 * Edge Function: provisionar-estabelecimento
 *
 * Console da Plataforma (S1-2, ADR-008 §7). Cria um estabelecimento novo
 * (tenant) E o seu primeiro usuário admin numa única operação atômica —
 * é o que efetivamente liga o multi-tenant real (o 2º cliente em diante).
 *
 * Por que uma Edge Function e não só SQL: criar a credencial em
 * auth.users exige a Admin API (service_role), que NÃO pode ser exposta
 * ao front. A criação do tenant em si é delegada à RPC provisionar_tenant
 * (SECURITY DEFINER, 20260727) chamada com o JWT do CHAMADOR — assim a
 * própria RPC reconfirma que quem chama é super-admin `plataforma`.
 *
 * Autorização: o chamador precisa ser super-admin `plataforma`
 * (role='plataforma' em public.users). Um admin de estabelecimento comum
 * recebe 403 — provisionar tenants é ação da PLATAFORMA (decisão 027).
 *
 * Convenção de username (decisão de bootstrap — ver ADR-008, evolução):
 * o login do app monta o e-mail como `${username}@gastromundi.local`
 * GLOBAL. Enquanto o login não for ciente de tenant, o username precisa
 * ser único na plataforma inteira — se já existir, esta função recusa
 * com 409 e mensagem clara (prevenção de erro > erro cru).
 *
 * Atomicidade: se a criação do admin falhar depois do tenant criado, o
 * tenant é removido (compensação) para não deixar estabelecimento órfão
 * sem dono. Se a inserção do perfil falhar depois do auth criado, o auth
 * e o tenant são removidos. Nunca deixa meio-usuário (o bug que a tela
 * "Criar Usuário" do app produzia).
 *
 * Deploy:
 *   supabase functions deploy provisionar-estabelecimento --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo para checar o papel plataforma)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Valida o JWT do chamador e exige papel `plataforma` ───────
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
      .select("role")
      .eq("auth_id", caller.id)
      .single();

    if (callerData?.role !== "plataforma") {
      return json({ error: "Acesso restrito à plataforma." }, 403);
    }

    // ── 2. Valida a entrada ──────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Corpo inválido." }, 400);

    const nome = (body.nome ?? "").trim();
    const planoCodigo = (body.plano_codigo ?? "avancado").trim();
    const tema = body.tema ?? {};
    const admin = body.admin ?? {};
    const username = (admin.username ?? "").trim().toLowerCase();
    const password = admin.password ?? "";
    const adminName = (admin.name ?? "").trim();

    if (!nome) return json({ error: "O nome do estabelecimento é obrigatório." }, 400);
    if (!username || !password) {
      return json({ error: "username e password do admin são obrigatórios." }, 400);
    }
    if (!adminName) return json({ error: "O nome do admin é obrigatório." }, 400);

    // ── 3. Cria o tenant via RPC (reconfirma super-admin pelo JWT) ────
    // provisionar_tenant retorna RETURNS public.tenants (uma linha
    // composta, não SETOF) → o supabase-js devolve como objeto direto,
    // sem .single().
    const { data: tenant, error: eTenant } = await supabaseCaller
      .rpc("provisionar_tenant", {
        p_nome: nome,
        p_plano_codigo: planoCodigo,
        p_tema: tema,
      });

    if (eTenant || !tenant) {
      return json({ error: eTenant?.message ?? "Falha ao criar o estabelecimento." }, 400);
    }

    // ── 4. Cliente admin (service_role) para operar auth.users ───────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Username precisa ser único na plataforma (login global). Recusa cedo.
    const email = `${username}@gastromundi.local`;
    const { data: jaExiste } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (jaExiste) {
      // Compensa: apaga o tenant recém-criado (ainda sem dono).
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return json({ error: `O username "${username}" já está em uso. Escolha outro.` }, 409);
    }

    // ── 5. Cria a credencial de auth do 1º admin ─────────────────────
    const { data: authCreated, error: eAuth } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: adminName, username, role: "admin" },
    });

    if (eAuth || !authCreated?.user) {
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return json({ error: eAuth?.message ?? "Falha ao criar a credencial do admin." }, 400);
    }

    // ── 6. Cria o PERFIL do admin já vinculado ao tenant novo ────────
    // role='admin' + tenant_id do novo estabelecimento → satisfaz a
    // constraint users_tenant_por_papel e o hook JWT injeta o tenant
    // certo no primeiro login deste admin.
    const { error: ePerfil } = await supabaseAdmin.from("users").insert({
      name: adminName,
      username,
      role: "admin",
      active: true,
      auth_id: authCreated.user.id,
      tenant_id: tenant.id,
    });

    if (ePerfil) {
      // Compensação total: sem perfil, o auth e o tenant não servem.
      await supabaseAdmin.auth.admin.deleteUser(authCreated.user.id);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return json({ error: ePerfil.message ?? "Falha ao criar o perfil do admin." }, 400);
    }

    return json({
      tenant_id: tenant.id,
      nome: tenant.nome,
      plano_codigo: tenant.plano_codigo,
      admin: { username, auth_id: authCreated.user.id },
    });
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
