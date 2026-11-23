\set ON_ERROR_STOP 0
\pset footer off
-- Aplicar duas vezes: a migration é idempotente.
\i supabase/migrations/20261123_salvar_combo_atomico.sql

\echo '== 1. gerente cria combo com 1 subproduto e 1 produto'
SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.salvar_combo(NULL, ' Combo Família ', 7, 'combo', 30,
  '[{"subproduto_id":"aaaaaaaa-0000-0000-0000-000000000001","quantidade":2,"preco_customizado":null}]',
  '[{"produto_id":9,"quantidade":1,"preco_customizado":5.5}]') AS novo \gset
SELECT nome, preco_total, (SELECT count(*) FROM combo_subprodutos WHERE combo_id = :'novo') AS subs,
       (SELECT count(*) FROM combo_produtos WHERE combo_id = :'novo') AS prods
  FROM combos WHERE id = :'novo';

\echo '== 2. edição troca a composição inteira'
SELECT public.salvar_combo(:'novo', 'Combo Família G', 7, 'combo', 40, '[]', '[{"produto_id":9,"quantidade":3,"preco_customizado":null}]');
SELECT nome, preco_total, (SELECT count(*) FROM combo_subprodutos WHERE combo_id = :'novo') AS subs,
       (SELECT quantidade FROM combo_produtos WHERE combo_id = :'novo') AS qtd_refri
  FROM combos WHERE id = :'novo';

\echo '== 3. falha no meio (subproduto inexistente) desfaz TUDO, inclusive os deletes'
SELECT public.salvar_combo(:'novo', 'NOME QUE NAO PODE FICAR', 7, 'combo', 99,
  '[{"subproduto_id":"aaaaaaaa-0000-0000-0000-00000000dead","quantidade":1}]', '[]');
SELECT nome, preco_total, (SELECT count(*) FROM combo_produtos WHERE combo_id = :'novo') AS prods_continuam
  FROM combos WHERE id = :'novo';

\echo '== 4. combo sem item é recusado (P0001)'
\set VERBOSITY verbose
SELECT public.salvar_combo(NULL, 'Vazio', 7, 'combo', 0, '[]', '[]');
\echo '== 5. quantidade zero é recusada (P0001)'
SELECT public.salvar_combo(NULL, 'Zero', 7, 'combo', 0, '[]', '[{"produto_id":9,"quantidade":0}]');
\echo '== 6. combo de OUTRO estabelecimento: invisível, vira P0002, nada muda'
SELECT public.salvar_combo('cccccccc-0000-0000-0000-000000000001', 'Invasão', 7, 'combo', 1, '[]', '[{"produto_id":9,"quantidade":1}]');

\echo '== 7. garçom tentando editar: P0002 (a RLS esconde a linha do UPDATE)'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"garcom","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.salvar_combo(:'novo', 'Garçom mexeu', 7, 'combo', 1, '[]', '[{"produto_id":9,"quantidade":1}]');
\echo '== 8. garçom tentando criar: 42501 da RLS'
SELECT public.salvar_combo(NULL, 'Garçom criou', 7, 'combo', 1, '[]', '[{"produto_id":9,"quantidade":1}]');
\set VERBOSITY default

\echo '== 9. estado final, visto como superusuário'
RESET ROLE;
SELECT c.nome, c.preco_total, c.tenant_id = '11111111-1111-1111-1111-111111111111' AS tenant_certo,
       (SELECT count(*) FROM combo_produtos p WHERE p.combo_id = c.id) AS prods,
       (SELECT count(*) FROM combo_subprodutos s WHERE s.combo_id = c.id) AS subs
  FROM combos c ORDER BY c.nome;
\echo '== 10. anônimo não executa'
SET ROLE anon;
SELECT public.salvar_combo(NULL, 'Anon', 7, 'combo', 1, '[]', '[{"produto_id":9,"quantidade":1}]');
