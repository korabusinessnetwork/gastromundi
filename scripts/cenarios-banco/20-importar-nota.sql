-- Cenários da refatoração 1.2 (importar_nota_fiscal, 20261124_importar_nota_fiscal_atomica.sql).
\set ON_ERROR_STOP 1

-- 1. Gerente importa: nota, itens, histórico com custo na unidade do estoque e saldo somado.
DO $$
DECLARE antes numeric := COALESCE((SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0);
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.importar_nota_fiscal(
    '{"chave_acesso":"35261100000000000001550010000000011000000011","numero":"1","serie":"1","data_emissao":"2026-11-18","fornecedor_nome":"Atacado","valor_total":"54"}',
    '[{"product_id":"102","descricao_xml":"Refri cx","quantidade":"1","preco_unitario":"54","preco_total":"54","fator_conversao":"12","quantidade_estoque":"12"},
      {"product_id":"","descricao_xml":"Guardanapo","quantidade":"5","preco_unitario":"3","preco_total":"15"}]');
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.notas_fiscais WHERE numero = '1' AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, '1. a nota é gravada no estabelecimento de quem importa');
  PERFORM teste.conferir((SELECT count(*) FROM public.notas_fiscais_itens i JOIN public.notas_fiscais n ON n.id = i.nota_fiscal_id WHERE n.numero = '1') = 2, '1. os dois itens entram, o vinculado e o sem vínculo');
  PERFORM teste.conferir((SELECT preco_unitario FROM public.estoque_entradas WHERE product_id = 102) = 4.5
    AND (SELECT data_entrada FROM public.estoque_entradas WHERE product_id = 102) = '2026-11-18', '1. o histórico leva o custo por unidade (54 / 12) e a data de emissão');
  PERFORM teste.conferir((SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') = antes + 12, '1. o saldo soma as 12 unidades');
END $$;

-- 2. A mesma chave de acesso de novo é recusada e não soma o saldo outra vez.
DO $$
DECLARE antes numeric := (SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001');
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.importar_nota_fiscal('{"chave_acesso":"35261100000000000001550010000000011000000011","numero":"1"}',
      '[{"product_id":"102","quantidade":"1","quantidade_estoque":"12"}]');
    RAISE EXCEPTION 'FALHOU: 2. a nota repetida foi importada';
  EXCEPTION WHEN unique_violation THEN PERFORM teste.conferir(true, '2. a chave repetida é recusada (23505)');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') = antes, '2. o saldo não soma de novo');
END $$;

-- 3 e 4. Falha num item (produto de outro estabelecimento) desfaz nota, itens, histórico
-- e somas já feitas; depois disso a mesma nota pode ser importada.
DO $$
DECLARE antes numeric := (SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001');
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.importar_nota_fiscal('{"chave_acesso":"35261100000000000001550010000000022000000022","numero":"2"}',
      '[{"product_id":"102","quantidade":"1","quantidade_estoque":"6"},{"product_id":"201","quantidade":"1","quantidade_estoque":"6"}]');
    RAISE EXCEPTION 'FALHOU: 3. a nota com produto de B passou';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  RESET ROLE;
  PERFORM teste.conferir(NOT EXISTS (SELECT 1 FROM public.notas_fiscais WHERE numero = '2'), '3. a nota não fica gravada');
  PERFORM teste.conferir((SELECT count(*) FROM public.estoque_entradas WHERE quantidade = 6) = 0, '3. nenhum histórico fica gravado');
  PERFORM teste.conferir((SELECT quantidade FROM public.estoque WHERE produto_id = 102 AND tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') = antes, '3. a soma do primeiro item é desfeita');

  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  PERFORM public.importar_nota_fiscal('{"chave_acesso":"35261100000000000001550010000000022000000022","numero":"2"}',
    '[{"product_id":"102","quantidade":"1","quantidade_estoque":"6"}]');
  RESET ROLE;
  PERFORM teste.conferir(EXISTS (SELECT 1 FROM public.notas_fiscais WHERE numero = '2'), '4. depois da falha a mesma nota é importada');
END $$;

-- 5. Item vinculado sem quantidade para o estoque é recusado antes de gravar.
DO $$
BEGIN
  PERFORM teste.como('gerente', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.importar_nota_fiscal('{"numero":"3"}', '[{"product_id":"102","quantidade":"1","quantidade_estoque":"0"}]');
    RAISE EXCEPTION 'FALHOU: 5. item com quantidade 0 passou';
  EXCEPTION WHEN raise_exception THEN
    PERFORM teste.conferir(SQLERRM LIKE 'Há produto vinculado com quantidade 0%', '5. item vinculado com quantidade 0 é recusado');
  END;
  RESET ROLE;
  PERFORM teste.conferir(NOT EXISTS (SELECT 1 FROM public.notas_fiscais WHERE numero = '3'), '5. nada foi gravado');
END $$;

-- 7. Caixa é recusado sem mudar nada.
DO $$
DECLARE antes int := (SELECT count(*) FROM public.notas_fiscais);
BEGIN
  PERFORM teste.como('caixa', 'aaaaaaaa-0000-0000-0000-000000000001');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.importar_nota_fiscal('{"numero":"4"}', '[{"product_id":"102","quantidade":"1","quantidade_estoque":"1"}]');
    RAISE EXCEPTION 'FALHOU: 7. caixa importou nota';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '7. caixa é recusado (42501)');
  END;
  RESET ROLE;
  PERFORM teste.conferir((SELECT count(*) FROM public.notas_fiscais) = antes, '7. nada mudou');
END $$;

-- 10. Anônimo não executa.
DO $$
BEGIN
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.importar_nota_fiscal('{"numero":"5"}', '[]');
    RAISE EXCEPTION 'FALHOU: 10. anônimo executou';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM teste.conferir(true, '10. anônimo não executa a função');
  END;
  RESET ROLE;
END $$;
