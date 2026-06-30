-- ══════════════════════════════════════════════════════════════════
-- FASE 4 — RLS por role + remoção da coluna password
--
-- Pré-requisito: Fases 1-3 concluídas (auth_id populado, hook ativo)
--
-- O que faz:
--   1. Remove coluna password de public.users (senhas vivem em auth.users)
--   2. Dropa todas as policies USING(true) existentes
--   3. Cria policies granulares usando auth.jwt() ->> 'role'
--
-- Helper de role (evita repetição):
--   (auth.jwt() ->> 'role')  →  'admin' | 'gerente' | 'caixa' | 'garcom'
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Remove coluna password ──────────────────────────────────────
ALTER TABLE public.users DROP COLUMN IF EXISTS password;

-- ── 2. Dropa todas as policies permissivas antigas ─────────────────
DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'allow_all_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 3. Novas policies por tabela
-- Convenção de nomes: "<tabela>_<operacao>_<quem>"
-- ══════════════════════════════════════════════════════════════════

-- ── users ──────────────────────────────────────────────────────────
-- Somente admin vê e gerencia usuários
CREATE POLICY "users_select_admin"
  ON public.users FOR SELECT
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "users_insert_admin"
  ON public.users FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "users_update_admin"
  ON public.users FOR UPDATE
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "users_delete_admin"
  ON public.users FOR DELETE
  USING ((auth.jwt() ->> 'role') = 'admin');

-- ── products ───────────────────────────────────────────────────────
-- Qualquer logado lê; gerente e admin escrevem
CREATE POLICY "products_select_auth"
  ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "products_write_gerente_admin"
  ON public.products FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── pending ────────────────────────────────────────────────────────
-- Todos os logados (garcom, caixa, gerente, admin) acessam
CREATE POLICY "pending_all_auth"
  ON public.pending FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── sales ──────────────────────────────────────────────────────────
-- Caixa, gerente e admin leem e inserem
CREATE POLICY "sales_all_caixa_up"
  ON public.sales FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

-- ── fechamentos ────────────────────────────────────────────────────
CREATE POLICY "fechamentos_all_caixa_up"
  ON public.fechamentos FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('caixa', 'gerente', 'admin'));

-- ── config ─────────────────────────────────────────────────────────
-- Qualquer logado lê; gerente e admin escrevem
CREATE POLICY "config_select_auth"
  ON public.config FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "config_write_gerente_admin"
  ON public.config FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── operator_logs ──────────────────────────────────────────────────
-- Qualquer logado insere (fire-and-forget); gerente e admin leem
CREATE POLICY "oplogs_insert_auth"
  ON public.operator_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "oplogs_select_gerente_admin"
  ON public.operator_logs FOR SELECT
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── unidades_medida ────────────────────────────────────────────────
-- Qualquer logado lê; somente admin escreve
CREATE POLICY "unidades_select_auth"
  ON public.unidades_medida FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "unidades_write_admin"
  ON public.unidades_medida FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ── notas_fiscais ──────────────────────────────────────────────────
CREATE POLICY "nf_all_gerente_admin"
  ON public.notas_fiscais FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── notas_fiscais_itens ────────────────────────────────────────────
CREATE POLICY "nf_itens_all_gerente_admin"
  ON public.notas_fiscais_itens FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── estoque_entradas ───────────────────────────────────────────────
CREATE POLICY "estoque_all_gerente_admin"
  ON public.estoque_entradas FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── locais_impressao ───────────────────────────────────────────────
-- RLS deve já estar habilitado; somente admin configura impressoras
ALTER TABLE IF EXISTS public.locais_impressao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impressao_select_auth"
  ON public.locais_impressao FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "impressao_write_admin"
  ON public.locais_impressao FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ── categorias_roteamento ──────────────────────────────────────────
ALTER TABLE IF EXISTS public.categorias_roteamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roteamento_select_auth"
  ON public.categorias_roteamento FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "roteamento_write_admin"
  ON public.categorias_roteamento FOR ALL
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ── subprodutos ────────────────────────────────────────────────────
CREATE POLICY "subprodutos_select_auth"
  ON public.subprodutos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "subprodutos_write_gerente_admin"
  ON public.subprodutos FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── combos ─────────────────────────────────────────────────────────
CREATE POLICY "combos_select_auth"
  ON public.combos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "combos_write_gerente_admin"
  ON public.combos FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── combo_subprodutos ──────────────────────────────────────────────
CREATE POLICY "combo_subs_select_auth"
  ON public.combo_subprodutos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "combo_subs_write_gerente_admin"
  ON public.combo_subprodutos FOR ALL
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── itens_fiscal ───────────────────────────────────────────────────
-- (tabela criada fora das migrations; habilita RLS se existir)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'itens_fiscal') THEN
    EXECUTE 'ALTER TABLE public.itens_fiscal ENABLE ROW LEVEL SECURITY';
    EXECUTE $p$
      CREATE POLICY "itens_fiscal_all_gerente_admin"
        ON public.itens_fiscal FOR ALL
        USING ((auth.jwt() ->> ''role'') IN (''gerente'', ''admin''))
        WITH CHECK ((auth.jwt() ->> ''role'') IN (''gerente'', ''admin''))
    $p$;
  END IF;
END $$;
