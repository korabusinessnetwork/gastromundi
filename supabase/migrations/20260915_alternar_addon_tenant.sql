-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC alternar_addon_tenant
-- F022 · decisão 019 (add-on pago transversal) · decisão 021 (eixo
-- ortogonal ao plano) · decisão 027 / ADR-008 §7 (quem liga é a
-- PLATAFORMA) · 5ª peça de ESCRITA do Console.
--
-- O QUE ESTAVA FURADO
-- `public.tenant_addons` existe desde a 20260718 e o app inteiro já
-- respeita o flag (fail-CLOSED: `addonHabilitado`, AppContext) — mas a
-- tabela NUNCA teve policy de escrita, e a própria 20260718 registrou
-- que "uma tela de administração para isso fica para quando F017/F019
-- entrarem em desenvolvimento". Resultado: habilitar NF-e ou TEF para
-- um cliente era um INSERT cru no SQL Editor. Vender um add-on pago
-- dependendo de alguém acertar um INSERT à mão é o tipo de operação que
-- erra em silêncio (tenant_id trocado liga o add-on do cliente errado).
--
-- Esta RPC é a ÚNICA via de escrita de `tenant_addons` — mesmo desenho
-- de alterar_plano_tenant (20260729), alterar_layout_tenant (20260801) e
-- definir_mensalidade_tenant (20260911).
--
-- LIGAR x DESLIGAR
-- Ligar faz INSERT … ON CONFLICT DO UPDATE (cria ou reativa) e carimba
-- `ativado_em = now()`. Desligar mantém a linha com `ativo = false` e
-- PRESERVA `ativado_em`: apagar a linha jogaria fora o registro de que
-- aquele estabelecimento já contratou o add-on um dia — informação de
-- billing, não lixo.
--
-- SEGURANÇA:
-- • SECURITY DEFINER + SET search_path = public.
-- • Guarda `is_super_admin() IS NOT TRUE` na entrada (NULL barra igual —
--   ver 20260730). O admin do estabelecimento NUNCA liga o próprio
--   add-on pago: ele é contratado com a plataforma (decisão 027).
-- • Valida tenant e código de add-on contra os catálogos antes de gravar.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated (nessa ordem: o
--   REVOKE depois tiraria de authenticated também).
--
-- ADR-006: add-on tem ciclo de cobrança independente da mensalidade —
-- por isso nada aqui olha `assinaturas`. Estabelecimento vencido pode ter
-- add-on ligado; inadimplência de add-on nunca bloqueia o sistema.
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), addons +
-- tenant_addons (20260718), policy de SELECT por tenant (20260726).
-- RLS: NENHUMA mudança no painel — a leitura já está isolada desde a
-- 20260726 (`tenant_id = tenant_atual_id() OR is_super_admin()`) e a
-- escrita continua sem policy, só por esta RPC.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.alternar_addon_tenant(
  p_tenant_id    uuid,
  p_addon_codigo text,
  p_ativo        boolean
)
RETURNS public.tenant_addons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_linha  public.tenant_addons;
BEGIN
  -- ── Autorização: só a plataforma liga/desliga add-on ─────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode ligar ou desligar um add-on.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_codigo := nullif(btrim(coalesce(p_addon_codigo, '')), '');
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'O add-on é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Sem isto, um p_ativo NULL cairia no NOT NULL da coluna e o cliente
  -- receberia um erro de banco cru em vez de uma frase.
  IF p_ativo IS NULL THEN
    RAISE EXCEPTION 'É preciso dizer se o add-on fica ligado ou desligado.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A FK já recusaria no INSERT, mas o erro sairia como violação de
  -- chave estrangeira — ilegível na tela. Checar aqui dá a frase certa.
  IF NOT EXISTS (SELECT 1 FROM public.addons WHERE codigo = v_codigo) THEN
    RAISE EXCEPTION 'Add-on não existe no catálogo: %', v_codigo
      USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Escrita ──────────────────────────────────────────────────────
  -- ON CONFLICT torna a operação idempotente: dois cliques seguidos (ou
  -- duas abas do Console) gravam o mesmo estado final, sem erro de PK.
  INSERT INTO public.tenant_addons (tenant_id, addon_codigo, ativo, ativado_em)
  VALUES (p_tenant_id, v_codigo, p_ativo, now())
  ON CONFLICT (tenant_id, addon_codigo) DO UPDATE
    SET ativo = EXCLUDED.ativo,
        -- Só o LIGAR recarimba a data; desligar preserva quando foi
        -- contratado da primeira vez.
        ativado_em = CASE WHEN EXCLUDED.ativo
                          THEN now()
                          ELSE tenant_addons.ativado_em END
  RETURNING * INTO v_linha;

  RETURN v_linha;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.alternar_addon_tenant(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alternar_addon_tenant(uuid, text, boolean) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- Também informa quantos add-ons estão ligados na base hoje.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid     oid;
  v_def     text;
  v_cfg     text[];
  v_ligados integer;
BEGIN
  v_oid := to_regprocedure('public.alternar_addon_tenant(uuid, text, boolean)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'alternar_addon_tenant(uuid, text, boolean) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'alternar_addon_tenant precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'alternar_addon_tenant ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'alternar_addon_tenant sem a guarda is_super_admin().';
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Se ele falhar, qualquer visitante do site poderia chamar.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar alternar_addon_tenant.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar alternar_addon_tenant.';
  END IF;

  SELECT count(*) INTO v_ligados FROM public.tenant_addons WHERE ativo = true;

  RAISE NOTICE 'alternar_addon_tenant instalada. Add-ons ligados na base hoje: %. Ligue/desligue pelo botão "Add-ons" do card de cada estabelecimento no Console.', v_ligados;
END $conf$;
