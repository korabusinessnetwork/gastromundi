-- ══════════════════════════════════════════════════════════════════
-- Permissões editáveis: por CARGO (por tenant) e por FUNCIONÁRIO
-- decisão 017 (multi-tenant white-label) · decisão 002 (RLS por tenant)
--
-- ┌─ POR QUÊ ───────────────────────────────────────────────────────┐
-- │ Até aqui as permissões vinham 100% do CARGO, hardcoded no        │
-- │ front (src/constants/roles.js): 4 cargos fixos, cada um com um   │
-- │ mapa de ~10 chaves booleanas. Não dava para o estabelecimento    │
-- │ ajustar o que cada cargo enxerga, nem liberar/restringir um      │
-- │ funcionário específico. Como o produto é SaaS white-label        │
-- │ (decisão 017), a matriz de cargos precisa ser CONFIGURÁVEL POR   │
-- │ TENANT, e ainda dá para dar exceções por pessoa.                 │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Esta migração cria as DUAS camadas de persistência:
--
-- 1) users.permissions (jsonb, NULL) — OVERRIDE por funcionário.
--    NULL  = o funcionário segue exatamente o mapa do cargo.
--    objeto = só as chaves que DIFEREM do cargo (parcial). O app mescla
--             cargo ⊕ override, então mudar o cargo depois ainda afeta as
--             chaves não sobrescritas. roles.js segue como fallback.
--
-- 2) role_permissions (tenant_id, role, permissions jsonb) — a MATRIZ do
--    cargo por estabelecimento. Ausência de linha = usa o default do
--    roles.js. Presença = mescla sobre o default (parcial ou completo).
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente.
-- ⚠️ RLS: a tabela role_permissions é NOVA — este arquivo já habilita a
--    RLS e cria as policies (leitura para autenticados do próprio tenant;
--    escrita só admin do tenant). Nada a fazer no painel além de rodar.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) OVERRIDE por funcionário ────────────────────────────────────
-- Coluna nova numa tabela existente (users): herda as policies de users
-- (admin do tenant edita; users_select_self lê a própria linha). Sem
-- policy nova aqui. NULL por padrão = segue o cargo.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions jsonb;

COMMENT ON COLUMN public.users.permissions IS
  'Override de permissões por funcionário (parcial). NULL = segue o mapa do '
  'cargo. Objeto = só as chaves que diferem do cargo; o app mescla cargo ⊕ override.';

-- ── 2) MATRIZ do cargo por tenant ──────────────────────────────────
-- tenant_id herda o DEFAULT public.tenant_atual_id() (mesmo padrão de
-- 20260724_users_tenant_id_default): no caminho normal a coluna é
-- omitida no INSERT e é preenchida com o tenant do JWT.
CREATE TABLE IF NOT EXISTS public.role_permissions (
  tenant_id   uuid        NOT NULL DEFAULT public.tenant_atual_id(),
  role        text        NOT NULL,
  permissions jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role)
);

COMMENT ON TABLE public.role_permissions IS
  'Matriz de permissões por cargo, por estabelecimento (white-label, decisão 017). '
  'Sem linha para um cargo = usa o default do front (roles.js). Com linha = mescla sobre o default.';

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- SELECT — qualquer autenticado lê a matriz do PRÓPRIO tenant (todos os
-- cargos precisam carregar o próprio mapa no login para resolver acesso).
DROP POLICY IF EXISTS "role_permissions_select_tenant" ON public.role_permissions;
CREATE POLICY "role_permissions_select_tenant" ON public.role_permissions FOR SELECT
  USING (tenant_id = public.tenant_atual_id());

-- INSERT — só admin do tenant. WITH CHECK trava injetar em outro tenant.
DROP POLICY IF EXISTS "role_permissions_insert_admin" ON public.role_permissions;
CREATE POLICY "role_permissions_insert_admin" ON public.role_permissions FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- UPDATE — só admin do tenant (USING barra a linha de outro tenant;
-- WITH CHECK impede mover a linha para outro tenant no mesmo UPDATE).
DROP POLICY IF EXISTS "role_permissions_update_admin" ON public.role_permissions;
CREATE POLICY "role_permissions_update_admin" ON public.role_permissions FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- DELETE — só admin do tenant (voltar um cargo ao default do roles.js).
DROP POLICY IF EXISTS "role_permissions_delete_admin" ON public.role_permissions;
CREATE POLICY "role_permissions_delete_admin" ON public.role_permissions FOR DELETE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── Conferência (opcional) — as 4 policies devem citar tenant_id ───
SELECT policyname,
       CASE WHEN COALESCE(qual, '')       ILIKE '%tenant_atual_id%'
              OR COALESCE(with_check, '') ILIKE '%tenant_atual_id%'
            THEN '✅' ELSE '❌' END AS escopo_tenant
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'role_permissions'
ORDER BY policyname;
