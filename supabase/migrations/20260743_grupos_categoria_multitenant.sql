-- ══════════════════════════════════════════════════════════════════
-- Isolamento multi-tenant — grupos_categoria + categoria_grupo
-- docs/08_DECISOES/adr-008.md §5/§6 · decisão 002 · fecha pendência
-- registrada em 20260732_grupos_categoria.sql (linhas 16-18)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ A Leva 2 (20260724_fase2) isolou 24 tabelas por tenant. Mas       │
-- │ grupos_categoria e categoria_grupo NASCERAM DEPOIS (20260732) com │
-- │ RLS só por PAPEL (select_auth / write_gerencia) e chaves naturais │
-- │ GLOBAIS — ficaram FORA do isolamento. Com o 2º tenant real (Casa  │
-- │ Coffee) isso é um vazamento: a gerência de um estabelecimento vê  │
-- │ e edita os grupos/mapeamentos do outro, e a chave global colide   │
-- │ (dois tenants não podem ter o grupo 'cafe' nem mapear a mesma      │
-- │ categoria de produto). Esta migration põe as duas no mesmo padrão  │
-- │ das 24: tenant_id + policy RESTRICTIVE + chave composta.          │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ ORDEM DE APLICAÇÃO (importante — mesma janela da pk-composta) ──┐
-- │ Aplique junto do deploy de front deste commit: o upsert de       │
-- │ categoria_grupo passa a usar onConflict "tenant_id,category".    │
-- │ Entre a migration e o deploy, salvar mapeamento de categoria     │
-- │ falha (a PK antiga (category) deixou de existir). Faça os dois    │
-- │ juntos, fora de operação. O SELECT do bootstrap continua ok — a   │
-- │ RLS só passa a filtrar por tenant (transparente com 1 tenant).   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PRÉ-REQUISITOS: Leva 1/2 aplicadas (tenants, tenant_atual_id(),
-- is_super_admin(); usuários já com tenant_id no JWT — isolamento em
-- produção desde a fase 2, ninguém precisa relogar).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, backfill com guarda WHERE,
-- troca de chave só se ainda for a antiga, DROP POLICY IF EXISTS.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. tenant_id + backfill + DEFAULT dinâmico + NOT NULL + RLS ─────
-- Mesmo bloco da fase2 (20260724), aplicado às 2 tabelas que faltaram.
DO $$
DECLARE
  t text;
  v_tenant_atual constant text :=
    '(SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)';
  tabelas text[] := ARRAY['grupos_categoria', 'categoria_grupo'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe — pulando.', t;
      CONTINUE;
    END IF;

    -- coluna tenant_id (NULLABLE → backfill → NOT NULL)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)',
      t
    );
    -- backfill: toda linha existente é do tenant mais antigo (GastroMundi)
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = %s WHERE tenant_id IS NULL',
      t, v_tenant_atual
    );
    -- default resolve o tenant do JWT por requisição; NOT NULL fecha
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id()', t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t
    );

    -- policy RESTRICTIVE de isolamento (soma AND às policies de papel)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
      'USING (tenant_id = public.tenant_atual_id()) '
      'WITH CHECK (tenant_id = public.tenant_atual_id())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- ── 2. grupos_categoria — UNIQUE(nome) → UNIQUE(tenant_id, nome) ────
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  WHERE c.conrelid = 'public.grupos_categoria'::regclass
    AND c.contype = 'u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM unnest(c.conkey) k JOIN pg_attribute a
           ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['nome'];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.grupos_categoria DROP CONSTRAINT %I', v_con);
    RAISE NOTICE 'grupos_categoria: UNIQUE(nome) removida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grupos_categoria_tenant_nome_key'
      AND conrelid = 'public.grupos_categoria'::regclass
  ) THEN
    ALTER TABLE public.grupos_categoria
      ADD CONSTRAINT grupos_categoria_tenant_nome_key UNIQUE (tenant_id, nome);
    RAISE NOTICE 'grupos_categoria: UNIQUE(tenant_id, nome) criada.';
  END IF;
END $$;

-- ── 3. categoria_grupo — PK(category) → PK(tenant_id, category) ─────
DO $$
DECLARE
  v_con  text;
  v_cols text[];
BEGIN
  SELECT c.conname,
         (SELECT array_agg(a.attname::text ORDER BY a.attnum)
          FROM unnest(c.conkey) k JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k)
    INTO v_con, v_cols
  FROM pg_constraint c
  WHERE c.conrelid = 'public.categoria_grupo'::regclass AND c.contype = 'p';

  IF v_cols = ARRAY['category'] THEN
    EXECUTE format('ALTER TABLE public.categoria_grupo DROP CONSTRAINT %I', v_con);
    ALTER TABLE public.categoria_grupo ADD PRIMARY KEY (tenant_id, category);
    RAISE NOTICE 'categoria_grupo: PK trocada para (tenant_id, category).';
  ELSE
    RAISE NOTICE 'categoria_grupo: PK já não é (category) — nada a fazer (%).', v_cols;
  END IF;
END $$;

-- ── 4. Semeia os 3 grupos-default por tenant que ainda não os tem ───
-- Antes do isolamento, comida/bebida/cafe eram globais (todos "viam").
-- Isolados, cada tenant precisa dos seus. O backfill acima deu os 3
-- existentes ao GastroMundi; este passo cobre os demais (Casa Coffee e
-- qualquer tenant provisionado antes desta migration). Roda como owner
-- no SQL Editor (bypass de RLS), por isso o tenant_id explícito passa.
INSERT INTO public.grupos_categoria (nome, tenant_id)
SELECT g.nome, t.id
FROM public.tenants t
CROSS JOIN (VALUES ('comida'), ('bebida'), ('cafe')) AS g(nome)
WHERE NOT EXISTS (
  SELECT 1 FROM public.grupos_categoria gc
  WHERE gc.tenant_id = t.id AND gc.nome = g.nome
);

-- ── 5. provisionar_tenant passa a semear os 3 grupos por tenant novo ─
-- Recria a função de 20260741 acrescentando o seed dos grupos-default,
-- para que o próximo estabelecimento já nasça com comida/bebida/cafe
-- (SEM depender de rodar o passo 4 de novo). SECURITY DEFINER roda como
-- owner → o INSERT com tenant_id explícito passa pela RLS. O resto é
-- idêntico a 20260741 (fonte única do slug; só a plataforma provisiona).
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
  VALUES ('comida', v_tenant.id), ('bebida', v_tenant.id), ('cafe', v_tenant.id)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;
