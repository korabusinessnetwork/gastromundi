-- ══════════════════════════════════════════════════════════════════
-- AUDITORIA DE ISOLAMENTO POR TENANT (read-only) — 2026-07
-- Cole no SQL Editor do Supabase e rode. NÃO altera nada.
--
-- Objetivo: achar qualquer policy PERMISSIVA que dê acesso amplo a uma
-- tabela que TEM tenant_id SEM filtrar por tenant — o mesmo padrão de
-- furo que a tabela `users` tinha (corrigido na 20260739).
--
-- Como ler o resultado da 1ª query (escopo por policy):
--   ✅ tenant       → USING/CHECK cita tenant_atual_id  (isola por tenant)
--   ✅ self         → USING cita auth.uid()             (só a própria linha)
--   ✅ super-admin  → USING cita is_super_admin()       (acesso de plataforma)
--   ❌ SEM filtro   → tabela tem tenant_id mas a policy é ampla e não
--                     filtra por tenant → POTENCIAL VAZAMENTO, investigar.
--
-- Uma tabela pode ter várias policies permissivas (somam via OR). Uma
-- linha ❌ só é problema se a policy conceder acesso AMPLO (por papel /
-- authenticated). Policies "self" e "super-admin" ❌ não aparecem porque
-- são reconhecidas acima.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) TESTE DEFINITIVO — tabelas com tenant_id SEM clamp restritivo ─
-- IMPORTANTE (semântica RLS do Postgres): PERMISSIVE somam com OR;
-- RESTRICTIVE somam com AND por cima de tudo. A Leva 2 (20260724)
-- criou, em cada tabela operacional, uma policy `AS RESTRICTIVE FOR ALL
-- USING (tenant_id = tenant_atual_id())`. Logo, TODAS as policies de
-- papel/assinatura daquela tabela ficam ANDadas com o filtro de tenant —
-- NÃO precisam filtrar tenant individualmente. Portanto o único jeito
-- correto de achar exposição é procurar tabela com tenant_id que NÃO
-- tenha essa policy RESTRICTIVE — e não olhar policy por policy (isso
-- daria falso positivo em toda permissiva de papel).
--
-- Esperado: todas as operacionais '✅ clamp restritivo por tenant'. A
-- ÚNICA '⚠️ SEM restritivo' legítima é `users` (isolada à parte: 4
-- policies de admin filtram por tenant + users_select_self; sem
-- restritiva porque o super-admin plataforma tem tenant_id NULL e uma
-- restritiva o trancaria da própria linha). Qualquer OUTRA tabela em
-- '⚠️' é exposição real — investigar.
WITH tabelas_com_tenant AS (
  SELECT DISTINCT c.relname AS tabela
  FROM pg_attribute a
  JOIN pg_class     c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND a.attname = 'tenant_id'
    AND a.attnum > 0
    AND NOT a.attisdropped
),
isolamento_restritivo AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'RESTRICTIVE'
    AND COALESCE(qual,'') ILIKE '%tenant_atual_id%'
)
SELECT t.tabela,
       CASE WHEN i.tablename IS NOT NULL THEN '✅ clamp restritivo por tenant'
            ELSE '⚠️ SEM restritivo — checar caso a caso' END AS veredito
FROM tabelas_com_tenant t
LEFT JOIN isolamento_restritivo i ON i.tablename = t.tabela
ORDER BY veredito, t.tabela;

-- ── 2) A Leva 4 (20260726) está aplicada? (billing isolado por tenant)
-- As 4 devem voltar '✅ escopo tenant'. Se alguma vier '❌', a 20260726
-- não foi aplicada e o billing daquela tabela vaza entre tenants.
SELECT tablename, policyname,
       CASE WHEN COALESCE(qual,'') ILIKE '%tenant_atual_id%'
             OR COALESCE(qual,'') ILIKE '%is_super_admin%'
            THEN '✅ escopo tenant' ELSE '❌ tenant-cego' END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename, policyname) IN (
    VALUES ('tenants','tenants_select_auth'),
           ('assinaturas','assinaturas_select_auth'),
           ('assinaturas_pagamentos','assinaturas_pagamentos_select_gerencia'),
           ('tenant_addons','tenant_addons_select_auth')
  )
ORDER BY tablename;

-- ── 3) As 4 policies de admin de `users` estão escopadas? (fix 20260739)
SELECT policyname,
       CASE WHEN COALESCE(qual,'')       ILIKE '%tenant_atual_id%'
             OR COALESCE(with_check,'') ILIKE '%tenant_atual_id%'
            THEN '✅' ELSE '❌' END AS escopo_tenant
FROM pg_policies
WHERE schemaname='public' AND tablename='users'
  AND policyname IN ('users_select_admin','users_insert_admin',
                     'users_update_admin','users_delete_admin')
ORDER BY policyname;
