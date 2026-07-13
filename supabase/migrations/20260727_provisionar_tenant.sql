-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma (S1-2) — RPC provisionar_tenant
-- docs/08_DECISOES/adr-008.md §7 · decisão 027 · decisão 017
--
-- Primeira peça de escrita do Console: criar um estabelecimento novo
-- (um tenant). É a operação que efetivamente LIGA o multi-tenant real —
-- até aqui o banco isola por tenant (Levas 1-4), mas só existe um. Esta
-- RPC é como o super-admin `plataforma` cria o 2º, o 3º, etc.
--
-- ┌─ O QUE ESTA RPC FAZ (e o que deliberadamente NÃO faz) ───────────┐
-- │ FAZ, atômico: valida entradas → INSERT em public.tenants (nome,   │
-- │   plano, tema) → devolve o tenant criado.                         │
-- │ NÃO cria o 1º usuário admin do tenant: a credencial vive em       │
-- │   auth.users e só a Admin API do Supabase (service_role, via Edge │
-- │   Function) a cria com segurança — SQL puro não faz isso (mesma   │
-- │   parede do cadastro de usuário). O fluxo completo do Console é:   │
-- │   (1) provisionar_tenant aqui → (2) Edge Function cria o auth +    │
-- │   o public.users (role='admin', tenant_id = o novo) → (3) opcional │
-- │   confirmar_renovacao_assinatura concede a mensalidade.           │
-- │ NÃO cria linha de assinaturas: tenant novo sem assinatura →       │
-- │   assinatura_ativa() = true (trial, não bloqueado, ver 20260720). │
-- │   A cobrança é concedida explicitamente depois — mantém esta RPC  │
-- │   de escopo único e atômico.                                      │
-- └──────────────────────────────────────────────────────────────────┘
--
-- SEGURANÇA:
-- • SECURITY DEFINER (precisa inserir em tenants, que não tem policy de
--   INSERT pelo app — escrita só por RPC/migration, ADR-005/008 §7),
--   MAS com guarda is_super_admin() logo na entrada: sob SECURITY
--   DEFINER o auth.jwt() ainda reflete o CHAMADOR (não o dono da
--   função), então a checagem barra qualquer não-plataforma. Um admin
--   de estabelecimento que chame isto leva exceção, não cria tenant.
-- • Valida entradas antes de escrever (CLAUDE.md): nome não-vazio e
--   plano existente — erro claro em vez de FK/constraint cru.
-- • GRANT para authenticated é seguro: a porta real é a guarda interna,
--   não o GRANT (mesmo padrão de confirmar_renovacao_assinatura).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- PRÉ-REQUISITOS: Levas 1-4 aplicadas (is_super_admin(), planos, tenants
-- com plano_codigo).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provisionar_tenant(
  p_nome         text,
  p_plano_codigo text DEFAULT 'avancado',
  p_tema         jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome   text := btrim(coalesce(p_nome, ''));
  v_tenant public.tenants;
BEGIN
  -- ── Autorização: só a plataforma provisiona ──────────────────────
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas a plataforma pode provisionar estabelecimentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF v_nome = '' THEN
    RAISE EXCEPTION 'O nome do estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.planos WHERE codigo = p_plano_codigo) THEN
    RAISE EXCEPTION 'Plano inválido: %', p_plano_codigo
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── Criação do tenant ────────────────────────────────────────────
  INSERT INTO public.tenants (nome, plano_codigo, tema)
  VALUES (v_nome, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provisionar_tenant(text, text, jsonb) TO authenticated;

-- PRÓXIMA LEVA (20260728): Edge Function que cria o 1º admin do tenant
-- (auth.users + public.users) e a UI do Console (rota React protegida
-- por papel 'plataforma': listar tenants, criar estabelecimento).
