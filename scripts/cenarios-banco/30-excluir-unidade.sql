-- Cenários da refatoração 1.3 (excluir_unidade_medida, 20261125_excluir_unidade_medida_atomica.sql).
\set ON_ERROR_STOP 1

-- Unidade "cx" em A, usada pelo produto 101 no estoque, no consumo e na compra;
-- e uma unidade em B.
INSERT INTO public.unidades_medida (id, nome, abreviacao, tipo, tenant_id) VALUES
  ('a1000000-0000-0000-0000-0000000000c1', 'Caixa', 'cx', 'compra', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-0000000000c2', 'Fardo', 'fd', 'compra', 'bbbbbbbb-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;
UPDATE public.products SET unidade_estoque = 'cx', unidade_consumo = 'cx',
  unidades_compra = '[{"unidade":"cx","fator":12},{"unidade":"un","fator":1}]' WHERE id = 101;

-- 1 e 2. Gerente e caixa são recusados, e nenhum produto muda.
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['gerente', 'caixa'] LOOP
    PERFORM teste.como(papel, 'aaaaaaaa-0000-0000-0000-000000000001');
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.excluir_unidade_medida('a1000000-0000-0000-0000-0000000000c1');
      RAISE EXCEPTION 'FALHOU: % excluiu a unidade', papel;
    EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, format('1 e 2. %s é recusado (42501)', papel));
    END;
    RESET ROLE;
    PERFORM teste.conferir((SELECT unidade_estoque = 'cx' AND unidade_consumo = 'cx' AND jsonb_array_length(unidades_compra) = 2 FROM public.products WHERE id = 101),
      format('1 e 2. depois da recusa ao %s, o produto continua com a unidade', papel));
  END LOOP;
END $$;

-- 5 e 6. Unidade inexistente, ou de outro estabelecimento, é recusada sem mudar nada.
DO $$
BEGIN
  PERFORM teste.como('admin', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.excluir_unidade_medida('00000000-0000-0000-0000-00000000dead');
    RAISE EXCEPTION 'FALHOU: 5. unidade inexistente passou';
  EXCEPTION WHEN no_data_found THEN PERFORM teste.conferir(true, '5. unidade inexistente é recusada (P0002)');
  END;
  BEGIN
    PERFORM public.excluir_unidade_medida('b1000000-0000-0000-0000-0000000000c2');
    RAISE EXCEPTION 'FALHOU: 6. A excluiu a unidade de B';
  EXCEPTION WHEN no_data_found THEN PERFORM teste.conferir(true, '6. a unidade de B é invisível para A (P0002)');
  END;
  RESET ROLE;
  PERFORM teste.conferir(EXISTS (SELECT 1 FROM public.unidades_medida WHERE id = 'b1000000-0000-0000-0000-0000000000c2'), '6. a unidade de B continua lá');
END $$;

-- 3 e 4. Admin exclui, e a unidade sai do estoque, do consumo e da compra do produto.
DO $$
BEGIN
  PERFORM teste.como('admin', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.excluir_unidade_medida('a1000000-0000-0000-0000-0000000000c1');
  RESET ROLE;
  PERFORM teste.conferir(NOT EXISTS (SELECT 1 FROM public.unidades_medida WHERE id = 'a1000000-0000-0000-0000-0000000000c1'), '3. admin exclui a unidade');
  PERFORM teste.conferir((SELECT unidade_estoque = '' AND unidade_consumo IS NULL AND unidades_compra = '[{"unidade":"un","fator":1}]'::jsonb FROM public.products WHERE id = 101),
    '4. a unidade sai do estoque, do consumo e da compra; a outra unidade de compra fica');
END $$;

-- 7. Anônimo não executa.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.excluir_unidade_medida('b1000000-0000-0000-0000-0000000000c2');
    RAISE EXCEPTION 'FALHOU: 7. anônimo executou';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '7. anônimo não executa a função');
  END;
  RESET ROLE;
END $$;
