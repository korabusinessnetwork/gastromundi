-- Banco local para testar excluir_unidade_medida. Ver supabase/tests/README.md.
DROP DATABASE IF EXISTS teste_unidade;
CREATE DATABASE teste_unidade;
\c teste_unidade
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION public.tenant_atual_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.products (
  id bigint PRIMARY KEY, name text NOT NULL, unidades_compra jsonb NOT NULL DEFAULT '[]',
  unidade_estoque text NOT NULL DEFAULT 'un', unidade_consumo text,
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.unidades_medida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, abreviacao text NOT NULL, tipo text NOT NULL,
  ordem integer DEFAULT 0, created_at timestamptz DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;
-- Policies como em produção (2026-11-23), sem as de assinatura, que não mudam o caso.
CREATE POLICY products_select_auth ON public.products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY products_write_gerente_admin ON public.products FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY products_tenant_isolation ON public.products AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY unidades_select_auth ON public.unidades_medida FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY unidades_write_admin ON public.unidades_medida FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin');
CREATE POLICY unidades_medida_tenant_isolation ON public.unidades_medida AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO public.tenants VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.unidades_medida (id, nome, abreviacao, tipo, tenant_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Quilograma', 'kg', 'estoque', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Caixa', 'cx', 'compra', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'Quilo do outro', 'kg', 'estoque', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.products (id, name, unidade_estoque, unidade_consumo, unidades_compra, tenant_id) VALUES
  (1, 'Farinha', 'kg', 'kg', '[{"unidade":"cx","fator":10},{"unidade":"kg","fator":1}]', '11111111-1111-1111-1111-111111111111'),
  (2, 'Ovo', 'un', NULL, '[{"unidade":"cx","fator":30}]', '11111111-1111-1111-1111-111111111111'),
  (9, 'Farinha do outro', 'kg', 'kg', '[{"unidade":"kg","fator":1}]', '22222222-2222-2222-2222-222222222222');
