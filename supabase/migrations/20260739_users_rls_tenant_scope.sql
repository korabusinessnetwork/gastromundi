-- ══════════════════════════════════════════════════════════════════
-- users — isolamento por tenant nas policies de admin (furo multi-tenant)
-- docs/08_DECISOES/adr-008.md §5 · decisão 002/028
--
-- ┌─ O FURO ────────────────────────────────────────────────────────┐
-- │ A Leva 2 (20260724_fase2) isolou 24 tabelas operacionais por      │
-- │ tenant com uma policy RESTRICTIVE (tenant_id = tenant_atual_id()) │
-- │ aplicada num LOOP — mas `users` ficou DE FORA do loop, de         │
-- │ propósito: o super-admin `plataforma` tem tenant_id NULL, e uma   │
-- │ policy restritiva `tenant_id = tenant_atual_id()` faria NULL=NULL │
-- │ → false, trancando o plataforma para fora da própria linha.       │
-- │                                                                    │
-- │ O problema: `users` nunca ganhou o tratamento sob medida. Suas    │
-- │ 4 policies de admin (select/insert/update/delete, definidas em    │
-- │ 20240108) checam SÓ o papel (gastro_role = 'admin') e NUNCA       │
-- │ filtram por tenant. Com 1 só estabelecimento ninguém percebeu;    │
-- │ ao provisionar o 2º tenant, o admin dele passou a ENXERGAR (e     │
-- │ pior, poder EDITAR/EXCLUIR) os usuários de TODOS os tenants.       │
-- │ Sintoma reportado: "nas configurações do 2º tenant aparecem os    │
-- │ usuários do sistema inteiro".                                     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CORREÇÃO ────────────────────────────────────────────────────┐
-- │ Recria as 4 policies de admin somando o filtro de tenant:        │
-- │   gastro_role = 'admin' AND tenant_id = public.tenant_atual_id() │
-- │ Assim o admin só lê/edita/exclui/cria usuários do PRÓPRIO tenant.│
-- │                                                                    │
-- │ A `users_select_self` (20260728) é PRESERVADA: todo autenticado  │
-- │ segue lendo a própria linha por auth_id = auth.uid(). É ela que   │
-- │ mantém o login funcionando para TODOS os papéis — inclusive o     │
-- │ `plataforma` (tenant_id NULL), que não casa com as policies de    │
-- │ admin e gerencia outros tenants via Edge Function (service_role,  │
-- │ que ignora RLS). Nenhum caminho do plataforma depende destas 4.   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- POR QUE PERMISSIVE (e não RESTRICTIVE como a Leva 2): as policies de
-- users são PERMISSIVAS e se somam via OR (admin-do-tenant OR self). Uma
-- RESTRICTIVE `tenant_id = tenant_atual_id()` global quebraria o
-- self-select do plataforma (NULL=NULL → false). Escopar o tenant DENTRO
-- da policy de admin resolve o vazamento sem tocar no login de ninguém.
--
-- SEGURANÇA — INSERT/UPDATE (WITH CHECK): o filtro no WITH CHECK impede
-- um admin de INJETAR ou MOVER um usuário para outro tenant informando
-- tenant_id explícito. No caminho normal a coluna é omitida e herda o
-- DEFAULT tenant_atual_id() (20260724_users_tenant_id_default) → passa.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE.
-- ══════════════════════════════════════════════════════════════════

-- Expressão de papel (mesmo padrão de 20240108/Leva 2):
--   role_app = auth.jwt() -> 'app_metadata' ->> 'gastro_role'

-- ── SELECT — admin lê usuários do próprio tenant ───────────────────
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
CREATE POLICY "users_select_admin" ON public.users FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── INSERT — admin cria usuário no próprio tenant ──────────────────
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
CREATE POLICY "users_insert_admin" ON public.users FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── UPDATE — admin edita usuário do próprio tenant ─────────────────
-- USING barra a linha-alvo de outro tenant; WITH CHECK impede mover a
-- linha para outro tenant no mesmo UPDATE.
DROP POLICY IF EXISTS "users_update_admin" ON public.users;
CREATE POLICY "users_update_admin" ON public.users FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── DELETE — admin exclui usuário do próprio tenant ────────────────
DROP POLICY IF EXISTS "users_delete_admin" ON public.users;
CREATE POLICY "users_delete_admin" ON public.users FOR DELETE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── Conferência (opcional) — as 4 policies devem citar tenant_id ───
-- Cada linha deve voltar com escopo_tenant = ✅. O filtro pode estar no
-- USING (qual) ou no WITH CHECK — o INSERT só tem WITH CHECK.
SELECT policyname,
       CASE WHEN COALESCE(qual, '')       ILIKE '%tenant_atual_id%'
              OR COALESCE(with_check, '') ILIKE '%tenant_atual_id%'
            THEN '✅' ELSE '❌' END AS escopo_tenant
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'users'
  AND policyname IN ('users_select_admin','users_insert_admin',
                     'users_update_admin','users_delete_admin')
ORDER BY policyname;
