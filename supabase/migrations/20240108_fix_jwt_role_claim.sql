-- ══════════════════════════════════════════════════════════════════
-- FIX: JWT role claim + RLS policies
--
-- Problema: o hook injetava 'role' no nível raiz do JWT, mas
-- PostgREST reserva esse campo para role do banco (authenticated,
-- anon, service_role). Substituir por 'admin' causava 401.
--
-- Correção:
--   1. Hook passa a gravar apenas em app_metadata.role (não na raiz)
--   2. Todas as policies trocam auth.jwt() ->> 'role'
--      por auth.jwt() -> 'app_metadata' ->> 'role'
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Atualiza o hook ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  claims    jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE auth_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  claims := event -> 'claims';

  -- Grava APENAS em app_metadata.role — nunca na raiz do JWT.
  -- A raiz é reservada pelo PostgREST para roles do banco de dados.
  claims := jsonb_set(
    claims,
    '{app_metadata, gastro_role}',
    to_jsonb(COALESCE(user_role, 'garcom'))
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;

-- ── 2. Helper: extrai o role do app do JWT ─────────────────────────
-- (auth.jwt() -> 'app_metadata' ->> 'gastro_role')

-- ── 3. Dropa policies antigas (criadas com a chave errada) ─────────
DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname NOT LIKE 'allow_all_%'  -- não toca as que ainda existam
      AND policyname NOT IN (
        'users_select_admin','users_insert_admin','users_update_admin','users_delete_admin'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Dropa também as de users para recriar
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;

-- ── 4. Recria todas as policies usando app_metadata.gastro_role ────

-- Macro interna (não existe em SQL, usamos a expressão diretamente):
-- role_app = auth.jwt() -> 'app_metadata' ->> 'gastro_role'

-- users — só admin
CREATE POLICY "users_select_admin" ON public.users FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');
CREATE POLICY "users_insert_admin" ON public.users FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');
CREATE POLICY "users_update_admin" ON public.users FOR UPDATE
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');
CREATE POLICY "users_delete_admin" ON public.users FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');

-- products — lê: qualquer autenticado; escreve: gerente+admin
CREATE POLICY "products_select_auth" ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "products_write_gerente_admin" ON public.products FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- pending — todos os logados
CREATE POLICY "pending_all_auth" ON public.pending FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- sales — caixa+
CREATE POLICY "sales_all_caixa_up" ON public.sales FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa','gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa','gerente','admin'));

-- fechamentos — caixa+
CREATE POLICY "fechamentos_all_caixa_up" ON public.fechamentos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa','gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa','gerente','admin'));

-- config — lê: qualquer; escreve: gerente+admin
CREATE POLICY "config_select_auth" ON public.config FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "config_write_gerente_admin" ON public.config FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- operator_logs — insere: qualquer; lê: gerente+admin
CREATE POLICY "oplogs_insert_auth" ON public.operator_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "oplogs_select_gerente_admin" ON public.operator_logs FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- unidades_medida — lê: qualquer; escreve: admin
CREATE POLICY "unidades_select_auth" ON public.unidades_medida FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "unidades_write_admin" ON public.unidades_medida FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');

-- notas_fiscais — gerente+admin
CREATE POLICY "nf_all_gerente_admin" ON public.notas_fiscais FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- notas_fiscais_itens — gerente+admin
CREATE POLICY "nf_itens_all_gerente_admin" ON public.notas_fiscais_itens FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- estoque_entradas — gerente+admin
CREATE POLICY "estoque_all_gerente_admin" ON public.estoque_entradas FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- locais_impressao — lê: qualquer; escreve: admin
CREATE POLICY "impressao_select_auth" ON public.locais_impressao FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "impressao_write_admin" ON public.locais_impressao FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');

-- categorias_roteamento — lê: qualquer; escreve: admin
CREATE POLICY "roteamento_select_auth" ON public.categorias_roteamento FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "roteamento_write_admin" ON public.categorias_roteamento FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');

-- subprodutos — lê: qualquer; escreve: gerente+admin
CREATE POLICY "subprodutos_select_auth" ON public.subprodutos FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "subprodutos_write_gerente_admin" ON public.subprodutos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- combos — lê: qualquer; escreve: gerente+admin
CREATE POLICY "combos_select_auth" ON public.combos FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "combos_write_gerente_admin" ON public.combos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- combo_subprodutos — lê: qualquer; escreve: gerente+admin
CREATE POLICY "combo_subs_select_auth" ON public.combo_subprodutos FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "combo_subs_write_gerente_admin" ON public.combo_subprodutos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'));

-- itens_fiscal (se existir)
DO $outer$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='itens_fiscal') THEN
    EXECUTE 'ALTER TABLE public.itens_fiscal ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      DROP POLICY IF EXISTS "itens_fiscal_all_gerente_admin" ON public.itens_fiscal;
      CREATE POLICY "itens_fiscal_all_gerente_admin" ON public.itens_fiscal FOR ALL
        USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
        WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente','admin'))
    $p$;
  END IF;
END $outer$;

-- ── 5. Atualiza verificar_senha_admin para usar nova chave ─────────
-- (a função não usa JWT, lê direto da tabela — nenhuma mudança necessária)
