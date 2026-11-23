-- Cenários de salvar_subproduto. Ver supabase/tests/README.md.
\set ON_ERROR_STOP 0
\pset footer off
\i supabase/migrations/20261126_salvar_subproduto_atomico.sql
\set VERBOSITY terse
SET ROLE authenticated;
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';

\echo '== 1. gerente cria subproduto que controla estoque: subproduto e saldo juntos'
SELECT public.salvar_subproduto(NULL, ' Batata ', 'Acompanhamentos', 8, 'Unidade', true, true, 30, 5) AS novo \gset
SELECT s.nome, s.controla_estoque, e.quantidade, e.minimo FROM subprodutos s JOIN estoque_subprodutos e ON e.subproduto_id = s.id WHERE s.id = :'novo';

\echo '== 2. edição muda cadastro e saldo'
SELECT public.salvar_subproduto(:'novo', 'Batata média', 'Acompanhamentos', 9, 'Unidade', true, true, 12, 3);
SELECT s.nome, s.preco, e.quantidade, e.minimo FROM subprodutos s JOIN estoque_subprodutos e ON e.subproduto_id = s.id WHERE s.id = :'novo';

\echo '== 3. falha no saldo (CHECK quantidade >= 0 burlado por mínimo negativo) recusa ANTES de gravar: nada muda'
SELECT public.salvar_subproduto(:'novo', 'NOME QUE NAO PODE FICAR', 'X', 1, 'Unidade', true, true, 1, -1);
SELECT nome, preco FROM subprodutos WHERE id = :'novo';

\echo '== 3b. o SALDO falha depois do subproduto ter sido inserido: o subproduto novo também some (o defeito de antes)'
RESET ROLE;
ALTER TABLE public.estoque_subprodutos ADD CONSTRAINT teste_saldo_teto CHECK (quantidade < 1000);
SET ROLE authenticated;
SELECT public.salvar_subproduto(NULL, 'Duplicado em potencial', 'X', 1, 'Unidade', true, true, 5000, 1);
RESET ROLE;
SELECT count(*) AS subproduto_orfao FROM subprodutos WHERE nome = 'Duplicado em potencial';
ALTER TABLE public.estoque_subprodutos DROP CONSTRAINT teste_saldo_teto;
SET ROLE authenticated;

\echo '== 4. CAIXA cria: o subproduto é recusado (42501), nenhum saldo órfão'
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"caixa","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT public.salvar_subproduto(NULL, 'Do caixa', 'X', 1, 'Unidade', true, true, 1, 1);
\echo '== 5. CAIXA edita: P0002 (a RLS esconde a linha), saldo não muda'
SELECT public.salvar_subproduto(:'novo', 'Do caixa', 'X', 1, 'Unidade', true, true, 999, 1);
SET request.jwt.claims = '{"role":"authenticated","app_metadata":{"gastro_role":"gerente","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SELECT quantidade AS saldo_segue_12 FROM estoque_subprodutos WHERE subproduto_id = :'novo';

\echo '== 6. deixar de controlar estoque não apaga o saldo antigo'
SELECT public.salvar_subproduto(:'novo', 'Batata média', 'Acompanhamentos', 9, 'Unidade', false, true, NULL, NULL);
SELECT s.controla_estoque, (SELECT quantidade FROM estoque_subprodutos WHERE subproduto_id = s.id) AS saldo_guardado FROM subprodutos s WHERE s.id = :'novo';

\echo '== 7. nome vazio, preço negativo, quantidade NaN: P0001'
SELECT public.salvar_subproduto(NULL, '  ', 'X', 1, 'Unidade', false, true, NULL, NULL);
SELECT public.salvar_subproduto(NULL, 'A', 'X', -1, 'Unidade', false, true, NULL, NULL);
SELECT public.salvar_subproduto(NULL, 'A', 'X', 1, 'Unidade', true, true, 'NaN', 1);
\echo '== 8. subproduto de OUTRO estabelecimento: P0002'
SELECT public.salvar_subproduto('bbbbbbbb-0000-0000-0000-000000000009', 'Invasão', 'X', 1, 'Unidade', false, true, NULL, NULL);

\echo '== 9. estado final: 2 subprodutos (Batata média e o do outro), 1 saldo'
RESET ROLE;
SELECT nome FROM subprodutos ORDER BY nome;
SELECT count(*) AS saldos FROM estoque_subprodutos;
\echo '== 10. anônimo não executa'
SET ROLE anon;
SELECT public.salvar_subproduto(NULL, 'A', 'X', 1, 'Unidade', false, true, NULL, NULL);
