-- ══════════════════════════════════════════════════════════════════
-- Isolamento Multi-tenant — Fase 1/2 (S1-1 fim + base do S1-2, Leva 4):
-- isola as 4 tabelas de BILLING/IDENTIDADE por tenant e abre o ramo
-- `OR is_super_admin()` (leitura cross-tenant do Console)
-- docs/08_DECISOES/adr-008.md §5, §7 · decisão 002 · decisão 027
--
-- POR QUE ESTA LEVA EXISTE — a Leva 2 (20260724) isolou as 24 tabelas
-- OPERACIONAIS, mas deixou DE FORA, de propósito, 4 tabelas de billing/
-- identidade, porque elas precisam de tratamento especial (leitura do
-- super-admin da plataforma). Enquanto não tratadas, as policies delas
-- eram de ANTES do multi-tenant e VAZAVAM entre tenants:
--   • tenants                  — USING (auth.role()='authenticated')
--     → qualquer logado via TODOS os tenants (nome/tema de todos).
--   • assinaturas              — idem → assinatura de todos os tenants.
--   • assinaturas_pagamentos   — USING (role IN gerente/admin), SEM
--     filtro de tenant → gerente/admin via pagamento de TODOS. (E ainda
--     usava a raiz `role`, contra a invariante do projeto — corrigido
--     aqui para app_metadata.gastro_role.)
--   • tenant_addons            — USING (authenticated) → addons de todos.
-- Nada disso é dado operacional (esse já está isolado pela Leva 2), mas
-- é METADADO de billing/identidade que um 2º tenant não pode ver do 1º.
-- Esta leva fecha esse buraco.
--
-- DESENHO (ADR-008 §5 decisão v2 nº 2, §7): estas 4 tabelas isolam pela
-- PRÓPRIA policy permissiva (não pela RESTRICTIVE genérica da Leva 2),
-- com o ramo `OR public.is_super_admin()` — o ÚNICO lugar onde o super-
-- admin `plataforma` lê dado de todos os tenants. O dado OPERACIONAL
-- (Leva 2) continua SEM esse `OR` (super-admin só o acessa por
-- impersonation/escopo explícito), contendo o raio de um token vazado.
--
-- ┌─ SEGURANÇA DO BOOTSTRAP (por que não quebra o login) ────────────┐
-- │ O front lê estas 4 tabelas SÓ depois do login, com o JWT já       │
-- │ carregando tenant_id (todos relogaram nas Levas 1-2):             │
-- │  • buscarTenantAtual() → .limit(1): com a policy nova o usuário   │
-- │    só enxerga o próprio tenant, então limit(1) devolve ELE.       │
-- │  • buscarAssinaturaAtual(id)/buscarAddonsAtivos(id): já filtram   │
-- │    por tenant_id → a policy nova só reforça o que já filtravam.   │
-- │ Um `plataforma` (tenant_id NULL) cai no ramo is_super_admin() e   │
-- │ vê todos — comportamento desejado para o Console.                 │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Também corrige o 3º wrapper single-tenant esquecido nas Fases 2-5:
-- tenant_atual_tem_addon(p_addon) ainda resolvia o tenant por LIMIT 1
-- (mesmo drift das Levas 3). Passa a resolver por tenant_atual_id().
-- Relevante já: o cliente de RS precisa do add-on `nfe` (NFC-e).
--
-- Idempotente (DROP POLICY IF EXISTS + CREATE; CREATE OR REPLACE
-- FUNCTION). Sem tabela nova → sem ajuste de painel. Não bloqueia
-- escrita: estas tabelas nunca tiveram policy de INSERT/UPDATE/DELETE
-- pelo app (geridas por RPC SECURITY DEFINER / migration) e continuam
-- assim — o Console escreverá por RPC própria (leva seguinte).
--
-- PRÉ-REQUISITOS: Levas 1-3 aplicadas (tenant_atual_id()/is_super_admin()
-- existem e o JWT injeta tenant_id/gastro_role); usuários relogados.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. tenants — vê só o próprio; super-admin vê todos ──────────────
DROP POLICY IF EXISTS "tenants_select_auth" ON public.tenants;
CREATE POLICY "tenants_select_auth"
  ON public.tenants FOR SELECT
  USING (id = public.tenant_atual_id() OR public.is_super_admin());

-- ── 2. assinaturas — a do próprio tenant; super-admin vê todas ──────
DROP POLICY IF EXISTS "assinaturas_select_auth" ON public.assinaturas;
CREATE POLICY "assinaturas_select_auth"
  ON public.assinaturas FOR SELECT
  USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin());

-- ── 3. assinaturas_pagamentos — gerente/admin DO PRÓPRIO tenant, ou
--       super-admin (todos). Corrige também o uso da raiz `role` para
--       a invariante app_metadata.gastro_role. ─────────────────────
DROP POLICY IF EXISTS "assinaturas_pagamentos_select_gerencia" ON public.assinaturas_pagamentos;
CREATE POLICY "assinaturas_pagamentos_select_gerencia"
  ON public.assinaturas_pagamentos FOR SELECT
  USING (
    public.is_super_admin()
    OR (
      (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin')
      AND tenant_id = public.tenant_atual_id()
    )
  );

-- ── 4. tenant_addons — os do próprio tenant; super-admin vê todos ───
DROP POLICY IF EXISTS "tenant_addons_select_auth" ON public.tenant_addons;
CREATE POLICY "tenant_addons_select_auth"
  ON public.tenant_addons FOR SELECT
  USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin());

-- ── 5. 3º wrapper (add-on) resolve o tenant pelo JWT, não por LIMIT 1
CREATE OR REPLACE FUNCTION public.tenant_atual_tem_addon(p_addon text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_addons ta
    WHERE ta.tenant_id = public.tenant_atual_id()
      AND ta.addon_codigo = p_addon
      AND ta.ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_atual_tem_addon(text) TO authenticated;

-- PRÓXIMA LEVA (20260727): provisionar_tenant(...) — RPC SECURITY
-- DEFINER que cria o tenant + plano (o 1º admin do tenant depende da
-- Admin API via Edge Function, fora do SQL) — e a base do Console.
