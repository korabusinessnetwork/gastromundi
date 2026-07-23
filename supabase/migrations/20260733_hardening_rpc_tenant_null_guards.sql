-- ══════════════════════════════════════════════════════════════════
-- 20260733 — Endurecimento das RPCs SECURITY DEFINER
--            (isolamento por tenant + guarda NULL-safe + REVOKE)
--
-- Contexto: as funções SECURITY DEFINER rodam ignorando a RLS (inclusive
-- a policy RESTRICTIVE `tenant_id = tenant_atual_id()` da Fase 2). Sem
-- filtro de tenant explícito no corpo, um usuário do tenant A conseguia
-- afetar linhas do tenant B (estoque/mesa de outro estabelecimento) —
-- fura o multi-tenancy (decisão 002/017).
--
-- Além disso, a checagem de papel usava a forma
--   (auth.jwt() ... ->> 'gastro_role') NOT IN (...)
-- que, quando o claim é NULL, resulta em NULL (não TRUE) — o IF não
-- dispara e a guarda é IGNORADA. `coalesce(..., '')` fecha esse desvio.
--
-- Por fim, funções SECURITY DEFINER nascem com EXECUTE para PUBLIC;
-- REVOKE FROM PUBLIC, anon garante que só sessão autenticada as chame.
--
-- ⚠️  RLS/GRANTS: aplicar esta migração no painel do Supabase (SQL
--     Editor ou CLI). Ela ajusta apenas corpo de função e grants — não
--     altera policies de tabela.
-- ══════════════════════════════════════════════════════════════════

-- ── baixar_estoque (A1/M2/M8) ─────────────────────────────────────
-- Guarda NULL-safe de papel + escopo de tenant na baixa. Preserva a
-- assinatura em produção: RETURNS TABLE (quantidade, minimo).
CREATE OR REPLACE FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- SECURITY DEFINER contorna a RLS; role E tenant checados explicitamente.
  IF coalesce(auth.jwt() -> 'app_metadata' ->> 'gastro_role', '') NOT IN ('caixa', 'gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  RETURN QUERY
  UPDATE public.estoque e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.produto_id = p_produto_id
     AND e.tenant_id  = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric) TO authenticated;

-- ── limpar_reserva_mesa (A1/M8) ───────────────────────────────────
-- Antes: qualquer autenticado (inclusive garçom) podia zerar a reserva
-- de QUALQUER mesa, de qualquer tenant. Agora: papel de operação de
-- caixa + escopo de tenant.
CREATE OR REPLACE FUNCTION public.limpar_reserva_mesa(mesa_numero text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF coalesce(auth.jwt() -> 'app_metadata' ->> 'gastro_role', '') NOT IN ('caixa', 'gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para limpar reserva de mesa.';
  END IF;

  UPDATE public.mesas
     SET status_manual = 'livre',
         updated_at    = now()
   WHERE numero        = mesa_numero
     AND status_manual = 'reservada'
     AND tenant_id     = public.tenant_atual_id();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_reserva_mesa(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.limpar_reserva_mesa(text) TO authenticated;

-- ── verificar_senha_admin (M8) ────────────────────────────────────
-- SECURITY DEFINER lê public.users ignorando a RLS: sem filtro de
-- tenant, a senha de um admin/gerente de OUTRO estabelecimento validava
-- a ação. Restringe a checagem ao tenant do chamador.
CREATE OR REPLACE FUNCTION public.verificar_senha_admin(
  p_password text,
  p_username text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  -- Rejeita entrada vazia imediatamente
  IF p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RETURN false;
  END IF;

  IF p_username IS NOT NULL THEN
    -- Verifica usuário específico + exige papel admin ou gerente (do tenant atual)
    SELECT (au.encrypted_password = crypt(p_password, au.encrypted_password))
    INTO v_ok
    FROM public.users pu
    JOIN auth.users au ON au.id = pu.auth_id
    WHERE pu.username  = lower(trim(p_username))
      AND pu.active    = true
      AND pu.role     IN ('admin', 'gerente')
      AND pu.tenant_id = public.tenant_atual_id()
    LIMIT 1;
  ELSE
    -- Verifica se qualquer admin/gerente ativo do tenant atual tem essa senha
    SELECT true INTO v_ok
    FROM public.users pu
    JOIN auth.users au ON au.id = pu.auth_id
    WHERE pu.role     IN ('admin', 'gerente')
      AND pu.active    = true
      AND pu.tenant_id = public.tenant_atual_id()
      AND au.encrypted_password = crypt(p_password, au.encrypted_password)
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verificar_senha_admin(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verificar_senha_admin(text, text) TO authenticated;

-- ── confirmar_renovacao_assinatura (M2/M8) ────────────────────────
-- Guarda NULL-safe de papel + REVOKE. O escopo cross-tenant desta
-- função (renovar assinatura de um p_tenant_id arbitrário) é decisão
-- de billing central e fica FORA deste hotfix (ver VARREDURA.md —
-- "exige decisão": isolamento de billing).
CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(
  p_tenant_id uuid,
  p_competencia date,
  p_valor numeric,
  p_metodo text,
  p_confirmado_por text
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ciclo  integer;
  v_result public.assinaturas;
BEGIN
  IF coalesce(auth.jwt() -> 'app_metadata' ->> 'gastro_role', '') NOT IN ('gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar renovação de assinatura.';
  END IF;

  SELECT ciclo_dias INTO v_ciclo FROM public.assinaturas WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada para o tenant %.', p_tenant_id;
  END IF;

  INSERT INTO public.assinaturas_pagamentos (tenant_id, competencia, valor, metodo, confirmado_por)
  VALUES (p_tenant_id, p_competencia, p_valor, p_metodo, p_confirmado_por);

  UPDATE public.assinaturas
    SET data_vencimento  = data_vencimento + v_ciclo,
        status           = 'ativo',
        ultima_renovacao = current_date
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text) TO authenticated;
