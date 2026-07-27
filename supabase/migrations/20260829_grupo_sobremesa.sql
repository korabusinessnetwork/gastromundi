-- ══════════════════════════════════════════════════════════════════
-- Grupo-default "sobremesa" (Radar de Oportunidades / Palm)
-- decisão 002 (multi-tenant) · segue o padrão de 20260743_grupos_categoria_multitenant
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O Radar de Oportunidades classifica os itens da comanda em grupos │
-- │ (comida/bebida/cafe) para sugerir a venda que falta. A gerência   │
-- │ mapeia cada categoria de produto a um grupo em Configurações →    │
-- │ "Grupos de Categoria". Passamos a avisar TAMBÉM sobre sobremesa   │
-- │ (regra "comida-sem-sobremesa" em src/lib/painelGarcom.js), então  │
-- │ cada tenant precisa do grupo 'sobremesa' disponível para mapear.  │
-- │ Até 20260743 os defaults eram só comida/bebida/cafe; este passo   │
-- │ acrescenta 'sobremesa' aos tenants existentes e faz todo tenant   │
-- │ novo já nascer com ele.                                           │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PRÉ-REQUISITOS: 20260743_grupos_categoria_multitenant aplicada
-- (grupos_categoria já isolada por tenant, com UNIQUE(tenant_id, nome)
-- e provisionar_tenant semeando os 3 grupos-default).
--
-- Idempotente: seed com guarda NOT EXISTS / ON CONFLICT DO NOTHING;
-- a função é CREATE OR REPLACE. Rodar novamente não duplica nada.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor (owner → bypass de RLS, por
-- isso o tenant_id explícito passa).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Semeia 'sobremesa' em todo tenant que ainda não o tem ────────
INSERT INTO public.grupos_categoria (nome, tenant_id)
SELECT 'sobremesa', t.id
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.grupos_categoria gc
  WHERE gc.tenant_id = t.id AND gc.nome = 'sobremesa'
);

-- ── 2. provisionar_tenant passa a semear os 4 grupos por tenant novo ─
-- Recria a função de 20260743 acrescentando 'sobremesa' ao seed dos
-- grupos-default. O restante é idêntico (mesma assinatura, SECURITY
-- DEFINER, guarda is_super_admin, slug único).
CREATE OR REPLACE FUNCTION public.provisionar_tenant(
  p_nome         text,
  p_slug         text  DEFAULT NULL,
  p_plano_codigo text  DEFAULT 'avancado',
  p_tema         jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_slug_base text;
  v_slug      text;
  v_n         int := 1;
  v_tenant    public.tenants;
BEGIN
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

  v_slug_base := coalesce(public.slugify_tenant(p_slug),
                          public.slugify_tenant(v_nome),
                          'tenant');
  v_slug := v_slug_base;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_slug_base || v_n::text;
  END LOOP;

  INSERT INTO public.tenants (nome, slug, plano_codigo, tema)
  VALUES (v_nome, v_slug, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  -- grupos-default do novo tenant (Radar de Oportunidades / Palm)
  INSERT INTO public.grupos_categoria (nome, tenant_id)
  VALUES ('comida',    v_tenant.id),
         ('bebida',    v_tenant.id),
         ('cafe',      v_tenant.id),
         ('sobremesa', v_tenant.id)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;
