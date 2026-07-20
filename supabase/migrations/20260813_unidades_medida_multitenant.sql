-- ══════════════════════════════════════════════════════════════════
-- Isolamento multi-tenant — unidades_medida  (auditoria R1)
-- decisão 002 · decisão 017 (white-label) · ADR-008 §5/§6
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ unidades_medida nasceu (20240103) SEM tenant_id e com RLS só por  │
-- │ papel (unidades_select_auth / unidades_write_admin, 20240107/08). │
-- │ Ficou FORA do isolamento da fase 2. Com o 2º tenant real isso é    │
-- │ vazamento: o admin de um estabelecimento vê e edita as unidades    │
-- │ do outro, e a lista de unidades é global (uma unidade criada por   │
-- │ um cliente aparece para todos). Esta migration põe a tabela no      │
-- │ mesmo padrão das demais: tenant_id + policy RESTRICTIVE + re-seed  │
-- │ das unidades-default por tenant.                                   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PRÉ-REQUISITOS: Leva 1/2 aplicadas (tenants, tenant_atual_id()).
-- A UI (ConfiguracoesView → Unidades de Medida) faz insert SEM tenant_id;
-- o DEFAULT tenant_atual_id() resolve o tenant do JWT — nada muda no front.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, backfill com guarda, DROP POLICY
-- IF EXISTS, re-seed com NOT EXISTS.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. RLS: policy nova criada aqui.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. tenant_id + backfill + DEFAULT dinâmico + NOT NULL + RLS ─────
DO $$
DECLARE
  v_tenant_atual constant text :=
    '(SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)';
BEGIN
  IF to_regclass('public.unidades_medida') IS NULL THEN
    RAISE NOTICE 'Tabela public.unidades_medida não existe — pulando.';
    RETURN;
  END IF;

  -- coluna tenant_id (NULLABLE → backfill → NOT NULL)
  ALTER TABLE public.unidades_medida
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  -- backfill: toda linha existente é do tenant mais antigo (GastroMundi)
  EXECUTE format(
    'UPDATE public.unidades_medida SET tenant_id = %s WHERE tenant_id IS NULL',
    v_tenant_atual
  );
  -- default resolve o tenant do JWT por requisição; NOT NULL fecha
  ALTER TABLE public.unidades_medida
    ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
  ALTER TABLE public.unidades_medida
    ALTER COLUMN tenant_id SET NOT NULL;

  -- policy RESTRICTIVE de isolamento (soma AND às policies de papel)
  DROP POLICY IF EXISTS unidades_medida_tenant_isolation ON public.unidades_medida;
  CREATE POLICY unidades_medida_tenant_isolation ON public.unidades_medida
    AS RESTRICTIVE FOR ALL
    USING (tenant_id = public.tenant_atual_id())
    WITH CHECK (tenant_id = public.tenant_atual_id());
END $$;

-- ── 2. Re-seed das unidades-default por tenant que ainda não as tem ──
-- Antes do isolamento, as ~24 unidades eram globais (todos "viam"). O
-- backfill acima deu as existentes ao tenant mais antigo; este passo
-- cobre os demais tenants (provisionados antes desta migration). Guarda
-- por (tenant_id, tipo, nome, abreviacao) para não duplicar em reexecução.
-- Roda como owner no SQL Editor (bypass de RLS), por isso o tenant_id
-- explícito passa.
INSERT INTO public.unidades_medida (nome, abreviacao, tipo, ordem, tenant_id)
SELECT d.nome, d.abreviacao, d.tipo, d.ordem, t.id
FROM public.tenants t
CROSS JOIN (VALUES
  -- Estoque
  ('Unidade',    'un',       'estoque', 1),
  ('Quilograma', 'kg',       'estoque', 2),
  ('Grama',      'g',        'estoque', 3),
  ('Litro',      'L',        'estoque', 4),
  ('Mililitro',  'ml',       'estoque', 5),
  ('Caixa',      'cx',       'estoque', 6),
  ('Pacote',     'pct',      'estoque', 7),
  ('Dúzia',      'dt',       'estoque', 8),
  -- Compra
  ('Caixa',      'Caixa',    'compra',  1),
  ('Fardo',      'Fardo',    'compra',  2),
  ('Saca',       'Saca',     'compra',  3),
  ('Pacote',     'Pacote',   'compra',  4),
  ('Lata',       'Lata',     'compra',  5),
  ('Garrafa',    'Garrafa',  'compra',  6),
  ('Galão',      'Galão',    'compra',  7),
  ('Unidade',    'Unidade',  'compra',  8),
  -- Consumo
  ('Unidade',    'un',       'consumo', 1),
  ('Mililitro',  'ml',       'consumo', 2),
  ('Grama',      'g',        'consumo', 3),
  ('Fatia',      'fatia',    'consumo', 4),
  ('Dose',       'dose',     'consumo', 5),
  ('Copo',       'copo',     'consumo', 6),
  ('Prato',      'prato',    'consumo', 7),
  ('Porção',     'porção',   'consumo', 8)
) AS d(nome, abreviacao, tipo, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM public.unidades_medida um
  WHERE um.tenant_id = t.id
    AND um.tipo = d.tipo
    AND um.nome = d.nome
    AND um.abreviacao = d.abreviacao
);
