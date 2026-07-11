-- ══════════════════════════════════════════════════════════════════
-- Isolamento Multi-tenant — Fase 1 (S1-1, Leva 1): users.tenant_id,
-- injeção do tenant no JWT e helpers de resolução
-- docs/08_DECISOES/adr-008.md §1, §2, §3 · decisão 028
--
-- Esta leva NÃO isola dado ainda e NÃO troca os wrappers de
-- conveniência (tenant_atual_tem_modulo/assinatura_atual_ativa, que
-- continuam resolvendo "o" tenant por LIMIT 1 — correto enquanto só
-- existe um tenant). Ela só estabelece a base para as Levas seguintes:
--   Leva 2 (20260724): tenant_id + RLS de isolamento nas tabelas operacionais
--   Leva 3 (20260725): troca do corpo dos 2 wrappers para auth.tenant_id()
--   Leva 4 (20260726): papel `plataforma` + impersonation + Console
--
-- ORDEM É SEGURANÇA: a Leva 3 só pode entrar DEPOIS que esta leva
-- estiver aplicada E os usuários tiverem relogado — o `tenant_id` só
-- passa a existir no JWT no próximo login (o hook roda na emissão do
-- token). Trocar os wrappers antes disso faria auth.tenant_id() voltar
-- nulo e quebraria o enforcement de assinatura (Fase 5). Por isso esta
-- leva mantém tudo funcionando exatamente como hoje.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, UPDATE com guarda WHERE, e
-- CREATE OR REPLACE nas funções (mesmo estilo de 20260716-20260722).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. users.tenant_id ─────────────────────────────────────────────
-- Todo usuário operacional pertence a exatamente um tenant. O
-- super-admin `plataforma` (Leva 4) é a exceção: tenant_id nulo, "acima
-- dos estabelecimentos". Nasce NULLABLE; o backfill (passo 2) preenche
-- os existentes e a constraint por papel (passo 3) garante o invariante.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- ── 2. Backfill — todo usuário existente é do único tenant de hoje ──
-- Mesma expressão LIMIT 1 que os wrappers usam hoje (20260717/20260720):
-- coerência com o single-tenant vigente. Guarda WHERE torna reexecutável.
UPDATE public.users
   SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
 WHERE tenant_id IS NULL;

-- ── 3. Invariante tenant_id × papel ────────────────────────────────
-- Impede os dois erros perigosos: (a) um usuário operacional sem tenant
-- (cairia "sem estabelecimento" nas policies de isolamento da Leva 2);
-- (b) um super-admin `plataforma` com tenant_id preenchido (vazaria o
-- papel de plataforma para dentro de um tenant). Depois do backfill,
-- todo usuário atual tem tenant_id e nenhum é `plataforma`, então a
-- constraint já nasce válida. DROP+ADD para ser reexecutável.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_tenant_por_papel;
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_por_papel CHECK (
    (role =  'plataforma' AND tenant_id IS NULL)
    OR
    (role <> 'plataforma' AND tenant_id IS NOT NULL)
  );

-- ── 4. Hook de JWT passa a injetar app_metadata.tenant_id ──────────
-- Mesma função de 20240108_fix_jwt_role_claim.sql, agora lendo também
-- o tenant_id no MESMO SELECT e gravando em app_metadata.tenant_id.
-- INVARIANTE DO PROJETO: papel e tenant vivem em `app_metadata`, NUNCA
-- na raiz `role` do JWT (reservada pelo PostgREST). O super-admin é
-- sinalizado por gastro_role='plataforma' + tenant_id nulo — sem flag
-- redundante.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  claims         jsonb;
  user_role      text;
  user_tenant_id uuid;
BEGIN
  SELECT role, tenant_id
    INTO user_role, user_tenant_id
  FROM public.users
  WHERE auth_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  claims := event -> 'claims';

  -- Papel do app — grava APENAS em app_metadata.gastro_role.
  claims := jsonb_set(
    claims,
    '{app_metadata, gastro_role}',
    to_jsonb(COALESCE(user_role, 'garcom'))
  );

  -- Tenant do usuário — app_metadata.tenant_id. Nulo (JSON null) quando
  -- não houver: usuário `plataforma` ou linha ainda não resolvida.
  claims := jsonb_set(
    claims,
    '{app_metadata, tenant_id}',
    COALESCE(to_jsonb(user_tenant_id::text), 'null'::jsonb)
  );

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- CREATE OR REPLACE preserva privilégios, mas reafirmamos para a
-- migração ser autossuficiente (mesma superfície de 20240108).
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;

-- ── 5. Helpers de resolução: tenant atual e super-admin ────────────
-- Único lugar que decodifica "de qual tenant é a requisição" e "é da
-- plataforma", lendo o claim já injetado — nenhuma policy decodifica o
-- JWT na mão (mesmo papel de auth.uid()/auth.role()).
--
-- NOTA DE SCHEMA: criadas em `public`, não em `auth`. O ADR-008 §3
-- esboçou `auth.tenant_id()`, mas no Supabase gerenciado criar objetos
-- no schema `auth` é desencorajado (pode ser sobrescrito em upgrades da
-- plataforma). Mantemos a MESMA semântica em `public.*`; as policies e
-- wrappers das Levas 2-3 chamam estes nomes. (Vale um ajuste de uma
-- linha no ADR-008 registrando `public.` como o schema efetivo.)
CREATE OR REPLACE FUNCTION public.tenant_atual_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_atual_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'plataforma';
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ── Nota de RLS (painel Supabase) ──────────────────────────────────
-- Nenhuma tabela nova aqui; users já tem RLS. Não é preciso mexer no
-- painel nesta leva. Após aplicar, os usuários precisam RELOGAR para o
-- tenant_id entrar no JWT (pré-requisito das Levas 2-3).
