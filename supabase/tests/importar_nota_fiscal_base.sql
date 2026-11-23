-- Banco local para testar importar_nota_fiscal. Ver supabase/tests/README.md.
DROP DATABASE IF EXISTS teste_nf;
CREATE DATABASE teste_nf;
\c teste_nf
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE FUNCTION public.tenant_atual_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.products (id bigint PRIMARY KEY, name text NOT NULL, tenant_id uuid NOT NULL REFERENCES public.tenants(id));
CREATE TABLE public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chave_acesso text UNIQUE, numero text, serie text, data_emissao date,
  fornecedor_nome text, fornecedor_cnpj text, valor_total numeric, origem text DEFAULT 'xml', status text DEFAULT 'importada',
  xml_raw text, created_at timestamptz DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.notas_fiscais_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nota_fiscal_id uuid REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  product_id bigint REFERENCES public.products(id) ON DELETE SET NULL, descricao_xml text, codigo_xml text, unidade_xml text,
  quantidade numeric, preco_unitario numeric, preco_total numeric, fator_conversao numeric DEFAULT 1, quantidade_estoque numeric,
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.estoque_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id bigint REFERENCES public.products(id) ON DELETE CASCADE,
  nota_fiscal_id uuid REFERENCES public.notas_fiscais(id) ON DELETE SET NULL, quantidade numeric, preco_unitario numeric,
  data_entrada date DEFAULT CURRENT_DATE, observacao text, created_at timestamptz DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.estoque (
  produto_id bigint PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0 CHECK (quantidade >= 0), minimo numeric NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id));
CREATE TABLE public.estoque_baixas_aplicadas (
  op_id uuid PRIMARY KEY, tenant_id uuid, produto_id bigint, subproduto_id uuid, qtd numeric NOT NULL,
  aplicada_em timestamptz NOT NULL DEFAULT now(), tipo text NOT NULL DEFAULT 'baixa');
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
-- Policies como em produção (2026-11-23).
CREATE POLICY nf_all_gerente_admin ON public.notas_fiscais FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY notas_fiscais_tenant_isolation ON public.notas_fiscais AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY nf_itens_all_gerente_admin ON public.notas_fiscais_itens FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY notas_fiscais_itens_tenant_isolation ON public.notas_fiscais_itens AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY estoque_all_gerente_admin ON public.estoque_entradas FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = ANY (ARRAY['gerente','admin']));
CREATE POLICY estoque_entradas_tenant_isolation ON public.estoque_entradas AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
CREATE POLICY estoque_select_auth ON public.estoque FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY estoque_tenant_isolation ON public.estoque AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id());
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO public.tenants VALUES ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
INSERT INTO public.products VALUES
  (1, 'Farinha', '11111111-1111-1111-1111-111111111111'),
  (2, 'Açúcar',  '11111111-1111-1111-1111-111111111111'),
  (3, 'Do outro', '22222222-2222-2222-2222-222222222222');
INSERT INTO public.estoque (produto_id, quantidade, minimo, tenant_id) VALUES (1, 10, 5, '11111111-1111-1111-1111-111111111111');
