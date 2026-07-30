-- ╭──────────────────────────────────────────────────────────────────────╮
-- │ 20260910 — remover_tenant_provisionado()                              │
-- │            a compensação do provisionamento volta a funcionar         │
-- ╰──────────────────────────────────────────────────────────────────────╯
--
-- O QUE ESTAVA FURADO
-- A Edge Function `provisionar-estabelecimento` promete no próprio cabeçalho
-- "Nunca deixa meio-usuário": se a criação da credencial do admin (item 5) ou
-- a inserção do perfil (item 6) falhar, ela apaga o tenant recém-criado. A
-- compensação era um DELETE cru, com o resultado descartado:
--
--     await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
--
-- Desde a 20260908 a RPC `provisionar_tenant` também semeia uma linha em
-- `public.assinaturas`, e `assinaturas.tenant_id` referencia `tenants(id)`
-- SEM ON DELETE CASCADE (20260719_assinaturas.sql:26). Esse DELETE passou a
-- falhar sempre com 23503 (foreign_key_violation) — e o erro NUNCA era lido.
-- Resultado em produção: todo provisionamento que falhasse no item 5 ou 6
-- deixava um ESTABELECIMENTO ÓRFÃO — sem nenhum usuário para entrar nele,
-- mas com assinatura, vencimento e valor, contando na "Receita mensal" do
-- Console e aparecendo no bloco de atenção.
--
-- E o caminho de falha mais provável é justamente o que o comentário do
-- próprio arquivo chama de "esperado": sem TENANT_ROOT_DOMAIN configurado o
-- e-mail do admin é `usuario@gastromundi.local`, então o 2º estabelecimento
-- provisionado com um username já em uso colide no Auth (item 5). Cada nova
-- tentativa deixava mais um órfão e queimava mais um sufixo de slug.
--
-- POR QUE UMA RPC, E NÃO ON DELETE CASCADE NEM UMA LISTA DE DELETES NA BORDA
--   - CASCADE em `assinaturas`/`assinaturas_pagamentos` seria pior: um
--     `DELETE FROM tenants` qualquer passaria a destruir SILENCIOSAMENTE o
--     histórico de pagamento de um cliente ativo. Cobrança não se apaga por
--     efeito colateral.
--   - Uma lista de deletes dentro da função de borda cresce em silêncio a
--     cada tabela nova que o provisionamento venha a semear — o mesmo tipo de
--     furo, só adiado. A inversa do provisionamento mora ao lado dele, no
--     banco.
--
-- O QUE ESTA FUNÇÃO GARANTE
--   1. Só a PLATAFORMA remove (`is_super_admin()`, 42501 para todo o resto).
--   2. RECUSA remover um estabelecimento que tenha QUALQUER usuário — isso
--      não é um provisionamento falho, é um cliente com dono.
--   3. RECUSA remover um estabelecimento com pagamento registrado.
--   4. Trava a linha do tenant (FOR UPDATE) antes de contar: um INSERT
--      concorrente em qualquer tabela filha precisa de FOR KEY SHARE na linha
--      pai e fica bloqueado, então não existe janela entre a contagem e o
--      DELETE.
--   5. Apaga o que o provisionamento semeia (a assinatura inicial) antes do
--      tenant, e se ainda sobrar vínculo devolve 23503 dizendo qual — em vez
--      de fingir sucesso.
--   6. Idempotente: tenant que já não existe devolve `false` sem erro.
--
-- NÃO é preciso mexer em RLS no painel: a função é SECURITY DEFINER com
-- `search_path` fixo, `anon` não pode executá-la e nenhuma policy muda.
-- Depois de aplicar esta migração, faça o deploy da função de borda:
--   supabase functions deploy provisionar-estabelecimento --no-verify-jwt

-- ── 1. A inversa do provisionamento ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remover_tenant_provisionado(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_existe     boolean;
  v_users      integer;
  v_pagamentos integer;
BEGIN
  -- Autorização: mesma guarda de provisionar_tenant (20260908).
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente a plataforma pode remover um estabelecimento provisionado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não informado.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) INTO v_existe;
  IF NOT v_existe THEN
    -- Nada a compensar. Chamar de novo não é erro.
    RETURN false;
  END IF;

  -- Trava a linha pai. Um INSERT em tabela filha (users, pedidos, …) precisa
  -- de FOR KEY SHARE nesta linha e conflita com FOR UPDATE — é o que fecha a
  -- janela entre as contagens abaixo e o DELETE.
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  SELECT count(*) INTO v_users
    FROM public.users
   WHERE tenant_id = p_tenant_id;

  IF v_users > 0 THEN
    RAISE EXCEPTION 'O estabelecimento % tem % usuário(s) e NÃO foi removido: isto não é um provisionamento falho.',
      p_tenant_id, v_users
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_pagamentos
    FROM public.assinaturas_pagamentos
   WHERE tenant_id = p_tenant_id;

  IF v_pagamentos > 0 THEN
    RAISE EXCEPTION 'O estabelecimento % tem % pagamento(s) registrado(s) e NÃO foi removido: histórico financeiro não se apaga.',
      p_tenant_id, v_pagamentos
      USING ERRCODE = 'check_violation';
  END IF;

  -- Linha que o provisionamento semeia (20260908_provisionar_cria_assinatura).
  DELETE FROM public.assinaturas WHERE tenant_id = p_tenant_id;

  BEGIN
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Sobrou vínculo que esta função não conhece. Falha ALTO, nomeando o
    -- vínculo — nunca devolve sucesso deixando órfão para trás.
    RAISE EXCEPTION 'O estabelecimento % tem dados vinculados e NÃO foi removido (%).',
      p_tenant_id, SQLERRM
      USING ERRCODE = 'foreign_key_violation';
  END;

  RETURN true;
END;
$$;

-- Ordem importa: REVOKE primeiro (função nova nasce executável por PUBLIC),
-- GRANT depois — invertido, o REVOKE tiraria o `authenticated` também.
REVOKE ALL ON FUNCTION public.remover_tenant_provisionado(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.remover_tenant_provisionado(uuid) TO authenticated;

COMMENT ON FUNCTION public.remover_tenant_provisionado(uuid) IS
  'Inversa de provisionar_tenant: remove um estabelecimento cujo provisionamento falhou (zero usuários, zero pagamentos). Só a plataforma.';

-- ── 2. Autoteste (não escreve nada) ─────────────────────────────────────

DO $conf$
DECLARE
  v_oid  oid;
  v_def  text;
  v_cfg  text[];
  v_orfaos integer;
  v_hist   integer;
BEGIN
  v_oid := to_regprocedure('public.remover_tenant_provisionado(uuid)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado(uuid) não existe.';
  END IF;

  IF to_regprocedure('public.is_super_admin()') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: is_super_admin() não existe — a guarda de autorização não teria efeito.';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado não é SECURITY DEFINER.';
  END IF;

  v_cfg := NULL;   -- SELECT INTO sem linha NÃO limpa a variável
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado sem search_path fixo.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado sem guarda de plataforma.';
  END IF;
  IF v_def NOT LIKE '%assinaturas_pagamentos%' THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado não protege o histórico de pagamentos.';
  END IF;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'FALHOU: remover_tenant_provisionado não trava a linha do tenant.';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: anon pode executar remover_tenant_provisionado.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHOU: authenticated não pode executar remover_tenant_provisionado.';
  END IF;

  -- Diagnóstico: estabelecimentos sem nenhum usuário são exatamente os
  -- órfãos que o DELETE quebrado deixou para trás.
  SELECT count(*) INTO v_orfaos
    FROM public.tenants t
   WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = t.id);

  IF v_orfaos > 0 THEN
    SELECT count(*) INTO v_hist
      FROM public.tenants t
     WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = t.id)
       AND EXISTS (SELECT 1 FROM public.assinaturas_pagamentos ap WHERE ap.tenant_id = t.id);
    RAISE NOTICE 'ATENÇÃO: % estabelecimento(s) sem nenhum usuário (órfãos de provisionamento falho). Destes, % têm pagamento registrado e a função se RECUSA a remover.', v_orfaos, v_hist;
    RAISE NOTICE 'Para remover um órfão: SELECT public.remover_tenant_provisionado(''<uuid>''); (logado no Console como plataforma).';
  END IF;

  RAISE NOTICE 'OK: remover_tenant_provisionado(uuid) instalada — só plataforma, recusa tenant com usuário ou pagamento, e falha alto em vez de deixar órfão.';
END
$conf$;
