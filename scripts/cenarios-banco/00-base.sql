-- Base dos cenários de banco: ajudas e dados de dois estabelecimentos.
-- Roda como superusuário (o dono do banco descartável). Cada cenário depois
-- troca para o papel `authenticated` com o JWT de quem está agindo, como o
-- PostgREST faz numa chamada de verdade, e a RLS vale como em produção.

CREATE SCHEMA IF NOT EXISTS teste;
GRANT USAGE ON SCHEMA teste TO anon, authenticated;

-- JWT de quem age: papel do app (gastro_role) e estabelecimento (tenant_id).
CREATE OR REPLACE FUNCTION teste.como(p_papel text, p_tenant uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid(), 'role', 'authenticated',
    'app_metadata', json_build_object('gastro_role', p_papel, 'tenant_id', p_tenant)
  )::text, true);
$$;

-- Afirmação: reprova o cenário com a descrição; passa avisando.
CREATE OR REPLACE FUNCTION teste.conferir(p_ok boolean, p_descricao text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_descricao; END IF;
  RAISE NOTICE 'ok: %', p_descricao;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA teste TO anon, authenticated;

-- Dois estabelecimentos, A e B, com um produto e um subproduto cada.
INSERT INTO public.tenants (id, nome, slug, plano_codigo) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Loja A', 'loja-a', 'avancado'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Loja B', 'loja-b', 'avancado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, name, price, category, tenant_id) VALUES
  (101, 'Hambúrguer A', 30, 'Lanches', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (102, 'Refrigerante A', 8, 'Bebidas', 'aaaaaaaa-0000-0000-0000-000000000001'),
  (201, 'Hambúrguer B', 30, 'Lanches', 'bbbbbbbb-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.subprodutos (id, nome, tenant_id) VALUES
  ('5a000000-0000-0000-0000-000000000001', 'Batata A', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('5b000000-0000-0000-0000-000000000002', 'Batata B', 'bbbbbbbb-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
