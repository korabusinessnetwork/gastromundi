-- Testes de banco: isolamento entre estabelecimentos, papéis e superfície anônima.
-- Falha => RAISE EXCEPTION => psql com ON_ERROR_STOP sai diferente de zero.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION pg_temp.checar(nome text, ok boolean, detalhe text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASSOU  %', nome;
  ELSE RAISE EXCEPTION 'FALHOU  % %', nome, detalhe; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.entrar(claims text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims', claims, false); END $$;

\set ADMIN_A '{"sub":"11111111-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"gastro_role":"admin","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}}'
\set GARCOM_A '{"sub":"11111111-0000-4000-8000-000000000004","role":"authenticated","app_metadata":{"gastro_role":"garcom","tenant_id":"aaaaaaaa-0000-4000-8000-000000000001"}}'
\set ANON '{"role":"anon"}'

SET ROLE authenticated;
SELECT pg_temp.entrar(:'ADMIN_A');

-- B01 leitura cruzada entre estabelecimentos
SELECT pg_temp.checar('B01 admin do tenant A nao le produto do tenant B',
  (SELECT count(*) = 0 FROM public.products WHERE tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002'));
SELECT pg_temp.checar('B02 admin do tenant A nao le usuario do tenant B',
  (SELECT count(*) = 0 FROM public.users WHERE tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002'));
SELECT pg_temp.checar('B03 admin do tenant A nao le venda do tenant B',
  (SELECT count(*) = 0 FROM public.vendas WHERE tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002'));
SELECT pg_temp.checar('B04 admin do tenant A nao le config fiscal do tenant B',
  (SELECT count(*) = 0 FROM public.tenant_fiscal_config WHERE tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002'));

-- B05 escrita cruzada
DO $$ BEGIN
  BEGIN
    INSERT INTO public.products (name, price, category, active, unidades_compra, unidade_estoque, produzivel, tenant_id)
    VALUES ('qa-invasao', 1, 'qa', true, '[]'::jsonb, 'un', false, 'bbbbbbbb-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'FALHOU  B05 admin do tenant A inseriu produto no tenant B';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASSOU  B05 insert cruzado recusado';
  END;
  BEGIN
    UPDATE public.products SET tenant_id = 'bbbbbbbb-0000-4000-8000-000000000002' WHERE name = 'qa-Produto inativo';
    RAISE EXCEPTION 'FALHOU  B06 produto foi MOVIDO de um estabelecimento para outro';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASSOU  B06 mover produto entre estabelecimentos recusado';
  END;
END $$;

-- B07 papel: garçom não escala privilégio dentro do próprio estabelecimento
SELECT pg_temp.entrar(:'GARCOM_A');
DO $$ DECLARE n bigint; BEGIN
  BEGIN
    INSERT INTO public.users (name, username, role, active, tenant_id)
    VALUES ('qa-esc','qa-esc-'||floor(random()*1e6)::text,'admin',true,'aaaaaaaa-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FALHOU  B07 garcom criou usuario admin';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASSOU  B07 garcom nao cria usuario';
  END;
  BEGIN
    PERFORM public.entrada_estoque(1, 999);
    RAISE EXCEPTION 'FALHOU  B08 garcom deu entrada em estoque';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
    RAISE NOTICE 'PASSOU  B08 entrada de estoque recusada para garcom';
  END;
  SELECT count(*) INTO n FROM public.tenant_fiscal_config;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU  B09 garcom enxerga config fiscal'; END IF;
  RAISE NOTICE 'PASSOU  B09 garcom nao enxerga config fiscal';
END $$;

-- B10 barreira da plataforma: admin de estabelecimento não mexe em outro
SELECT pg_temp.entrar(:'ADMIN_A');
DO $$
DECLARE alvo uuid := 'bbbbbbbb-0000-4000-8000-000000000002'; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['alterar_plano_tenant','alterar_layout_tenant','definir_mensalidade_tenant',
                            'sincronizar_status_assinatura','analytics_plataforma','saude_plataforma','proximo_numero_nfce'] LOOP
    BEGIN
      CASE fn
        WHEN 'alterar_plano_tenant'          THEN PERFORM public.alterar_plano_tenant(alvo, 'basico');
        WHEN 'alterar_layout_tenant'         THEN PERFORM public.alterar_layout_tenant(alvo, 'desktop');
        WHEN 'definir_mensalidade_tenant'    THEN PERFORM public.definir_mensalidade_tenant(alvo, 1);
        WHEN 'sincronizar_status_assinatura' THEN PERFORM public.sincronizar_status_assinatura(alvo);
        WHEN 'analytics_plataforma'          THEN PERFORM public.analytics_plataforma(7);
        WHEN 'saude_plataforma'              THEN PERFORM public.saude_plataforma(7);
        WHEN 'proximo_numero_nfce'           THEN PERFORM public.proximo_numero_nfce(alvo);
      END CASE;
      RAISE EXCEPTION 'FALHOU  B10 admin de estabelecimento executou %', fn;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
      RAISE NOTICE 'PASSOU  B10 % recusou admin de estabelecimento', fn;
    END;
  END LOOP;
END $$;

-- B11 superfície anônima não lê tabela nenhuma
RESET ROLE; SET ROLE anon;
SELECT pg_temp.entrar(:'ANON');
DO $$ DECLARE t text; n bigint; BEGIN
  FOREACH t IN ARRAY ARRAY['products','users','vendas','clientes','caixa_movimentos','tenants','config','lancamentos','solicitacoes_conta','tenant_fiscal_config'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN RAISE EXCEPTION 'FALHOU  B11 anonimo leu % linhas de %', n, t; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PASSOU  B11 anonimo nao le nenhuma tabela do negocio';
END $$;
