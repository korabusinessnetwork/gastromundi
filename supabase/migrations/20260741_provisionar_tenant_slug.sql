-- ══════════════════════════════════════════════════════════════════
-- provisionar_tenant — agora grava o `slug` do tenant (login por subdomínio)
-- docs/08_DECISOES/adr-008.md · complementa 20260740 · substitui 20260730 §B
--
-- Por quê: a 20260740 tornou tenants.slug NOT NULL. A versão anterior de
-- provisionar_tenant fazia INSERT (nome, plano_codigo, tema) SEM slug →
-- passaria a violar o NOT NULL. Esta recria a função gravando o slug.
--
-- Onde nasce o slug: centralizado AQUI (fonte única). Se o chamador manda
-- p_slug, normaliza; senão deriva do nome (sem acento, só a-z0-9). Garante
-- unicidade acrescentando sufixo numérico (casacoffee, casacoffee2, …). O
-- slug é o rótulo do subdomínio E do namespace de e-mail do Auth.
--
-- Assinatura NOVA (p_slug como 2º parâmetro, DEFAULT NULL): a antiga
-- (text,text,jsonb) é derrubada para não haver overload ambíguo. A Edge
-- Function passa p_slug por nome; chamadas sem slug seguem funcionando.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. Idempotente (CREATE OR REPLACE).
-- ══════════════════════════════════════════════════════════════════

-- Deriva um slug DNS-safe a partir de um texto (nome ou slug pedido).
-- Sem acento, minúsculo, só [a-z0-9]. Retorna NULL se sobrar vazio.
CREATE OR REPLACE FUNCTION public.slugify_tenant(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(
    regexp_replace(
      lower(translate(coalesce(p_texto, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn')),
      '[^a-z0-9]+', '', 'g'),
    '');
$$;

-- Derruba a assinatura antiga (3 args) para evitar overload ambíguo.
DROP FUNCTION IF EXISTS public.provisionar_tenant(text, text, jsonb);

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
  -- Autorização: só a plataforma provisiona (mesma guarda da 20260730).
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

  -- Slug: usa o pedido (normalizado) ou deriva do nome; fallback 'tenant'.
  v_slug_base := coalesce(public.slugify_tenant(p_slug),
                          public.slugify_tenant(v_nome),
                          'tenant');
  v_slug := v_slug_base;
  -- Garante unicidade: casacoffee, casacoffee2, casacoffee3, …
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_slug_base || v_n::text;
  END LOOP;

  INSERT INTO public.tenants (nome, slug, plano_codigo, tema)
  VALUES (v_nome, v_slug, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

-- Acesso: só authenticated (a função reconfirma plataforma pelo JWT).
REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;
