DROP DATABASE IF EXISTS teste_combo;
CREATE DATABASE teste_combo;
\c teste_combo
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION public.tenant_atual_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.products (id bigint PRIMARY KEY, name text NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.subprodutos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL,
  item_principal_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  modo text NOT NULL DEFAULT 'combo', preco_total numeric, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.combo_subprodutos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  subproduto_id uuid NOT NULL REFERENCES public.subprodutos(id), quantidade integer NOT NULL DEFAULT 1,
  preco_customizado numeric, created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.combo_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), combo_id uuid NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  produto_id bigint NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_customizado numeric(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), UNIQUE (combo_id, produto_id));
ALTER TABLE public.combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_subprodutos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_produtos ENABLE ROW LEVEL SECURITY;
-- Policies como em produção, com a 20260923 aplicada em combo_produtos.
CREATE POLICY combos_select_auth ON public.combos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY combos_write_gerente_admin ON public.combos FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY combos_tenant_isolation ON public.combos AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY combo_subs_select_auth ON public.combo_subprodutos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY combo_subs_write_gerente_admin ON public.combo_subprodutos FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY combo_subprodutos_tenant_isolation ON public.combo_subprodutos AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY combo_produtos_select_auth ON public.combo_produtos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY combo_produtos_write_gerente_admin ON public.combo_produtos FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY combo_produtos_tenant_isolation ON public.combo_produtos AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Dados: dois estabelecimentos.
INSERT INTO public.tenants VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.products VALUES (7, 'X-Burguer', '11111111-1111-1111-1111-111111111111'), (9, 'Refri', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.subprodutos VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Batata', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.combos (id, nome, item_principal_id, tenant_id) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Combo do outro', 7, '22222222-2222-2222-2222-222222222222');
