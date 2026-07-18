-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC alterar_layout_tenant
-- Sistema de layouts (src/layouts) · ADR-007 (tema) · ADR-008 §7
--
-- Terceira peça de ESCRITA do Console. O super-admin `plataforma`
-- escolhe o LAYOUT de aparência de um estabelecimento (menu no card do
-- Console). O layout é salvo em `tenants.tema.layout` (jsonb) — chave
-- interpretada só pelo motor de layouts do front (src/layouts); a lista
-- fechada de tokens do tema (gerarVariaveisTema) a ignora, então nunca
-- vira CSS arbitrário.
--
-- Por que RPC e não UPDATE direto pelo app: `tenants` não tem policy de
-- UPDATE (ADR-005/008 §7 — escrita só por RPC/migration). Mesma parede
-- do alterar_plano_tenant (20260729).
--
-- Ao trocar o layout, os OVERRIDES de paleta antigos do tema são
-- removidos (accent/bg/card/…/fontes): eles ficariam POR CIMA do layout
-- novo e mascarariam a escolha — o super-admin escolheria "Casa Coffee"
-- e nada mudaria na tela. Identidade não-visual é preservada
-- (nome_exibicao, logo_url e demais chaves ficam intactas).
--
-- SEGURANÇA (idêntica ao alterar_plano_tenant):
-- • SECURITY DEFINER com guarda is_super_admin() IS NOT TRUE na entrada
--   (trata NULL e false igual: barra — ver 20260729 para o racional).
-- • Valida o layout contra a lista fechada de códigos do catálogo —
--   nunca grava um valor arbitrário vindo do cliente.
-- • REVOKE de PUBLIC/anon + GRANT só a authenticated (defesa em
--   profundidade além da guarda).
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723), tenants.tema (Fase 1).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.alterar_layout_tenant(
  p_tenant_id uuid,
  p_layout    text
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants;
BEGIN
  -- ── Autorização: só a plataforma troca layout de tenant ──────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode alterar o layout de um estabelecimento.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lista fechada = catálogo de src/layouts/index.js. Ao criar um
  -- layout novo no front, adicionar o código aqui também.
  IF p_layout IS NULL
     OR p_layout <> ALL (ARRAY['padrao','claro','escuro','marca','noturno','casa']) THEN
    RAISE EXCEPTION 'Layout inválido: %', coalesce(p_layout, '(nulo)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Troca do layout ──────────────────────────────────────────────
  -- Remove os overrides de PALETA (ficariam por cima do layout novo e
  -- o mascarariam) e grava o código. nome_exibicao/logo_url e chaves
  -- desconhecidas são preservadas.
  UPDATE public.tenants
     SET tema = (coalesce(tema, '{}'::jsonb)
                  - 'accent' - 'alow' - 'bg' - 'card' - 'surface' - 'border'
                  - 'green' - 'red' - 'blue' - 'text' - 'muted' - 'faint'
                  - 'font_titulo' - 'font_texto')
                || jsonb_build_object('layout', p_layout)
   WHERE id = p_tenant_id
  RETURNING * INTO v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.alterar_layout_tenant(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_layout_tenant(uuid, text) TO authenticated;
