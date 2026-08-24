-- ══════════════════════════════════════════════════════════════════
-- Combos com múltiplos produtos — tabela combo_produtos
--
-- Até aqui um combo tinha 1 produto (combos.item_principal_id) + N
-- subprodutos (adicionais, tabela combo_subprodutos). Esta migration
-- permite que um combo agregue OUTROS produtos do catálogo além do
-- principal — ex.: "Hambúrguer (principal) + Coca Zero (produto)".
-- Os subprodutos continuam para acompanhamentos (ex.: cream cheese no
-- croissant); produtos vendáveis do catálogo entram aqui.
--
-- Espelha combo_subprodutos: junção combo↔produto com quantidade e
-- preço customizado opcional (para o combo dar desconto sobre o preço
-- de catálogo). produto_id é BIGINT (products.id é identity global).
--
-- ┌─ PRÉ-REQUISITO ─────────────────────────────────────────────────┐
-- │ Roda depois de 20260724_multitenant_fase2_isolamento.sql (ordem  │
-- │ de arquivo garante). O bloco de tenant abaixo é CONDICIONAL: se   │
-- │ o helper public.tenant_atual_id() já existir (Leva 1/2 aplicadas),│
-- │ a tabela nasce tenant-isolada igual às 24 irmãs; se ainda não     │
-- │ existir, nasce só com a policy permissiva (estado pré-multitenant │
-- │ das tabelas de combo) e ganha tenant_id quando a leva for aplicada│
-- │ — ver nota no fim.                                                │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS antes de
-- CREATE, guardas WHERE no backfill. Reexecutável sem efeito colateral.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS combo_produtos (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id          UUID          NOT NULL REFERENCES combos(id)   ON DELETE CASCADE,
  produto_id        BIGINT        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantidade        INTEGER       NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_customizado NUMERIC(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (combo_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_produtos_combo   ON combo_produtos(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_produtos_produto ON combo_produtos(produto_id);

ALTER TABLE combo_produtos ENABLE ROW LEVEL SECURITY;

-- Policy permissiva base (mesmo padrão de combo_subprodutos). O
-- isolamento REAL por tenant é a RESTRICTIVE adicionada no bloco abaixo.
--
-- ⚠️ SUBSTITUÍDA por 20260923_combo_produtos_isolamento_tenant.sql: esta
-- permissiva libera escrita para qualquer autenticado (o padrão de 20240104,
-- aposentado pelo laço de limpeza de 20240107 — que já tinha passado quando
-- este arquivo nasceu). Se precisar reexecutar esta migration, rode a 20260923
-- logo em seguida, senão a permissiva volta.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combo_produtos' AND policyname = 'allow_all_combo_produtos'
  ) THEN
    CREATE POLICY "allow_all_combo_produtos" ON combo_produtos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Isolamento multi-tenant (condicional à Leva 1/2 já aplicada) ────
-- Replica para combo_produtos exatamente o que 20260724 fez nas 24
-- tabelas: coluna tenant_id (DEFAULT dinâmico via JWT + NOT NULL) e
-- policy RESTRICTIVE por tenant. Como combo_produtos NÃO está na lista
-- daquela migration, o isolamento é responsabilidade desta aqui.
DO $$ BEGIN
  IF to_regprocedure('public.tenant_atual_id()') IS NOT NULL THEN
    -- 1. coluna (nasce nullable p/ ADD instantâneo)
    ALTER TABLE combo_produtos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
    -- 2. backfill de linhas existentes p/ o único tenant de hoje
    UPDATE combo_produtos
       SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
     WHERE tenant_id IS NULL;
    -- 3. DEFAULT dinâmico (resolve tenant do JWT por requisição) + NOT NULL
    ALTER TABLE combo_produtos ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
    ALTER TABLE combo_produtos ALTER COLUMN tenant_id SET NOT NULL;
    -- 4. policy RESTRICTIVE de isolamento (soma AND às demais)
    DROP POLICY IF EXISTS combo_produtos_tenant_isolation ON combo_produtos;
    CREATE POLICY combo_produtos_tenant_isolation ON combo_produtos AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id())
      WITH CHECK (tenant_id = public.tenant_atual_id());
    CREATE INDEX IF NOT EXISTS combo_produtos_tenant_id_idx ON combo_produtos (tenant_id);
  ELSE
    RAISE NOTICE 'public.tenant_atual_id() ausente — combo_produtos criada sem tenant_id. Ao aplicar a Leva multitenant, adicionar tenant_id + policy de isolamento a combo_produtos (não está na lista das 24).';
  END IF;
END $$;

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabela nova com RLS já habilitado e policies criadas aqui. Nenhuma
-- ação no painel é necessária. Se a leva multitenant ainda não tiver
-- rodado, ver o RAISE NOTICE acima.
