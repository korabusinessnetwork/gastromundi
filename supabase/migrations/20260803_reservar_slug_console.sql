-- ══════════════════════════════════════════════════════════════════
-- Slugs RESERVADOS — nenhum tenant pode ocupar 'console' (e afins)
-- Task #18 (Console em subdomínio próprio) · complementa 20260740/20260741
--
-- ┌─ POR QUÊ ───────────────────────────────────────────────────────┐
-- │ O slug do tenant é o rótulo do subdomínio E do namespace de       │
-- │ e-mail do Auth (`${username}@${slug}.local`, ver adr-009/20260740).│
-- │ Se um tenant recebesse o slug 'console', seu subdomínio colidiria  │
-- │ com o host do Console (console.kora.codes) E seus usuários     │
-- │ nasceriam no namespace `@console.local` — o MESMO namespace do     │
-- │ super-admin da plataforma. Isso é exatamente o tipo de vazamento   │
-- │ que a Task #18 precisa impedir. Reservamos o rótulo no BANCO —     │
-- │ camada que nenhum caminho de código (RPC, Edge Function, INSERT    │
-- │ manual) consegue furar.                                            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Isto é defesa-em-profundidade; a fronteira de autorização continua sendo
-- RLS `is_super_admin()` + RPCs SECURITY DEFINER (Levas 4/16). Aqui só
-- garantimos que o ESPAÇO DE NOMES de subdomínio/e-mail fique limpo.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) slug_reservado(text) — rótulos proibidos para tenant ────────
-- IMMUTABLE para poder ser usada em CHECK constraint. Compara já
-- normalizado (minúsculo, sem espaços). Lista: o host do console + os
-- rótulos de infraestrutura/genéricos que nunca devem virar tenant.
CREATE OR REPLACE FUNCTION public.slug_reservado(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(coalesce(p_slug, ''))) IN (
    'console',            -- host do Console da Plataforma (Task #18)
    'www', 'app', 'api',  -- rótulos de infraestrutura/DNS
    'admin', 'painel', 'plataforma', 'sistema', 'kora',
    'auth', 'login', 'static', 'assets', 'cdn', 'mail', 'smtp',
    'ftp', 'ns', 'ns1', 'ns2', 'root', 'suporte', 'status'
  );
$$;

-- ── 2) provisionar_tenant — pular slug reservado ao derivar ────────
-- Recria a função da 20260741 acrescentando a checagem de slug_reservado
-- ao laço de unicidade: um tenant que derivasse 'console' recebe
-- 'console2', 'console3', … — nunca o rótulo reservado. Idempotente.
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
  -- Garante unicidade E evita rótulos reservados: se o base bater com um
  -- slug existente OU com um reservado, acrescenta sufixo numérico
  -- (console → console2, casacoffee → casacoffee2, …).
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug)
        OR public.slug_reservado(v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_slug_base || v_n::text;
  END LOOP;

  INSERT INTO public.tenants (nome, slug, plano_codigo, tema)
  VALUES (v_nome, v_slug, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;

-- ── 3) CHECK no banco — barreira dura contra slug reservado ────────
-- Mesmo um INSERT manual (SQL Editor) ou um caminho de código futuro NÃO
-- consegue gravar um tenant com slug reservado. Se algum tenant ANTIGO já
-- tiver um slug reservado (não deveria — os atuais são 'gastromundi' e o
-- da casa), o ADD falha de propósito: renomeie o slug e rode de novo.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_slug_nao_reservado;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_slug_nao_reservado CHECK (NOT public.slug_reservado(slug));

-- ── 4) Conferência ────────────────────────────────────────────────
-- Nenhuma linha deve retornar aqui (nenhum tenant com slug reservado).
SELECT id, nome, slug
FROM public.tenants
WHERE public.slug_reservado(slug);
