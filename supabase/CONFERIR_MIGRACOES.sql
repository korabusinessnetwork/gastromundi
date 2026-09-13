-- ══════════════════════════════════════════════════════════════════════
-- GASTROMUNDI — quais migrações o banco já tem?
--
-- COMO USAR
--   1. Abra o SQL Editor do seu projeto no Supabase.
--   2. Cole este arquivo INTEIRO e execute.
--   3. Leia a coluna "situacao".
--
-- SÓ LÊ. Não cria, não altera e não apaga nada — é uma consulta ao
-- catálogo do Postgres. Pode rodar quantas vezes quiser, a qualquer hora,
-- inclusive com o restaurante aberto.
--
-- O QUE ELE OLHA: cada migração deixa uma marca no banco (uma coluna, uma
-- função, um índice, um trigger). A consulta procura a marca de cada uma.
-- Marca presente = aquela migração já rodou.
--
-- IMPORTANTE: "já aplicada" aqui quer dizer "a marca está lá". Se você
-- rodar o APLICAR_MIGRACOES_PENDENTES.sql de novo, nada quebra — todas
-- são idempotentes —, então na dúvida rode o arquivo inteiro.
-- ══════════════════════════════════════════════════════════════════════

WITH marcas (n, migracao, marca_existe) AS (
  VALUES
    ( 1, '20260918_delivery_nao_publica_insumo_nem_preco_zero',
         to_regprocedure('public.categoria_interna(text)') IS NOT NULL),
    ( 2, '20260918_grupos_escolha',
         to_regclass('public.grupos_escolha') IS NOT NULL),
    ( 3, '20260919_baixa_estoque_cria_linha',
         to_regprocedure('public.baixar_estoque(bigint, numeric, uuid)') IS NOT NULL),
    ( 4, '20260919_delivery_entregadores',
         to_regclass('public.delivery_entregadores') IS NOT NULL),
    ( 5, '20260919_pautas',
         to_regclass('public.pautas') IS NOT NULL),
    ( 6, '20260920_delivery_pagamento_entregador',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='delivery_pedidos'
                    AND column_name='entregador_id')),
    ( 7, '20260920_rls_habilitada_tabelas_base',
         COALESCE((SELECT relrowsecurity FROM pg_class
                    WHERE oid = to_regclass('public.products')), false)),
    ( 8, '20260921_delivery_rate_limit_sem_telefone',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='delivery_pedidos_rate_limit' AND NOT tgisinternal)),
    ( 9, '20260921_indices_tenant_id',
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='estoque_tenant_id_idx')),
    (10, '20260922_fiscal_config_leitura_por_papel',
         EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='public' AND tablename='tenant_fiscal_config')),
    (11, '20260922_gravar_itens_comanda',
         to_regprocedure('public.gravar_itens_comanda(text, jsonb, text[], numeric)') IS NOT NULL),
    (12, '20260923_combo_produtos_isolamento_tenant',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='combo_produtos'
                    AND column_name='tenant_id')),
    (13, '20260923_dinheiro_precisao',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='vendas'
                    AND column_name='total' AND numeric_scale = 2)),
    (14, '20260924_fechamentos_colunas',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='fechamentos'
                    AND column_name='usuario_nome')),
    (15, '20260924_search_path_security_definer',
         NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.prosecdef
                        AND COALESCE(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%')),
    (16, '20260925_leads_apex',
         to_regclass('public.leads') IS NOT NULL),
    (17, '20260925_ponte_download_bucket',
         EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'ponte-download')),
    (18, '20260926_solicitacoes_conta',
         to_regclass('public.solicitacoes_conta') IS NOT NULL),
    (19, '20260927_grupo_escolha_itens_ativo',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='grupo_escolha_itens'
                    AND column_name='ativo')),
    (20, '20260928_delivery_retirada_no_local',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='config_delivery'
                    AND column_name='permite_retirada')),
    (21, '20260929_delivery_sem_cep_e_meus_pedidos',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='delivery_pedidos'
                    AND column_name='dispositivo_id')),
    (22, '20260930_delivery_telefone_obrigatorio',
         to_regprocedure('public.telefone_br_valido(text)') IS NOT NULL),
    (23, '20261001_delivery_via_sai_sozinha',
         COALESCE(position('launched_at' in (
           SELECT pg_get_functiondef(p.oid) FROM pg_proc p
             JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='criar_pedido_delivery' LIMIT 1)) > 0, false)),
    (24, '20261002_venda_do_delivery',
         to_regprocedure('public.registrar_venda_delivery(uuid)') IS NOT NULL),
    (25, '20261003_delivery_whatsapp_no_aceite',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='config_delivery'
                    AND column_name='whatsapp_no_aceite')),
    (26, '20261004_escolhas_sem_limite',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.grupos_escolha')
                    AND conname  = 'grupos_escolha_maximo_valido'
                    AND pg_get_constraintdef(oid) LIKE '%maximo = 0%'))
)
SELECT
  n                                                    AS "nº",
  migracao                                             AS "migração",
  CASE WHEN marca_existe THEN '✅ já aplicada'
       ELSE                  '⬜ falta rodar' END      AS "situação"
FROM marcas
ORDER BY n;

-- ── Resumo em uma linha ────────────────────────────────────────────────
-- Rode junto: o Supabase mostra o resultado de cada consulta separado.
WITH marcas AS (
  SELECT
    (to_regclass('public.grupos_escolha')            IS NOT NULL)::int
  + (to_regclass('public.delivery_entregadores')     IS NOT NULL)::int
  + (to_regclass('public.pautas')                    IS NOT NULL)::int
  + (to_regclass('public.leads')                     IS NOT NULL)::int
  + (to_regclass('public.solicitacoes_conta')        IS NOT NULL)::int
  + (to_regprocedure('public.telefone_br_valido(text)')      IS NOT NULL)::int
  + (to_regprocedure('public.registrar_venda_delivery(uuid)') IS NOT NULL)::int
  AS marcos_grandes
)
SELECT
  marcos_grandes || ' de 7 marcos grandes presentes' AS "resumo rápido",
  CASE WHEN marcos_grandes = 7
       THEN 'Parece bem atualizado — mesmo assim, rode o APLICAR_MIGRACOES_PENDENTES.sql para fechar as pontas.'
       ELSE 'Faltam migrações. Rode o APLICAR_MIGRACOES_PENDENTES.sql inteiro.' END AS "o que fazer"
FROM marcas;
