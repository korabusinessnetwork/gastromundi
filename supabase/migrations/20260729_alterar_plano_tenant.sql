-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma (S1-2) — RPC alterar_plano_tenant
-- docs/08_DECISOES/adr-008.md §7 · decisão 027 (plataforma gere planos)
--
-- Segunda peça de ESCRITA do Console. Depois de criar um estabelecimento
-- (provisionar_tenant, 20260727), o super-admin `plataforma` precisa
-- poder mudar o PLANO de um estabelecimento já existente — upgrade ou
-- downgrade. Como os módulos de cada tenant são resolvidos por
-- `tenants.plano_codigo` JOIN `planos_modulos` (20260717/20260725), trocar
-- o plano_codigo do tenant muda na hora os módulos que ele enxerga.
--
-- Por que RPC e não UPDATE direto pelo app: `tenants` não tem policy de
-- UPDATE (ADR-005/008 §7 — escrita só por RPC/migration). Mesma parede do
-- provisionar_tenant: a porta é a guarda interna is_super_admin(), não um
-- GRANT amplo.
--
-- SEGURANÇA (idêntica ao provisionar_tenant):
-- • SECURITY DEFINER para poder escrever em tenants, MAS com guarda
--   is_super_admin() na entrada: sob SECURITY DEFINER o auth.jwt() ainda
--   reflete o CHAMADOR, então um admin de estabelecimento comum que chame
--   isto leva exceção — trocar plano é ação da PLATAFORMA (decisão 027).
-- • Valida entrada antes de escrever (CLAUDE.md): plano precisa existir no
--   catálogo — erro claro em vez de FK cru.
-- • Tenant inexistente → exceção explícita (não silencia um no-op).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- PRÉ-REQUISITOS: is_super_admin() (20260723), planos/planos_modulos
-- (20260717), tenants.plano_codigo (20260717).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.alterar_plano_tenant(
  p_tenant_id    uuid,
  p_plano_codigo text
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants;
BEGIN
  -- ── Autorização: só a plataforma troca plano de tenant ───────────
  -- `IS NOT TRUE` (e não `NOT ...`): is_super_admin() pode devolver NULL
  -- para um token sem o claim gastro_role (ex.: anon key). `NOT NULL` é
  -- NULL, e `IF NULL THEN` NÃO entra no bloco → a exceção seria pulada e
  -- a escrita prosseguiria. `IS NOT TRUE` trata NULL e false igual: barra.
  -- (Além disso, is_super_admin() agora COALESCE→false em 20260730, e o
  -- GRANT abaixo é só para authenticated, com REVOKE de PUBLIC/anon.)
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode alterar o plano de um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.planos WHERE codigo = p_plano_codigo) THEN
    RAISE EXCEPTION 'Plano inválido: %', p_plano_codigo
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ── Troca do plano ───────────────────────────────────────────────
  UPDATE public.tenants
     SET plano_codigo = p_plano_codigo
   WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_tenant;
END;
$$;

-- EXECUTE só para authenticated. REVOKE explícito de PUBLIC/anon porque o
-- CREATE FUNCTION do Postgres concede EXECUTE a PUBLIC por padrão — sem o
-- REVOKE, a anon key (role `anon`) alcançaria a RPC (defesa em profundidade
-- além da guarda is_super_admin).
REVOKE EXECUTE ON FUNCTION public.alterar_plano_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_plano_tenant(uuid, text) TO authenticated;
