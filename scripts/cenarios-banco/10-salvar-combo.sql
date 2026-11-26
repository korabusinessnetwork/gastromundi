-- Cenários da refatoração 1.1 (salvar_combo, 20261123_salvar_combo_atomico.sql).
-- Os números seguem a tabela de critérios da spec 1.1.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''

-- Um combo de B, criado direto (fora de qualquer papel), para os cenários 6 e 9.
INSERT INTO public.combos (id, nome, item_principal_id, modo, preco_total, tenant_id)
VALUES ('cb000000-0000-0000-0000-00000000000b', 'Combo de B', 201, 'combo', 40, :B) ON CONFLICT DO NOTHING;

-- 1. Gerente cria um combo com produto e subproduto.
BEGIN;
SELECT teste.como('gerente', :A); SET LOCAL ROLE authenticated;
CREATE TEMP TABLE IF NOT EXISTS novo (id uuid) ON COMMIT DROP;
INSERT INTO novo SELECT public.salvar_combo(NULL, 'Combo Lanche', 101, 'combo', 34,
  '[{"subproduto_id":"5a000000-0000-0000-0000-000000000001","quantidade":1}]',
  '[{"produto_id":102,"quantidade":1,"preco_customizado":8}]');
RESET ROLE;
SELECT teste.conferir((SELECT count(*) FROM public.combos c JOIN novo n ON n.id = c.id WHERE c.tenant_id = :A) = 1, '1. gerente cria o combo no próprio estabelecimento');
SELECT teste.conferir((SELECT count(*) FROM public.combo_produtos p JOIN novo n ON n.id = p.combo_id) = 1
  AND (SELECT count(*) FROM public.combo_subprodutos s JOIN novo n ON n.id = s.combo_id) = 1, '1. a composição entra junto');
COMMIT;

-- 2. Gerente edita: troca a composição inteira.
BEGIN;
SELECT teste.como('gerente', :A); SET LOCAL ROLE authenticated;
SELECT public.salvar_combo((SELECT id FROM public.combos WHERE nome = 'Combo Lanche'), 'Combo Lanche Grande', 101, 'combo', 40,
  '[]', '[{"produto_id":102,"quantidade":2}]');
RESET ROLE;
SELECT teste.conferir((SELECT nome FROM public.combos WHERE nome LIKE 'Combo Lanche%') = 'Combo Lanche Grande', '2. gerente edita o nome');
SELECT teste.conferir((SELECT count(*) FROM public.combo_subprodutos s JOIN public.combos c ON c.id = s.combo_id WHERE c.nome = 'Combo Lanche Grande') = 0
  AND (SELECT quantidade FROM public.combo_produtos p JOIN public.combos c ON c.id = p.combo_id WHERE c.nome = 'Combo Lanche Grande') = 2, '2. a composição antiga sai e a nova entra');
COMMIT;

-- 3. Falha no meio (subproduto que não existe) desfaz tudo, inclusive os deletes da edição.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.combos WHERE nome = 'Combo Lanche Grande');
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_combo(v_id, 'Nome que não pode ficar', 101, 'combo', 1,
      '[{"subproduto_id":"00000000-0000-0000-0000-00000000dead","quantidade":1}]', '[{"produto_id":102,"quantidade":5}]');
    RAISE EXCEPTION 'FALHOU: 3. a gravação com subproduto inexistente passou';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT nome FROM public.combos WHERE id = v_id) = 'Combo Lanche Grande', '3. o nome não mudou');
  PERFORM teste.conferir((SELECT quantidade FROM public.combo_produtos WHERE combo_id = v_id) = 2, '3. a composição antiga continua inteira');
END $$;

-- 4 e 5. Combo sem item, ou com quantidade menor que 1, é recusado antes de gravar.
DO $$
DECLARE antes int := (SELECT count(*) FROM public.combos);
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_combo(NULL, 'Vazio', 101, 'combo', 10, '[]', '[]');
    RAISE EXCEPTION 'FALHOU: 4. combo sem item passou';
  EXCEPTION WHEN raise_exception THEN
    PERFORM teste.conferir(SQLERRM = 'Adicione ao menos um produto ou subproduto ao combo.', '4. combo sem item é recusado com a frase certa');
  END;
  BEGIN
    PERFORM public.salvar_combo(NULL, 'Zero', 101, 'combo', 10, '[]', '[{"produto_id":102,"quantidade":0}]');
    RAISE EXCEPTION 'FALHOU: 5. quantidade 0 passou';
  EXCEPTION WHEN raise_exception THEN
    PERFORM teste.conferir(SQLERRM = 'Cada item do combo precisa de quantidade 1 ou mais.', '5. quantidade menor que 1 é recusada');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.combos) = antes, '4 e 5. nada foi gravado');
END $$;

-- 6. Combo de outro estabelecimento é invisível.
BEGIN;
SELECT teste.como('gerente', :A); SET LOCAL ROLE authenticated;
SELECT teste.conferir((SELECT count(*) FROM public.combos WHERE nome = 'Combo de B') = 0, '6. o combo de B não aparece para A');
COMMIT;

-- 7 e 8. Garçom é recusado ao criar e ao editar.
DO $$
DECLARE antes int := (SELECT count(*) FROM public.combos);
BEGIN
  PERFORM teste.como('garcom', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_combo(NULL, 'Do garçom', 101, 'combo', 10, '[]', '[{"produto_id":102,"quantidade":1}]');
    RAISE EXCEPTION 'FALHOU: 7. garçom criou combo';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '7. garçom é recusado ao criar (42501)');
  END;
  BEGIN
    PERFORM public.salvar_combo((SELECT id FROM public.combos WHERE nome = 'Combo Lanche Grande'), 'Mexido', 101, 'combo', 1, '[]', '[{"produto_id":102,"quantidade":1}]');
    RAISE EXCEPTION 'FALHOU: 8. garçom editou combo';
  EXCEPTION WHEN no_data_found OR insufficient_privilege THEN PERFORM teste.conferir(true, '8. garçom é recusado ao editar');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.combos) = antes AND EXISTS (SELECT 1 FROM public.combos WHERE nome = 'Combo Lanche Grande'), '7 e 8. nada mudou');
END $$;

-- 9. Editar o combo de outro estabelecimento é recusado sem mudar nada.
DO $$
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_combo('cb000000-0000-0000-0000-00000000000b', 'Tomado', 101, 'combo', 1, '[]', '[{"produto_id":102,"quantidade":1}]');
    RAISE EXCEPTION 'FALHOU: 9. A editou o combo de B';
  EXCEPTION WHEN no_data_found THEN
    PERFORM teste.conferir(SQLSTATE = 'P0002', '9. a edição do combo de B é recusada (P0002)');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT nome FROM public.combos WHERE id = 'cb000000-0000-0000-0000-00000000000b') = 'Combo de B', '9. o combo de B continua igual');
END $$;

-- 10. Anônimo não executa a função.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.salvar_combo(NULL, 'Anônimo', 101, 'combo', 1, '[]', '[{"produto_id":102,"quantidade":1}]');
    RAISE EXCEPTION 'FALHOU: 10. anônimo executou';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '10. anônimo não executa a função');
  END;
  RESET ROLE;
END $$;
