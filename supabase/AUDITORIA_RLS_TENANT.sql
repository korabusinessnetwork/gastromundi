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

-- ── 1) Policies em tabelas que TÊM tenant_id, classificadas por escopo
WITH tabelas_com_tenant AS (
  SELECT DISTINCT c.relname AS tabela
  FROM pg_attribute a
  JOIN pg_class     c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND a.attname = 'tenant_id'
    AND a.attnum > 0
    AND NOT a.attisdropped
)
SELECT
  p.tablename,
  p.policyname,
  p.cmd,
  CASE
    WHEN COALESCE(p.qual,'')       ILIKE '%tenant_atual_id%'
      OR COALESCE(p.with_check,'') ILIKE '%tenant_atual_id%' THEN '✅ tenant'
    WHEN COALESCE(p.qual,'')       ILIKE '%auth.uid()%'      THEN '✅ self'
    WHEN COALESCE(p.qual,'')       ILIKE '%is_super_admin%'
      OR COALESCE(p.with_check,'') ILIKE '%is_super_admin%'  THEN '✅ super-admin'
    ELSE '❌ SEM filtro de tenant'
  END AS escopo
FROM pg_policies p
JOIN tabelas_com_tenant t ON t.tabela = p.tablename
ORDER BY escopo, p.tablename, p.policyname;

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
