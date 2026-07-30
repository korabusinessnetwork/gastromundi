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
import { decidirAcesso, mensagemRecusa, PAPEIS_ADMIN } from "../_shared/guardaEntrada.ts";
import { removerCredencialOrfa } from "../_shared/provisionamento.ts";
import {
  MAX_SENHA,
  MAX_USERNAME,
  MIN_SENHA,
  normalizarUsername,
} from "../_shared/validacaoProvisionamento.ts";

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

    // Verifica se o chamador é admin ATIVO pela tabela users (e de QUAL
    // tenant). `active` entra no select porque a guarda falha fechado sem ela.
    const { data: callerData } = await supabaseClient
      .from("users")
      .select("role, tenant_id, active")
      .eq("auth_id", caller.id)
      .single();

    const acesso = decidirAcesso(callerData, PAPEIS_ADMIN);
    if (!acesso.ok) {
      return json({ error: mensagemRecusa(acesso.motivo, "Acesso restrito a administradores.") }, 403);
    }

    const callerTenantId = callerData.tenant_id;

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
      if (!callerTenantId) return json({ error: "Admin sem tenant definido." }, 400);

      // O username vira e-mail (`uname@ns.local`), e a TELA DE LOGIN remonta
      // esse mesmo e-mail passando o que a pessoa digita por `sanitizeInput`
      // (src/utils/crypto.js), que remove < > " ' ` e corta em 60. Um username
      // com acento, espaço ou um daqueles cinco caracteres nascia como uma
      // conta que NUNCA podia ser redigitada no login — e a function
      // respondia sucesso. É o mesmo furo que `validacaoProvisionamento`
      // fechou no provisionamento, aqui no caminho usado todo dia. A tela já
      // restringe a [a-z0-9_] (ConfiguracoesView), então nada que funciona
      // hoje passa a ser recusado: só o corpo montado à mão é barrado.
      const uname = normalizarUsername(username);
      if (typeof username !== "string" || !uname || uname !== username.trim().toLowerCase()) {
        return json({
          error: "Usuário de acesso inválido: use apenas letras sem acento, números, ponto, hífen ou sublinhado.",
        }, 400);
      }
      if (uname.length > MAX_USERNAME) {
        return json({ error: `O usuário de acesso pode ter no máximo ${MAX_USERNAME} caracteres.` }, 400);
      }
      if (typeof password !== "string" || password.length < MIN_SENHA || password.length > MAX_SENHA) {
        return json({ error: `A senha precisa ter de ${MIN_SENHA} a ${MAX_SENHA} caracteres.` }, 400);
      }

      // E-mail com namespace do tenant do admin (slug do subdomínio), para
      // o mesmo username coexistir entre tenants. Resolve o slug do tenant.
      const { data: tenantRow } = await supabaseAdmin
        .from("tenants")
        .select("slug")
        .eq("id", callerTenantId)
        .single();

      if (!tenantRow?.slug) return json({ error: "Tenant sem slug configurado." }, 400);

      // Namespace do e-mail: enquanto o login por subdomínio não estiver
      // ativo (TENANT_ROOT_DOMAIN ausente), usa 'gastromundi' — o MESMO
      // que o front monta no fallback. Isso mantém front e function
      // consistentes no período inerte. Ao ativar o domínio (setar
      // TENANT_ROOT_DOMAIN aqui e VITE_ROOT_DOMAIN no front), passa a usar
      // o slug do tenant. Ver 20260740.
      const slugNs = Deno.env.get("TENANT_ROOT_DOMAIN") ? tenantRow.slug : "gastromundi";
      const email = `${uname}@${slugNs}.local`;

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, username, role },
      });

      if (error) return json({ error: error.message }, 400);

      // Vincula auth_id na tabela users — ESCOPADO ao tenant do chamador.
      // Sem o filtro de tenant, com username por-tenant o service_role
      // (ignora RLS) casaria a linha homônima de OUTRO tenant.
      //
      // O resultado era descartado. A tela grava a linha em `users` ANTES de
      // chamar aqui (ConfiguracoesView), então "nenhuma linha casou" é erro de
      // verdade — e o estrago era mudo: a credencial ficava viva sem perfil
      // nenhum apontando para ela, ocupando o e-mail `uname@ns.local` para
      // sempre. A tentativa seguinte com o MESMO usuário colidia no Auth e o
      // admin não tinha como entender o porquê. Mesma compensação do
      // provisionamento: desfaz a credencial e conta o que houve.
      const { data: vinculadas, error: eVinculo } = await supabaseAdmin
        .from("users")
        .update({ auth_id: data.user.id })
        .eq("username", uname)
        .eq("tenant_id", callerTenantId)
        .select("id");

      if (eVinculo || !vinculadas?.length) {
        const aviso = await removerCredencialOrfa(supabaseAdmin, data.user.id, email);
        console.error("Vínculo de auth_id falhou:", uname, eVinculo?.message ?? "nenhuma linha casou");
        return json({
          error: `A conta de acesso foi criada, mas não achamos o funcionário "${uname}" neste estabelecimento para vinculá-la. Salve o cadastro do funcionário e tente definir a senha de novo.${aviso}`,
        }, 409);
      }

      return json({ auth_id: data.user.id });
    }

    // Valida que o auth_id alvo pertence ao MESMO tenant do admin
    // chamador. Sem isso, um admin de um estabelecimento resetava a
    // senha / apagava a conta de usuários de OUTRO tenant (ou do
    // super-admin da plataforma, cuja linha tem tenant_id NULL e
    // portanto nunca casa) — IDOR, já que o service_role ignora RLS.
    const alvoDoMesmoTenant = async (targetAuthId: string) => {
      const { data: alvo } = await supabaseAdmin
        .from("users")
        .select("tenant_id")
        .eq("auth_id", targetAuthId)
        .maybeSingle();
      return !!alvo && !!callerTenantId && alvo.tenant_id === callerTenantId;
    };

    if (action === "update_password") {
      if (!auth_id || !password) return json({ error: "auth_id e password obrigatórios." }, 400);
      if (!(await alvoDoMesmoTenant(auth_id))) {
        return json({ error: "Usuário não encontrado neste estabelecimento." }, 404);
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, { password });
      if (error) return json({ error: error.message }, 400);

      return json({ ok: true });
    }

    if (action === "delete") {
      if (!auth_id) return json({ error: "auth_id obrigatório." }, 400);
      if (!(await alvoDoMesmoTenant(auth_id))) {
        return json({ error: "Usuário não encontrado neste estabelecimento." }, 404);
      }

      const { error } = await supabaseAdmin.auth.admin.deleteUser(auth_id);
      if (error) return json({ error: error.message }, 400);

      return json({ ok: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (e) {
    // A mensagem crua ia para o navegador. Um erro do supabase-js ou do
    // Postgres carrega nome de tabela, coluna e constraint — desenho interno
    // do banco entregue a quem chamou. Fica no log da função e o cliente
    // recebe uma frase fechada, como nas outras funções.
    console.error("manage-user error:", e);
    return json({ error: "Erro interno ao gerenciar o usuário." }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
