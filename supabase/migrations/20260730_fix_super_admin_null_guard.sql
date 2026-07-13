-- ══════════════════════════════════════════════════════════════════
-- FIX CRÍTICO DE SEGURANÇA — bypass da guarda de super-admin
-- docs/08_DECISOES/adr-008.md §7 · decisão 002/027
--
-- ┌─ O BUG (dois furos que se somam) ────────────────────────────────┐
-- │                                                                   │
-- │ (1) LÓGICA DE TRÊS VALORES — is_super_admin() devolvia NULL, não  │
-- │     false, para um token SEM o claim gastro_role (ex.: a anon     │
-- │     key, que é pública e vai no bundle do front):                 │
-- │        SELECT (jwt -> 'app_metadata' ->> 'gastro_role')='plataforma'│
-- │     Sem o claim, `->> 'gastro_role'` é NULL e `NULL = 'plataforma'`│
-- │     é NULL. As RPCs guardavam com `IF NOT is_super_admin() THEN    │
-- │     RAISE`. `NOT NULL` é NULL, e `IF NULL THEN` NÃO executa o      │
-- │     bloco → a exceção era PULADA e a escrita prosseguia.          │
-- │                                                                   │
-- │ (2) GRANT IMPLÍCITO A PUBLIC — CREATE FUNCTION no Postgres concede │
-- │     EXECUTE a PUBLIC por padrão. As migrations só faziam           │
-- │     GRANT ... TO authenticated (redundante) e nunca REVOGAVAM      │
-- │     PUBLIC → o role `anon` (anon key) alcançava as RPCs de escrita.│
-- │                                                                   │
-- │ Juntos: qualquer um com a anon key (pública!) podia criar tenants  │
-- │ e trocar o plano de qualquer estabelecimento. Confirmado empírica- │
-- │ mente (tenant __probe__ criado só com a anon key).                │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ O FIX (defesa em profundidade) ─────────────────────────────────┐
-- │ A. is_super_admin() passa a COALESCE(..., false) — nunca devolve  │
-- │    NULL. Conserta a RAIZ: toda guarda que a usa vira segura de uma │
-- │    vez (provisionar_tenant, alterar_plano_tenant e qualquer futura)│
-- │ B. provisionar_tenant recriada com guarda `IS NOT TRUE` (robusta   │
-- │    a NULL mesmo que a função regrida um dia).                      │
-- │ C. REVOKE EXECUTE ... FROM PUBLIC, anon nas DUAS RPCs de escrita;  │
-- │    EXECUTE só para authenticated. Assim `anon` nem alcança a RPC.  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- POR QUE is_super_admin() NÃO é revogada de PUBLIC/anon: as policies de
-- RLS de `tenants` (Leva 4) chamam `... OR is_super_admin()` e são
-- avaliadas no contexto do role que consulta. Tirar o EXECUTE de anon
-- quebraria leituras. O COALESCE já a torna segura (devolve false, nunca
-- NULL) — o endurecimento de acesso vale só para as RPCs de ESCRITA.
--
-- URGÊNCIA: provisionar_tenant já está DEPLOYADO e explorável. Esta
-- migration deve ser aplicada no Supabase ANTES de qualquer outra coisa.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT reexecutáveis.
-- ══════════════════════════════════════════════════════════════════

-- ── A. Raiz: is_super_admin() nunca mais devolve NULL ──────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'plataforma', false);
$$;

-- is_super_admin() SEGUE executável amplamente (policies de tenants a
-- chamam no contexto do chamador). Reafirma o GRANT para authenticated;
-- não revoga de PUBLIC de propósito (ver cabeçalho).
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ── B. provisionar_tenant: guarda robusta a NULL ───────────────────
-- Recria idêntica à 20260727, trocando só `IF NOT ...` por
-- `IF ... IS NOT TRUE` (belt-and-suspenders além do COALESCE do item A).
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
  -- Autorização: só a plataforma provisiona. `IS NOT TRUE` trata NULL e
  -- false igual (ver cabeçalho — bug de três valores).
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode provisionar estabelecimentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'O nome do estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.planos WHERE codigo = p_plano_codigo) THEN
    RAISE EXCEPTION 'Plano inválido: %', p_plano_codigo
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.tenants (nome, plano_codigo, tema)
  VALUES (v_nome, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

-- ── C. Fecha o acesso das RPCs de ESCRITA a anon/PUBLIC ────────────
REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.alterar_plano_tenant(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.alterar_plano_tenant(uuid, text) TO authenticated;

-- ── LIMPEZA: remove o tenant __probe__ criado pela exploração ──────
-- Se a auditoria criou um tenant de teste explorando o furo, ele fica
-- órfão (sem admin). Remove só se existir e estiver sem usuários — nunca
-- apaga um tenant real com gente dentro.
DELETE FROM public.tenants t
 WHERE t.nome = '__probe__'
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = t.id);
