-- Cenários da refatoração 1.6 (salvar_subproduto, 20261126_salvar_subproduto_atomico.sql).
\set ON_ERROR_STOP 1

INSERT INTO public.subprodutos (id, nome, controla_estoque, tenant_id) VALUES
  ('5b000000-0000-0000-0000-0000000000b9', 'Molho de B', true, 'bbbbbbbb-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- 1 e 2. Gerente cria com estoque, e edita.
DO $$
DECLARE v_id uuid;
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  v_id := public.salvar_subproduto(NULL, 'Cheddar', 'Adicionais', 3, 'un', true, true, 20, 5);
  PERFORM public.salvar_subproduto(v_id, 'Cheddar cremoso', 'Adicionais', 3.5, 'un', true, true, 18, 5);
  RESET ROLE;
  PERFORM teste.conferir((SELECT nome FROM public.subprodutos WHERE id = v_id) = 'Cheddar cremoso', '1 e 2. gerente cria e edita');
  PERFORM teste.conferir((SELECT quantidade FROM public.estoque_subprodutos WHERE subproduto_id = v_id) = 18, '1 e 2. o saldo acompanha a edição');
END $$;

-- 3 e 7. Validações recusam antes de gravar, inclusive NaN.
DO $$
DECLARE antes int := (SELECT count(*) FROM public.subprodutos);
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_subproduto(NULL, 'Sem preço', NULL, 'NaN', 'un', false, true, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: 3. preço NaN passou';
  EXCEPTION WHEN raise_exception THEN PERFORM teste.conferir(SQLERRM = 'Preço inválido.', '3. preço NaN é recusado');
  END;
  BEGIN
    PERFORM public.salvar_subproduto(NULL, 'Estoque NaN', NULL, 1, 'un', true, true, 'NaN', 0);
    RAISE EXCEPTION 'FALHOU: 7. quantidade NaN passou';
  EXCEPTION WHEN raise_exception THEN PERFORM teste.conferir(SQLERRM = 'Quantidade em estoque inválida.', '7. quantidade NaN é recusada');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.subprodutos) = antes, '3 e 7. nada foi gravado');
END $$;

-- 3b. Falha no saldo, depois do subproduto inserido, desfaz o subproduto. Um gatilho
-- de teste faz a gravação do saldo falhar e sai no fim.
CREATE OR REPLACE FUNCTION teste.falhar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'falha simulada no saldo'; END $$;
CREATE TRIGGER teste_falha_saldo BEFORE INSERT ON public.estoque_subprodutos FOR EACH ROW EXECUTE FUNCTION teste.falhar();
DO $$
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_subproduto(NULL, 'Bacon', NULL, 4, 'un', true, true, 10, 2);
    RAISE EXCEPTION 'FALHOU: 3b. a falha no saldo não chegou';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  RESET ROLE;
  PERFORM teste.conferir(NOT EXISTS (SELECT 1 FROM public.subprodutos WHERE nome = 'Bacon'), '3b. a falha no saldo desfaz o subproduto inserido');
END $$;
DROP TRIGGER teste_falha_saldo ON public.estoque_subprodutos;

-- 4 e 5. Caixa é recusado ao criar e ao editar, sem nada mudar.
DO $$
DECLARE antes int := (SELECT count(*) FROM public.subprodutos); v_id uuid := (SELECT id FROM public.subprodutos WHERE nome = 'Cheddar cremoso');
BEGIN
  PERFORM teste.como('caixa', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_subproduto(NULL, 'Do caixa', NULL, 1, 'un', false, true, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: 4. caixa criou';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '4. caixa é recusado ao criar (42501)');
  END;
  BEGIN
    PERFORM public.salvar_subproduto(v_id, 'Mexido pelo caixa', NULL, 1, 'un', false, true, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: 5. caixa editou';
  EXCEPTION WHEN no_data_found OR insufficient_privilege THEN PERFORM teste.conferir(true, '5. caixa é recusado ao editar');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.subprodutos) = antes AND (SELECT nome FROM public.subprodutos WHERE id = v_id) = 'Cheddar cremoso', '4 e 5. nada mudou');
END $$;

-- 6. Deixar de controlar estoque não apaga o saldo.
DO $$
DECLARE v_id uuid := (SELECT id FROM public.subprodutos WHERE nome = 'Cheddar cremoso');
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.salvar_subproduto(v_id, 'Cheddar cremoso', 'Adicionais', 3.5, 'un', false, true, NULL, NULL);
  RESET ROLE;
  PERFORM teste.conferir((SELECT quantidade FROM public.estoque_subprodutos WHERE subproduto_id = v_id) = 18, '6. o saldo de 18 continua guardado');
END $$;

-- 8. Subproduto de outro estabelecimento é invisível: editar é recusado.
DO $$
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.salvar_subproduto('5b000000-0000-0000-0000-0000000000b9', 'Tomado', NULL, 1, 'un', false, true, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: 8. A editou o subproduto de B';
  EXCEPTION WHEN no_data_found THEN PERFORM teste.conferir(true, '8. o subproduto de B é invisível para A (P0002)');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT nome FROM public.subprodutos WHERE id = '5b000000-0000-0000-0000-0000000000b9') = 'Molho de B', '8. o subproduto de B continua igual');
END $$;

-- 10. Anônimo não executa.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.salvar_subproduto(NULL, 'Anônimo', NULL, 1, 'un', false, true, NULL, NULL);
    RAISE EXCEPTION 'FALHOU: 10. anônimo executou';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '10. anônimo não executa a função');
  END;
  RESET ROLE;
END $$;
