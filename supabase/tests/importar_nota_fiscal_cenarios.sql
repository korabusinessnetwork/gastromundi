-- Cenários de importar_nota_fiscal. Ver supabase/tests/README.md.
\set ON_ERROR_STOP 0
\pset footer off
-- Aplicar duas vezes: a migration é idempotente.
\i supabase/migrations/20261124_importar_nota_fiscal_atomica.sql

\echo '== 1. gerente importa nota com 2 itens vinculados e 1 sem vínculo: Farinha 10+2=12, Açúcar nasce com 3'
SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT produto_id, quantidade FROM public.importar_nota_fiscal(
  '{"chave_acesso":"CHAVE-1","numero":"10","serie":"1","data_emissao":"2026-11-20","fornecedor_nome":"Distribuidora","valor_total":"50","data_entrada":"2026-11-23"}',
  '[{"product_id":1,"descricao_xml":"FARINHA","quantidade":1,"preco_unitario":20,"preco_total":20,"fator_conversao":2,"quantidade_estoque":2},
    {"product_id":2,"descricao_xml":"ACUCAR","quantidade":3,"preco_unitario":5,"preco_total":15,"fator_conversao":1,"quantidade_estoque":3},
    {"product_id":null,"descricao_xml":"SACOLA","quantidade":1,"preco_unitario":15,"preco_total":15}]') ORDER BY 1;
SELECT n.numero, (SELECT count(*) FROM notas_fiscais_itens i WHERE i.nota_fiscal_id = n.id) AS itens,
       (SELECT string_agg(e.product_id || ':' || e.preco_unitario || ':' || e.data_entrada, ' ' ORDER BY e.product_id)
          FROM estoque_entradas e WHERE e.nota_fiscal_id = n.id) AS entradas_custo_e_data
  FROM notas_fiscais n WHERE n.chave_acesso = 'CHAVE-1';

\echo '== 2. mesma chave de acesso de novo: 23505, e o saldo NÃO soma de novo (Farinha segue 12)'
\set VERBOSITY verbose
SELECT * FROM public.importar_nota_fiscal('{"chave_acesso":"CHAVE-1","numero":"10"}', '[{"product_id":1,"quantidade_estoque":2}]');
\set VERBOSITY default
SELECT produto_id, quantidade FROM estoque ORDER BY 1;

\echo '== 3. falha no meio (produto de OUTRO estabelecimento no 2º item): nada fica, nem a nota nem o 1º saldo'
SELECT * FROM public.importar_nota_fiscal('{"chave_acesso":"CHAVE-2","numero":"11"}',
  '[{"product_id":1,"quantidade_estoque":5},{"product_id":3,"quantidade_estoque":1}]');
SELECT (SELECT count(*) FROM notas_fiscais WHERE chave_acesso = 'CHAVE-2') AS nota_ficou,
       (SELECT quantidade FROM estoque WHERE produto_id = 1) AS farinha_segue_12;

\echo '== 4. e a reimportação depois da falha funciona (Farinha 12+5=17)'
SELECT produto_id, quantidade FROM public.importar_nota_fiscal('{"chave_acesso":"CHAVE-2","numero":"11"}',
  '[{"product_id":1,"quantidade_estoque":5}]');

\echo '== 5. item vinculado com quantidade 0: P0001 antes de gravar'
\set VERBOSITY verbose
SELECT * FROM public.importar_nota_fiscal('{"chave_acesso":"CHAVE-3"}', '[{"product_id":1,"quantidade_estoque":0}]');
\echo '== 6. nota sem item vinculado: grava e devolve só o id da nota'
\set VERBOSITY default
SELECT nota_id IS NOT NULL AS tem_nota, produto_id, quantidade FROM public.importar_nota_fiscal(
  '{"chave_acesso":"CHAVE-4","numero":"12"}', '[{"product_id":null,"descricao_xml":"FRETE","quantidade":1}]');

\echo '== 7. caixa (só soma saldo, não grava nota): 42501 e nada muda'
\set VERBOSITY verbose
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"caixa","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT * FROM public.importar_nota_fiscal('{"chave_acesso":"CHAVE-5"}', '[{"product_id":1,"quantidade_estoque":1}]');
\echo '== 8. formato inválido: P0001'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT * FROM public.importar_nota_fiscal('[]', '{}');
\set VERBOSITY default

\echo '== 9. estado final: Farinha 17, Açúcar 3; 3 notas (CHAVE-1, CHAVE-2, CHAVE-4)'
RESET ROLE;
SELECT produto_id, quantidade FROM estoque ORDER BY 1;
SELECT chave_acesso FROM notas_fiscais ORDER BY 1;
\echo '== 10. anônimo não executa'
SET ROLE anon;
SELECT * FROM public.importar_nota_fiscal('{}', '[]');
