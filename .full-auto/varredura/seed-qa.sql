-- Seed determinístico de QA. Dois tenants, para provar isolamento.
-- Roda como postgres (dono das tabelas, portanto acima da RLS).
-- Todo registro criado aqui leva prefixo "qa-" no que for texto livre.

BEGIN;

-- Tenants
INSERT INTO public.tenants (id, nome, tema, plano_codigo, slug) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'QA Tenant A', '{}'::jsonb, 'alto',  'qa-a'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'QA Tenant B', '{}'::jsonb, 'basico','qa-b')
ON CONFLICT (id) DO NOTHING;

-- Usuários de auth, um por papel, nos dois tenants
INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES
  ('11111111-0000-4000-8000-000000000001','qa-admin-a@teste.local',   '{"gastro_role":"admin","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}'),
  ('11111111-0000-4000-8000-000000000002','qa-gerente-a@teste.local', '{"gastro_role":"gerente","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}'),
  ('11111111-0000-4000-8000-000000000003','qa-caixa-a@teste.local',   '{"gastro_role":"caixa","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}'),
  ('11111111-0000-4000-8000-000000000004','qa-garcom-a@teste.local',  '{"gastro_role":"garcom","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}'),
  ('22222222-0000-4000-8000-000000000001','qa-admin-b@teste.local',   '{"gastro_role":"admin","tenant_id":"bbbbbbbb-0000-4000-8000-000000000002"}'),
  ('33333333-0000-4000-8000-000000000001','qa-plataforma@teste.local','{"gastro_role":"plataforma"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (name, username, role, active, auth_id, tenant_id) VALUES
  ('QA Admin A','qa-admin-a','admin',true,'11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001'),
  ('QA Gerente A','qa-gerente-a','gerente',true,'11111111-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001'),
  ('QA Caixa A','qa-caixa-a','caixa',true,'11111111-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001'),
  ('QA Garcom A','qa-garcom-a','garcom',true,'11111111-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000001'),
  ('QA Admin B','qa-admin-b','admin',true,'22222222-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002'),
  ('QA Inativo A','qa-inativo-a','caixa',false,NULL,'aaaaaaaa-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

-- Produtos: um item, muitos itens, texto longo, acento e emoji, inativo
INSERT INTO public.products (name, price, category, emoji, active, unidades_compra, unidade_estoque, produzivel, tenant_id)
VALUES ('qa-Pão de queijo com açúcar 🧀', 7.50, 'qa-Salgados', '🧀', true, '[]'::jsonb, 'un', false, 'aaaaaaaa-0000-4000-8000-000000000001'),
       ('qa-' || repeat('nome muito longo ', 20), 1.00, 'qa-Extremos', NULL, true, '[]'::jsonb, 'un', false, 'aaaaaaaa-0000-4000-8000-000000000001'),
       ('qa-Produto inativo', 3.00, 'qa-Salgados', NULL, false, '[]'::jsonb, 'un', false, 'aaaaaaaa-0000-4000-8000-000000000001'),
       ('qa-Produto do tenant B', 9.90, 'qa-B', NULL, true, '[]'::jsonb, 'un', false, 'bbbbbbbb-0000-4000-8000-000000000002');

-- volume: 500 produtos no tenant A
INSERT INTO public.products (name, price, category, active, unidades_compra, unidade_estoque, produzivel, tenant_id)
SELECT 'qa-volume-' || lpad(i::text, 3, '0'), (i % 97) + 0.99, 'qa-Volume', true, '[]'::jsonb, 'un', false, 'aaaaaaaa-0000-4000-8000-000000000001'
FROM generate_series(1, 500) i;

-- Mesas
INSERT INTO public.mesas (numero, capacidade, tenant_id) VALUES
  ('1', 4, 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('2', 2, 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('99', 4, 'bbbbbbbb-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

-- Uma venda fechada no tenant A e uma no B
INSERT INTO public.vendas (id, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste, total, cashier, at, tenant_id)
VALUES ('qa-venda-a-01','1', 15.00, false, 0, 0, 15.00, 'qa-caixa-a', now(), 'aaaaaaaa-0000-4000-8000-000000000001'),
       ('qa-venda-b-01','99', 9.90, false, 0, 0, 9.90, 'qa-admin-b', now(), 'bbbbbbbb-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.venda_pagamentos (venda_id, metodo, valor, tenant_id) VALUES
  ('qa-venda-a-01','dinheiro', 15.00, 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('qa-venda-b-01','pix', 9.90, 'bbbbbbbb-0000-4000-8000-000000000002');

-- Assinatura do tenant A, para os testes de renovação e estorno
INSERT INTO public.assinaturas (tenant_id, valor_mensal, ciclo_dias, data_inicio, data_vencimento, status, carencia_dias)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 200.00, 30, current_date - 10, current_date + 20, 'ativo', 5)
ON CONFLICT (tenant_id) DO UPDATE SET valor_mensal = 200.00, data_vencimento = current_date + 20, status = 'ativo';

-- Delivery do tenant A aberto, com uma faixa de taxa por bairro e um item publicado
INSERT INTO public.config_delivery (tenant_id, aberto, pedido_minimo, tempo_preparo_min, horario, faixas_taxa, fuso)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', true, 0, 30,
  '{"dom":[["00:00","23:59"]],"seg":[["00:00","23:59"]],"ter":[["00:00","23:59"]],"qua":[["00:00","23:59"]],"qui":[["00:00","23:59"]],"sex":[["00:00","23:59"]],"sab":[["00:00","23:59"]]}'::jsonb,
  '[{"tipo":"bairro","bairro":"qa-Centro","taxa":5.00}]'::jsonb, 'America/Sao_Paulo')
ON CONFLICT (tenant_id) DO UPDATE SET aberto = true, horario = EXCLUDED.horario, faixas_taxa = EXCLUDED.faixas_taxa, fuso = EXCLUDED.fuso;

INSERT INTO public.produto_delivery (tenant_id, produto_id, disponivel, ordem)
SELECT 'aaaaaaaa-0000-4000-8000-000000000001', id, true, 1
FROM public.products WHERE name = 'qa-Pão de queijo com açúcar 🧀'
ON CONFLICT DO NOTHING;

COMMIT;
