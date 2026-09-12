-- Testes de banco: dinheiro. Estoque idempotente, assinatura, pedido público.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\set ADMIN_A '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"gastro_role":"admin","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}}'
\set PLATAFORMA '{"sub":"33333333-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"gastro_role":"plataforma"}}'

-- Os ids saem aqui, como dono do banco e antes de assumir qualquer papel:
-- sob RLS nenhum papel enxerga os dois estabelecimentos ao mesmo tempo, e o
-- produto do vizinho voltaria nulo (é justamente o que o arquivo 10 prova).
SELECT (SELECT id FROM public.products WHERE name = 'qa-Pão de queijo com açúcar 🧀') AS id_a,
       (SELECT id FROM public.products WHERE name = 'qa-Produto do tenant B')        AS id_b,
       (SELECT id FROM public.products WHERE name = 'qa-Produto inativo')            AS id_inativo \gset

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', :'ADMIN_A', false);

-- D01/D02 baixa de estoque: idempotente por op_id, e nunca negativa
DO $$
DECLARE op uuid := gen_random_uuid(); pid bigint; s1 numeric; s2 numeric; s3 numeric;
BEGIN
  SELECT id INTO pid FROM public.products WHERE name = 'qa-Pão de queijo com açúcar 🧀';
  PERFORM public.entrada_estoque(pid, 100);
  SELECT quantidade INTO s1 FROM public.estoque WHERE produto_id = pid;
  PERFORM public.baixar_estoque(pid, 10, op);
  SELECT quantidade INTO s2 FROM public.estoque WHERE produto_id = pid;
  PERFORM public.baixar_estoque(pid, 10, op);
  SELECT quantidade INTO s3 FROM public.estoque WHERE produto_id = pid;
  IF s2 <> s1 - 10 THEN RAISE EXCEPTION 'FALHOU  D01 baixa nao descontou (% -> %)', s1, s2; END IF;
  IF s3 <> s2 THEN RAISE EXCEPTION 'FALHOU  D02 reenvio com o mesmo op_id descontou de novo (% -> %)', s2, s3; END IF;
  RAISE NOTICE 'PASSOU  D01 baixa de estoque desconta';
  RAISE NOTICE 'PASSOU  D02 reenvio da fila offline com o mesmo op_id nao desconta duas vezes';
  PERFORM public.baixar_estoque(pid, 999999, NULL);
  SELECT quantidade INTO s1 FROM public.estoque WHERE produto_id = pid;
  IF s1 < 0 THEN RAISE EXCEPTION 'FALHOU  D03 saldo de estoque ficou negativo: %', s1; END IF;
  RAISE NOTICE 'PASSOU  D03 saldo de estoque nunca fica negativo';
END $$;

-- D04..D07 assinatura: renovação, competência repetida, valor negativo, estorno duplo
SELECT set_config('request.jwt.claims', :'PLATAFORMA', false);
DO $$
DECLARE t uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
        comp date := date_trunc('month', current_date)::date;
        v0 date; v1 date; v2 date; pid uuid;
BEGIN
  DELETE FROM public.assinaturas_pagamentos WHERE tenant_id = t;
  UPDATE public.assinaturas SET data_vencimento = current_date + 20, status = 'ativo' WHERE tenant_id = t;
  SELECT data_vencimento INTO v0 FROM public.assinaturas WHERE tenant_id = t;

  PERFORM public.confirmar_renovacao_assinatura(t, comp, 200.00, 'pix', 'qa-plataforma');
  SELECT data_vencimento INTO v1 FROM public.assinaturas WHERE tenant_id = t;
  IF v1 <= v0 THEN RAISE EXCEPTION 'FALHOU  D04 renovacao nao avancou o vencimento'; END IF;
  RAISE NOTICE 'PASSOU  D04 renovacao avanca o vencimento um ciclo';

  BEGIN
    PERFORM public.confirmar_renovacao_assinatura(t, comp, 200.00, 'pix', 'qa-plataforma');
    RAISE EXCEPTION 'FALHOU  D05 a mesma competencia foi cobrada duas vezes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  D05 competencia repetida recusada';
  END;

  BEGIN
    PERFORM public.confirmar_renovacao_assinatura(t, (comp - interval '1 month')::date, -50, 'pix', 'qa-plataforma');
    RAISE EXCEPTION 'FALHOU  D06 renovacao aceita com valor negativo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  D06 valor negativo recusado';
  END;

  SELECT id INTO pid FROM public.assinaturas_pagamentos WHERE tenant_id = t AND estornado_em IS NULL ORDER BY confirmado_em DESC LIMIT 1;
  PERFORM public.estornar_pagamento_assinatura(pid, 'qa-motivo de teste', 'qa-plataforma');
  SELECT data_vencimento INTO v2 FROM public.assinaturas WHERE tenant_id = t;
  IF v2 <> v0 THEN RAISE EXCEPTION 'FALHOU  D07 estorno nao devolveu o ciclo (% vs %)', v2, v0; END IF;
  RAISE NOTICE 'PASSOU  D07 estorno devolve exatamente um ciclo';

  BEGIN
    PERFORM public.estornar_pagamento_assinatura(pid, 'qa-segundo estorno', 'qa-plataforma');
    RAISE EXCEPTION 'FALHOU  D08 o mesmo pagamento foi estornado duas vezes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  D08 estorno duplicado recusado';
  END;
END $$;

-- D09..D12 pedido público de delivery: preço é do servidor, não do cliente
-- (repõe o estoque que o D03 zerou de propósito, senão o cardápio recusa o item)
SELECT set_config('request.jwt.claims', :'ADMIN_A', false);
SELECT public.entrada_estoque((SELECT id FROM public.products WHERE name = 'qa-Pão de queijo com açúcar 🧀'), 500);

-- o corpo do teste vira função, porque psql não substitui :variavel dentro de $$
CREATE OR REPLACE FUNCTION pg_temp.teste_pedido_publico(pid bigint, pidB bigint, pidInativo bigint)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE r jsonb; base jsonb;
BEGIN
  base := jsonb_build_object(
    'pagamento', jsonb_build_object('forma','dinheiro'),
    'entrega',   jsonb_build_object('endereco','qa-Rua de teste, 100','bairro','qa-Centro','cep','01000-000'),
    'cliente',   jsonb_build_object('nome','qa-Cliente','telefone','11999990000'));

  SELECT public.criar_pedido_delivery('qa-a', base || jsonb_build_object('itens',
    jsonb_build_array(jsonb_build_object('produto_id', pid, 'qtd', 2)))) INTO r;
  IF (r->>'total')::numeric <> 20.00 THEN RAISE EXCEPTION 'FALHOU  D09 total do pedido honesto deu % e nao 20.00', r->>'total'; END IF;
  RAISE NOTICE 'PASSOU  D09 pedido honesto cobra 2 x 7,50 mais taxa 5,00';

  SELECT public.criar_pedido_delivery('qa-a', base || jsonb_build_object('total', 0.02, 'subtotal', 0.02, 'taxa_entrega', 0, 'itens',
    jsonb_build_array(jsonb_build_object('produto_id', pid, 'qtd', 2, 'preco', 0.01, 'preco_unit', 0.01)))) INTO r;
  IF (r->>'total')::numeric <> 20.00 THEN RAISE EXCEPTION 'FALHOU  D10 cliente forjou o preco, total virou %', r->>'total'; END IF;
  RAISE NOTICE 'PASSOU  D10 preco forjado pelo cliente e ignorado, servidor recalcula';

  BEGIN
    PERFORM public.criar_pedido_delivery('qa-a', base || jsonb_build_object('itens',
      jsonb_build_array(jsonb_build_object('produto_id', pidB, 'qtd', 1))));
    RAISE EXCEPTION 'FALHOU  D11 pedido aceitou produto de outro estabelecimento';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  D11 produto de outro estabelecimento recusado';
  END;

  BEGIN
    PERFORM public.criar_pedido_delivery('qa-a', base || jsonb_build_object('itens',
      jsonb_build_array(jsonb_build_object('produto_id', pidInativo, 'qtd', 1))));
    RAISE EXCEPTION 'FALHOU  D12 pedido aceitou produto inativo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  D12 produto inativo recusado';
  END;
END $fn$;

RESET ROLE; SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SELECT pg_temp.teste_pedido_publico(:id_a, :id_b, :id_inativo);
