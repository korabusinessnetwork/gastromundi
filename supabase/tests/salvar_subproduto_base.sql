-- Banco local para testar salvar_subproduto. Ver supabase/tests/README.md.
DROP DATABASE IF EXISTS teste_subproduto;
CREATE DATABASE teste_subproduto;
\c teste_subproduto
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION public.tenant_atual_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.subprodutos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, categoria text, preco numeric NOT NULL DEFAULT 0,
  unidade_medida text, controla_estoque boolean NOT NULL DEFAULT false, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.estoque_subprodutos (
  subproduto_id uuid PRIMARY KEY REFERENCES public.subprodutos(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0 CHECK (quantidade >= 0), minimo numeric NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.subprodutos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_subprodutos ENABLE ROW LEVEL SECURITY;
-- Policies como em produção (2026-11-23).
CREATE POLICY subprodutos_select_auth ON public.subprodutos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY subprodutos_write_gerente_admin ON public.subprodutos FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY subprodutos_tenant_isolation ON public.subprodutos AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY estoque_subprodutos_select_auth ON public.estoque_subprodutos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY estoque_subprodutos_insert_caixa_gerencia ON public.estoque_subprodutos FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['caixa','gerente','admin']));
CREATE POLICY estoque_subprodutos_update_caixa_gerencia ON public.estoque_subprodutos FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['caixa','gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['caixa','gerente','admin']));
CREATE POLICY estoque_subprodutos_tenant_isolation ON public.estoque_subprodutos AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO public.tenants VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.subprodutos (id, nome, preco, tenant_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000009', 'Do outro', 1, '22222222-2222-2222-2222-222222222222');
