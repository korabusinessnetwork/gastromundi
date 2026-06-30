/**
 * Edge Function: manage-user
 *
 * Permite criar, atualizar senha e deletar usuários em auth.users
 * sem expor a service_role key no frontend.
 *
 * Ações:
 *   create         — cria conta em auth.users e vincula auth_id na tabela users
 *   update_password — atualiza a senha de um usuário existente
 *   delete         — remove a conta de auth.users
 *
 * Autenticação: requer JWT válido com role = admin (verificado aqui).
 *
 * Deploy:
 *   supabase functions deploy manage-user --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo para checar role)
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
    // ── 1. Valida JWT do chamador ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Não autorizado." }, 401);
    }

    // Cliente com a anon key para decodificar o JWT do chamador
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !caller) {
      return json({ error: "Sessão inválida." }, 401);
    }

    // Verifica se o chamador é admin pela tabela users
    const { data: callerData } = await supabaseClient
      .from("users")
      .select("role")
      .eq("auth_id", caller.id)
      .single();

    if (callerData?.role !== "admin") {
      return json({ error: "Acesso restrito a administradores." }, 403);
    }

    // ── 2. Cliente admin (service_role) para operar auth.users ────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { action, username, password, auth_id, name, role } = body;

    // ── 3. Ações ───────────────────────────────────────────────────
    if (action === "create") {
      if (!username || !password) return json({ error: "username e password obrigatórios." }, 400);

      const email = `${username.trim().toLowerCase()}@gastromundi.local`;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, username, role },
      });

      if (error) return json({ error: error.message }, 400);

      // Vincula auth_id na tabela users
      await supabaseAdmin
        .from("users")
        .update({ auth_id: data.user.id })
        .eq("username", username.trim().toLowerCase());

      return json({ auth_id: data.user.id });
    }

    if (action === "update_password") {
      if (!auth_id || !password) return json({ error: "auth_id e password obrigatórios." }, 400);

      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, { password });
      if (error) return json({ error: error.message }, 400);

      return json({ ok: true });
    }

    if (action === "delete") {
      if (!auth_id) return json({ error: "auth_id obrigatório." }, 400);

      const { error } = await supabaseAdmin.auth.admin.deleteUser(auth_id);
      if (error) return json({ error: error.message }, 400);

      return json({ ok: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (e) {
    return json({ error: e.message ?? "Erro interno." }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
