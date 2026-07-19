-- ══════════════════════════════════════════════════════════════════
-- LEVA 16 — endurecimento das RPCs SECURITY DEFINER (auditoria S1/S4/
-- S6/S9/S15 + REVOKEs de anon que ficaram de fora da 20260730)
--
-- ┌─ OS FUROS (mesma raiz da 20260730) ──────────────────────────────┐
-- │ 1. Guarda que FALHA ABERTO com NULL: `IF claim NOT IN (...)` —    │
-- │    com a anon key o claim é NULL, `NULL NOT IN (...)` = NULL,     │
-- │    `IF NULL` NÃO executa o RAISE → qualquer visitante sem login   │
-- │    passa pela guarda. Atingia baixar_estoque,                     │
-- │    baixar_estoque_subproduto e confirmar_renovacao_assinatura.    │
-- │ 2. CREATE FUNCTION concede EXECUTE a PUBLIC por default: toda     │
-- │    função sem REVOKE explícito é alcançável pela role `anon`.     │
-- │ 3. Sem filtro de tenant: baixar_estoque zerava estoque de QUALQUER│
-- │    tenant; confirmar_renovacao/sincronizar_status aceitavam       │
-- │    p_tenant_id arbitrário (billing cross-tenant);                 │
-- │    limpar_reserva_mesa não tinha guarda NENHUMA (nem role, nem    │
-- │    tenant) e verificar_senha_admin era oráculo de senha de admins │
-- │    de TODOS os tenants, sem rate-limit.                           │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ O PADRÃO (o mesmo da 20260730) ─────────────────────────────────┐
-- │ • Guardas robustas a NULL: `IF NOT COALESCE(cond, false)` — NULL  │
-- │   vira false e o RAISE dispara (fail-closed).                     │
-- │ • Escopo de tenant em toda escrita: `tenant_id =                  │
-- │   public.tenant_atual_id()` (ou vínculo do parâmetro p_tenant_id, │
-- │   com exceção para is_super_admin() onde o Console precisa).      │
-- │ • REVOKE EXECUTE FROM PUBLIC, anon + GRANT TO authenticated em    │
-- │   todas as RPCs de aplicação (defesa em profundidade mesmo nas    │
-- │   que já têm guarda interna).                                     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT são re-aplicáveis;
-- os REVOKEs em lote pulam assinaturas que não existirem no banco.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. baixar_estoque — guarda robusta + FILTRO DE TENANT (S1) ─────
CREATE OR REPLACE FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Fail-closed: claim ausente/NULL (anon, token adulterado) → RAISE.
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
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

-- ── 2. baixar_estoque_subproduto — guarda robusta (já tinha tenant) ─
CREATE OR REPLACE FUNCTION public.baixar_estoque_subproduto(p_subproduto_id uuid, p_qtd numeric)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  RETURN QUERY
  UPDATE public.estoque_subprodutos e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.subproduto_id = p_subproduto_id
     AND e.tenant_id = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

-- ── 3. confirmar_renovacao_assinatura — guarda robusta + vínculo de
--      tenant (S4): gerente/admin só renova o PRÓPRIO tenant; o
--      Console (plataforma) segue renovando qualquer um. ─────────────
CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(
  p_tenant_id      uuid,
  p_competencia    date,
  p_valor          numeric,
  p_metodo         text,
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
  IF public.is_super_admin() IS NOT TRUE THEN
    IF NOT COALESCE(
         (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'),
         false) THEN
      RAISE EXCEPTION 'Sem permissão para confirmar renovação de assinatura.';
    END IF;
    IF p_tenant_id IS DISTINCT FROM public.tenant_atual_id() THEN
      RAISE EXCEPTION 'Sem permissão para operar a assinatura de outro estabelecimento.';
    END IF;
  END IF;

  SELECT ciclo_dias INTO v_ciclo
  FROM public.assinaturas
  WHERE tenant_id = p_tenant_id;

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

-- ── 4. sincronizar_status_assinatura — vínculo de tenant (S15) ─────
--      Recalcula só o cache de status; mesmo assim, tenant só mexe no
--      próprio cache (o Console pode qualquer um).
CREATE OR REPLACE FUNCTION public.sincronizar_status_assinatura(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data_vencimento  date;
  v_carencia_dias    integer;
  v_status_atual     text;
  v_status_calculado text;
BEGIN
  IF public.is_super_admin() IS NOT TRUE
     AND p_tenant_id IS DISTINCT FROM public.tenant_atual_id() THEN
    RAISE EXCEPTION 'Sem permissão para sincronizar a assinatura de outro estabelecimento.';
  END IF;

  SELECT data_vencimento, carencia_dias, status
    INTO v_data_vencimento, v_carencia_dias, v_status_atual
  FROM public.assinaturas
  WHERE tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 'cancelado' é manual — nunca recalculado a partir de datas.
  IF v_status_atual = 'cancelado' THEN
    RETURN v_status_atual;
  END IF;

  v_status_calculado := public.calcular_status_assinatura(v_data_vencimento, v_carencia_dias);

  IF v_status_calculado IS DISTINCT FROM v_status_atual THEN
    UPDATE public.assinaturas SET status = v_status_calculado WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN v_status_calculado;
END;
$$;

-- ── 5. limpar_reserva_mesa — guarda de papel + filtro de tenant (S9) ─
--      Antes: SECURITY DEFINER sem guarda NENHUMA — qualquer chamador
--      (inclusive anon) liberava mesas reservadas de qualquer tenant.
CREATE OR REPLACE FUNCTION public.limpar_reserva_mesa(mesa_numero text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- garcom incluso: fluxos de fechamento operados no salão não podem
  -- travar por causa de uma limpeza de reserva (ação de baixo risco).
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('garcom', 'caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para liberar reserva de mesa.';
  END IF;

  UPDATE public.mesas
     SET status_manual = 'livre',
         updated_at    = now()
   WHERE numero        = mesa_numero
     AND tenant_id     = public.tenant_atual_id()
     AND status_manual = 'reservada';
END;
$$;

-- ── 6. verificar_senha_admin — escopo de tenant + rate-limit (S6) ──
--      Antes: qualquer autenticado (até garçom) testava senhas de
--      admins de TODOS os tenants, sem limite de tentativas.
--      Agora: só valida admins/gerentes do PRÓPRIO tenant e trava em
--      5 FALHAS por minuto por usuário (sucesso zera o contador — o
--      gerente que autoriza várias ações seguidas nunca é bloqueado).

-- Tabela interna de contagem de falhas. RLS ligada SEM policies:
-- nenhum papel do app lê/escreve direto — só esta função (definer).
CREATE TABLE IF NOT EXISTS public.senha_admin_tentativas (
  auth_id       uuid        PRIMARY KEY,
  falhas        integer     NOT NULL DEFAULT 0,
  janela_inicio timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.senha_admin_tentativas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verificar_senha_admin(
  p_password text,
  p_username text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE                 -- era STABLE; agora escreve no contador de falhas
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_ok      boolean := false;
  v_caller  uuid    := auth.uid();
  v_falhas  integer := 0;
  v_inicio  timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;  -- sem sessão não há o que verificar
  END IF;

  IF p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RETURN false;
  END IF;

  -- Rate-limit: 5 falhas por janela de 1 minuto por usuário.
  SELECT falhas, janela_inicio INTO v_falhas, v_inicio
  FROM public.senha_admin_tentativas
  WHERE auth_id = v_caller
  FOR UPDATE;

  IF FOUND AND v_inicio > now() - interval '1 minute' AND v_falhas >= 5 THEN
    RAISE EXCEPTION 'Muitas tentativas de senha. Aguarde um minuto e tente novamente.';
  END IF;

  IF p_username IS NOT NULL THEN
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
    SELECT true INTO v_ok
    FROM public.users pu
    JOIN auth.users au ON au.id = pu.auth_id
    WHERE pu.role     IN ('admin', 'gerente')
      AND pu.active    = true
      AND pu.tenant_id = public.tenant_atual_id()
      AND au.encrypted_password = crypt(p_password, au.encrypted_password)
    LIMIT 1;
  END IF;

  v_ok := COALESCE(v_ok, false);

  IF v_ok THEN
    DELETE FROM public.senha_admin_tentativas WHERE auth_id = v_caller;
  ELSE
    INSERT INTO public.senha_admin_tentativas (auth_id, falhas, janela_inicio)
    VALUES (v_caller, 1, now())
    ON CONFLICT (auth_id) DO UPDATE
      SET falhas        = CASE WHEN public.senha_admin_tentativas.janela_inicio > now() - interval '1 minute'
                               THEN public.senha_admin_tentativas.falhas + 1
                               ELSE 1 END,
          janela_inicio = CASE WHEN public.senha_admin_tentativas.janela_inicio > now() - interval '1 minute'
                               THEN public.senha_admin_tentativas.janela_inicio
                               ELSE now() END;
  END IF;

  RETURN v_ok;
END;
$$;

-- ── 7. REVOKEs em lote — nenhuma RPC de aplicação fica alcançável
--      pela role anon (CREATE FUNCTION concede a PUBLIC por default).
--      tenant_atual_id() / is_super_admin() / branding_por_slug ficam
--      DE FORA de propósito: policies/pré-login dependem delas
--      (mesma decisão da 20260730). Assinaturas ausentes são puladas.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.baixar_estoque(bigint, numeric)',
    'public.baixar_estoque_subproduto(uuid, numeric)',
    'public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)',
    'public.sincronizar_status_assinatura(uuid)',
    'public.limpar_reserva_mesa(text)',
    'public.verificar_senha_admin(text, text)',
    'public.jarvas_resumo_vendas(timestamptz, integer)',
    'public.relatorio_vendas(timestamptz, timestamptz, integer)',
    'public.relatorio_vendas(timestamptz, timestamptz, integer, text)',
    'public.calcular_status_assinatura(date, integer, date)',
    'public.assinatura_ativa(uuid)',
    'public.assinatura_atual_ativa()',
    'public.tenant_tem_modulo(uuid, text)',
    'public.tenant_atual_tem_modulo(text)',
    'public.tenant_atual_tem_addon(text)'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
      RAISE NOTICE 'Hardened: %', fn;
    ELSE
      RAISE NOTICE 'Pulada (não existe neste banco): %', fn;
    END IF;
  END LOOP;
END;
$$;

-- ── Conferência — nenhuma função listada deve ter EXECUTE p/ anon ──
-- Todas as linhas devem voltar com anon_pode_executar = ❌.
SELECT p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN '❌ anon ainda executa' ELSE '✅' END AS anon_bloqueado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('baixar_estoque', 'baixar_estoque_subproduto',
                    'confirmar_renovacao_assinatura', 'sincronizar_status_assinatura',
                    'limpar_reserva_mesa', 'verificar_senha_admin',
                    'jarvas_resumo_vendas', 'relatorio_vendas',
                    'assinatura_ativa', 'assinatura_atual_ativa',
                    'tenant_tem_modulo', 'tenant_atual_tem_modulo',
                    'tenant_atual_tem_addon', 'calcular_status_assinatura')
ORDER BY p.proname;
