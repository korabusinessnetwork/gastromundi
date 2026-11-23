-- Cenários de excluir_unidade_medida. Ver supabase/tests/README.md.
\set ON_ERROR_STOP 0
\pset footer off
\i supabase/migrations/20261125_excluir_unidade_medida_atomica.sql
\set VERBOSITY terse
SET ROLE authenticated;

\echo '== 1. GERENTE tenta excluir kg: 42501, e NENHUM produto perde a unidade (o defeito de antes)'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000001');
SELECT id, unidade_estoque, unidade_consumo, unidades_compra::text FROM products ORDER BY id;
SELECT abreviacao FROM unidades_medida ORDER BY 1;

\echo '== 2. caixa: também 42501, nada muda'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"caixa","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000001');

\echo '== 3. admin exclui kg: some de estoque, consumo e compra da Farinha; o produto do OUTRO estabelecimento fica igual'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"admin","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000001');
RESET ROLE;
SELECT id, unidade_estoque, unidade_consumo, unidades_compra::text FROM products ORDER BY id;
SELECT abreviacao, tenant_id = '22222222-2222-2222-2222-222222222222' AS do_outro FROM unidades_medida ORDER BY 1, 2;
SET ROLE authenticated;

\echo '== 4. admin exclui cx: sai da lista de compra dos dois produtos, o resto da lista fica'
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000002');
SELECT id, unidades_compra::text FROM products WHERE id IN (1, 2) ORDER BY id;

\echo '== 5. unidade que não existe mais: P0002'
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000001');
\echo '== 6. unidade de OUTRO estabelecimento: invisível, P0002, nada muda'
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000009');
RESET ROLE;
SELECT count(*) AS unidade_do_outro_continua FROM unidades_medida WHERE id = 'aaaaaaaa-0000-0000-0000-000000000009';
\echo '== 7. anônimo não executa'
SET ROLE anon;
SELECT public.excluir_unidade_medida('aaaaaaaa-0000-0000-0000-000000000009');
