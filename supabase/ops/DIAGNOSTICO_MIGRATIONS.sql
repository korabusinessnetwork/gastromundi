-- ══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — o que das migrations REALMENTE está no banco
--
-- Cole TUDO no SQL Editor do Supabase e rode. Ele NÃO altera nada
-- (é só leitura). Devolve uma tabela com uma linha por objeto que as
-- migrations deveriam ter criado, marcando ✅ presente / ❌ FALTANDO.
--
-- Objetivo: descobrir se alguma migration "passou sem ir pro SQL".
-- Foque nas linhas ❌ da coluna `status` — são o que falta aplicar.
--
-- Lê a partir do catálogo do Postgres (pg_*, information_schema) — não
-- depende de nenhuma tabela do app existir.
-- ══════════════════════════════════════════════════════════════════

WITH
-- ── tabelas esperadas ────────────────────────────────────────────
tabelas(nome) AS (VALUES
  ('users'),('products'),('pending'),('sales'),
  ('vendas'),('venda_itens'),('venda_pagamentos'),
  ('lancamentos'),('clientes'),('fechamentos'),('config'),
  ('mesas'),('estoque'),('operator_logs'),('unidades_medida'),
  ('notas_fiscais'),('notas_fiscais_itens'),('estoque_entradas'),
  ('subprodutos'),('combos'),('combo_subprodutos'),
  ('locais_impressao'),('categorias_roteamento'),
  ('jarvas_eventos'),('jarvas_insights'),
  -- comercialização / multi-tenant
  ('tenants'),('planos'),('planos_modulos'),('addons'),('tenant_addons'),
  ('assinaturas'),('assinaturas_pagamentos'),
  -- fiscal (NFC-e)
  ('tenant_fiscal_config'),('nfce_emitidas'),('nfce_inutilizacoes')
),
-- ── colunas críticas esperadas (tabela.coluna → migration de origem)
colunas(tab, col, origem) AS (VALUES
  ('users','auth_id','20240105'),
  ('users','tenant_id','20260723'),
  ('tenants','plano_codigo','20260717/24_fix'),
  ('tenants','tema','20260716'),
  ('pending','mesa','20260703'),
  ('pending','status_cozinha','20260711'),
  ('products','produzivel','20260721'),
  ('vendas','tenant_id','20260724_fase2'),
  ('vendas','cliente_id','20260713'),
  ('lancamentos','tenant_id','20260724_fase2'),
  ('lancamentos','cliente_id','20260713'),
  ('products','tenant_id','20260724_fase2'),
  ('config','tenant_id','20260724_fase2'),
  ('mesas','tenant_id','20260724_fase2'),
  ('clientes','tenant_id','20260724_fase2'),
  ('tenant_fiscal_config','url_recepcao_evento','20260734'),
  ('tenant_fiscal_config','url_inutilizacao','20260736'),
  ('tenant_fiscal_config','contingencia_ativa','20260737'),
  ('nfce_emitidas','xml_evento','20260734')
),
-- ── funções esperadas (por nome; ignora assinatura) ──────────────
funcoes(nome, origem) AS (VALUES
  ('custom_access_token_hook','20240108/20260723'),
  ('verificar_senha_admin','20240106'),
  ('limpar_reserva_mesa','20260702'),
  ('baixar_estoque','20260712/22'),
  ('jarvas_resumo_vendas','20260709'),
  ('relatorio_vendas','20260714'),
  ('tenant_tem_modulo','20260717/25'),
  ('tenant_atual_tem_modulo','20260717/25'),
  ('tenant_atual_tem_addon','20260718/26'),
  ('calcular_status_assinatura','20260719'),
  ('sincronizar_status_assinatura','20260719'),
  ('confirmar_renovacao_assinatura','20260719/22'),
  ('assinatura_ativa','20260720'),
  ('assinatura_atual_ativa','20260720/25'),
  ('tenant_atual_id','20260723'),
  ('is_super_admin','20260723/30'),
  ('provisionar_tenant','20260727/30'),
  ('alterar_plano_tenant','20260729'),
  ('proximo_numero_nfce','20260732'),
  ('set_contingencia_fiscal','20260737')
)

-- 1) TABELAS ────────────────────────────────────────────────────────
SELECT 1 AS ordem, 'TABELA' AS tipo, t.nome AS item, '' AS origem,
       CASE WHEN to_regclass('public.'||t.nome) IS NOT NULL
            THEN '✅' ELSE '❌ FALTANDO' END AS status
FROM tabelas t
UNION ALL
-- 2) COLUNAS críticas ───────────────────────────────────────────────
SELECT 2, 'COLUNA', c.tab||'.'||c.col, c.origem,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns ic
         WHERE ic.table_schema='public' AND ic.table_name=c.tab AND ic.column_name=c.col
       ) THEN '✅' ELSE '❌ FALTANDO' END
FROM colunas c
UNION ALL
-- 3) FUNÇÕES / RPCs ─────────────────────────────────────────────────
SELECT 3, 'FUNCAO', f.nome, f.origem,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname=f.nome
       ) THEN '✅' ELSE '❌ FALTANDO' END
FROM funcoes f
UNION ALL
-- 4) RLS ligada em toda tabela pública esperada ─────────────────────
SELECT 4, 'RLS', t.nome, 'RLS habilitada?',
       CASE WHEN to_regclass('public.'||t.nome) IS NULL THEN '— (tabela não existe)'
            WHEN (SELECT c.relrowsecurity FROM pg_class c
                  WHERE c.oid = to_regclass('public.'||t.nome)) THEN '✅'
            ELSE '❌ RLS DESLIGADA' END
FROM tabelas t
UNION ALL
-- 5) SEGURANÇA: nenhuma policy pode usar o claim errado da raiz ──────
--    (o 20260722 removeu todas; se aparecer > 0, a v2 não entrou)
SELECT 5, 'SEGURANCA', 'policies usando auth.jwt()->>''role'' (raiz ERRADA)',
       'deve ser 0',
       CASE WHEN (
         SELECT count(*) FROM pg_policies
         WHERE schemaname='public'
           AND (COALESCE(qual,'') LIKE '%auth.jwt() ->> ''role''%'
             OR COALESCE(with_check,'') LIKE '%auth.jwt() ->> ''role''%')
       ) = 0 THEN '✅ (0)'
       ELSE '❌ AINDA HÁ — 20260722 não aplicada por completo' END
UNION ALL
-- 6) SEGURANÇA: is_super_admin() é blindada contra NULL (20260730) ───
--    Com um "JWT vazio" a função tem que devolver false, nunca NULL.
SELECT 6, 'SEGURANCA', 'is_super_admin() com JWT vazio = false (não NULL)',
       '20260730',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='is_super_admin')
                 AND public.is_super_admin() IS NOT NULL
            THEN '✅ (retorna false)'
            ELSE '❌ retorna NULL — 20260730 FALTANDO (furo crítico da anon key)' END
UNION ALL
-- 7) SEGURANÇA: anon NÃO pode executar as RPCs de escrita ───────────
SELECT 7, 'SEGURANCA', 'anon SEM EXECUTE em provisionar_tenant',
       '20260730',
       CASE WHEN has_function_privilege('anon',
              (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='provisionar_tenant' LIMIT 1), 'EXECUTE')
            THEN '❌ anon PODE executar — REVOKE não aplicado'
            ELSE '✅ (anon barrada)' END
UNION ALL
-- 8) MULTI-TENANT: existe usuário `plataforma` (super-admin do SaaS)?
SELECT 8, 'MULTI-TENANT', 'existe usuário role=plataforma (dono do SaaS)',
       'necessário p/ Console',
       CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE role='plataforma')
            THEN '✅' ELSE '⚠️ NENHUM — sem isso não dá pra abrir o Console/criar tenant' END
UNION ALL
-- 9) BLOQUEADOR DO 2º TENANT: PKs/uniques ainda GLOBAIS ──────────────
--    config.key, mesas.numero, categorias_roteamento.categoria colidem
--    quando o 2º tenant reusar a mesma chave. (pendência da 20260724_fase2)
SELECT 9, 'BLOQUEADOR 2º TENANT',
       'config: PK ainda é só (key)?', 'precisa virar (tenant_id,key)',
       CASE WHEN (
         SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
         WHERE i.indrelid='public.config'::regclass AND i.indisprimary
       ) = ARRAY['key']
       THEN '⚠️ SIM — vai colidir no 2º tenant (ver nota do relatório)'
       ELSE '✅ já composta' END
UNION ALL
SELECT 9, 'BLOQUEADOR 2º TENANT',
       'mesas: PK ainda é só (numero)?', 'precisa virar (tenant_id,numero)',
       CASE WHEN (
         SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
         WHERE i.indrelid='public.mesas'::regclass AND i.indisprimary
       ) = ARRAY['numero']
       THEN '⚠️ SIM — vai colidir no 2º tenant'
       ELSE '✅ já composta' END

ORDER BY ordem, tipo, item;
