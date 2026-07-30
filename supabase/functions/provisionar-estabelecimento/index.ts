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
 * Convenção de username (login ciente de tenant via subdomínio — 20260740):
 * o login monta o e-mail como `${username}@${slug}.local`, onde `slug` é o
 * do tenant (rótulo do subdomínio). Assim o MESMO username coexiste em
 * tenants diferentes; a unicidade é por tenant (UNIQUE (tenant_id,username))
 * e o e-mail do Auth fica único pelo slug. O slug nasce na RPC
 * provisionar_tenant (deriva do nome ou usa o `slug` opcional do corpo).
 *
 * Atomicidade: se a criação do admin falhar depois do tenant criado, o
 * tenant é removido (compensação) para não deixar estabelecimento órfão
 * sem dono. Se a inserção do perfil falhar depois do auth criado, o auth
 * e o tenant são removidos. Nunca deixa meio-usuário (o bug que a tela
 * "Criar Usuário" do app produzia).
 *
 * A compensação é a RPC `remover_tenant_provisionado` (20260910), NÃO um
 * `from("tenants").delete()`: o tenant nasce com linha em
 * `public.assinaturas` (20260908) e essa FK não tem ON DELETE CASCADE, então
 * o delete cru falhava com 23503 — e o erro era descartado, deixando órfão
 * exatamente no caminho que esta função promete cobrir. A RPC apaga o que o
 * provisionamento semeia, se recusa a apagar estabelecimento que já tenha
 * usuário ou pagamento, e devolve erro. Se ela falhar, o erro devolvido ao
 * Console diz que o estabelecimento ficou criado e precisa ser removido à
 * mão — silêncio nunca.
 *
 * Deploy:
 *   supabase functions deploy provisionar-estabelecimento --no-verify-jwt
 *   (o JWT é verificado manualmente abaixo para checar o papel plataforma)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { compensarProvisionamento, removerCredencialOrfa } from "../_shared/provisionamento.ts";
import { coordenada, validarEntradaProvisionamento } from "../_shared/validacaoProvisionamento.ts";

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

    // A validação mora em `_shared/validacaoProvisionamento.ts` para poder ser
    // testada de verdade (aqui não dá: este arquivo chama Deno.serve ao ser
    // importado). Ela é a fronteira real — o cliente que chama esta função é
    // só um dos possíveis. Em especial, normaliza o username com a MESMA regra
    // que a tela de login consegue reproduzir: gravar um username com
    // `< > " ' \`` (que o `sanitizeInput` do login remove) ou com mais de 60
    // caracteres (que ele corta) criava um estabelecimento cujo admin NUNCA
    // consegue entrar, e esta função respondia sucesso.
    const validacao = validarEntradaProvisionamento(body);
    if (validacao.erro || !validacao.dados) {
      return json({ error: validacao.erro ?? "Corpo inválido." }, 400);
    }
    const { nome, slug, planoCodigo, tema, username, password, adminName } = validacao.dados;

    // ── 3. Cria o tenant via RPC (reconfirma super-admin pelo JWT) ────
    // provisionar_tenant retorna RETURNS public.tenants (uma linha
    // composta, não SETOF) → o supabase-js devolve como objeto direto,
    // sem .single().
    const { data: tenant, error: eTenant } = await supabaseCaller
      .rpc("provisionar_tenant", {
        p_nome: nome,
        p_slug: slug,
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

    // E-mail com namespace do tenant (slug) — permite o mesmo username em
    // tenants diferentes. Como o slug é único e o tenant nasce vazio, não
    // há colisão de username DENTRO dele; a unicidade é garantida pelo
    // UNIQUE (tenant_id, username) no banco e pela unicidade do e-mail no
    // Auth. Se o e-mail já existir (reprovisionamento), createUser abaixo
    // falha e a compensação (item que apaga o tenant) trata.
    //
    // Gate de inércia: sem TENANT_ROOT_DOMAIN (login por subdomínio ainda
    // desligado), usa 'gastromundi' — o mesmo namespace do front no
    // fallback. Provisionar um 2º tenant nesse estado colidiria no e-mail
    // (esperado): o subdomínio precisa estar ativo. Ao ligar o domínio,
    // passa a usar o slug do tenant.
    const slugNs = Deno.env.get("TENANT_ROOT_DOMAIN") ? tenant.slug : "gastromundi";
    const email = `${username}@${slugNs}.local`;

    // ── 5. Cria a credencial de auth do 1º admin ─────────────────────
    const { data: authCreated, error: eAuth } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: adminName, username, role: "admin" },
    });

    if (eAuth || !authCreated?.user) {
      // Compensação com o JWT do CHAMADOR (já confirmado `plataforma` no item
      // 1) — a mesma via da criação, então a guarda `is_super_admin()` da RPC
      // passa. Com o service_role ela reprovaria.
      const aviso = await compensarProvisionamento(supabaseCaller, tenant);
      const motivo = eAuth?.message ?? "Falha ao criar a credencial do admin.";
      return json({ error: `${motivo}${aviso}` }, 400);
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
      // Compensação total: sem perfil, o auth e o tenant não servem. A
      // credencial sai PRIMEIRO — enquanto ela existir o e-mail segue ocupado
      // e uma nova tentativa com o mesmo username colidiria de novo.
      const avisoAuth = await removerCredencialOrfa(supabaseAdmin, authCreated.user.id, email);
      const aviso = await compensarProvisionamento(supabaseCaller, tenant);
      const motivo = ePerfil.message ?? "Falha ao criar o perfil do admin.";
      return json({ error: `${motivo}${avisoAuth}${aviso}` }, 400);
    }

    // ── 7. (Opcional) Semeia a origem do delivery ────────────────────
    // Só quando o Console mandou um endereço (cliente que quer delivery
    // integrado). Best-effort: se falhar, NÃO derruba o provisionamento —
    // o admin ajusta depois na tela "Entrega e taxas". Escreve via
    // service_role porque o admin recém-criado ainda não tem sessão.
    const delivery = body.delivery ?? null;
    const enderecoOrigem = (delivery?.endereco_origem ?? "").trim();
    if (enderecoOrigem) {
      // `Number(null)` e `Number("")` valem 0, e 0 passa em qualquer teste de
      // faixa — a origem do delivery era semeada em (0, 0) e toda taxa por
      // quilômetro daquele estabelecimento saía errada. `coordenada` só aceita
      // número ou texto numérico não vazio.
      const lat = coordenada(delivery?.origem_lat, 90);
      const lng = coordenada(delivery?.origem_lng, 180);
      const temCoord = lat !== null && lng !== null;
      const { error: eDelivery } = await supabaseAdmin.from("config_delivery").upsert({
        tenant_id: tenant.id,
        endereco_origem: enderecoOrigem,
        ...(temCoord ? { origem_lat: lat, origem_lng: lng } : {}),
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });
      if (eDelivery) {
        console.error("Falha ao semear config_delivery (ignorado):", eDelivery.message);
      }
    }

    return json({
      tenant_id: tenant.id,
      nome: tenant.nome,
      slug: tenant.slug,
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
