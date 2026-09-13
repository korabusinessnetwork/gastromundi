-- ══════════════════════════════════════════════════════════════════
-- Grupos de escolha — produtos com seleção e combos flexíveis
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Duas necessidades convergem numa mesma abstração:                │
-- │                                                                  │
-- │  1. PRODUTO COM SELEÇÃO — um "Refrigerante" no cardápio que na   │
-- │     hora da venda pede qual (Coca, Fanta, Guaraná). Cada opção   │
-- │     é um PRODUTO REAL do catálogo, então estoque e preço saem    │
-- │     do item escolhido.                                           │
-- │                                                                  │
-- │  2. COMBO FLEXÍVEL — "Hambúrguer + Refri" onde o cliente escolhe │
-- │     qualquer hambúrguer e qualquer refri, em vez de um combo com │
-- │     produto principal fixo. O combo passa a ser nome + preço +   │
-- │     grupos de escolha, sem item_principal_id obrigatório.        │
-- │                                                                  │
-- │ Os dois casos são o MESMO conceito: um "grupo de escolha" com N  │
-- │ opções, mínimo e máximo de seleção. O grupo pertence OU a um     │
-- │ produto (produto_id) OU a um combo (combo_id) — nunca aos dois.  │
-- │                                                                  │
-- │ origem='lista'     → as opções são os grupo_escolha_itens.       │
-- │ origem='categoria' → as opções são todos os produtos ativos da   │
-- │                      categoria (campo categoria), resolvido no    │
-- │                      front; grupo_escolha_itens fica vazio.       │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: cria duas tabelas e apenas RELAXA combos.item_principal_id
-- (NOT NULL → nullable) para combos flexíveis nascerem sem principal.
-- Nada é removido. As tabelas subprodutos/combo_subprodutos/
-- estoque_subprodutos e a coluna combos.modo continuam existindo (o
-- front deixa de usá-las, mas o sistema de delivery ainda depende de
-- item_principal_id + combo_produtos — remoção fica para depois).
--
-- ┌─ PRÉ-REQUISITO ─────────────────────────────────────────────────┐
-- │ Roda depois de 20260724_multitenant_fase2_isolamento.sql. Igual  │
-- │ a 20260726_combo_produtos, o bloco de tenant é CONDICIONAL ao    │
-- │ helper public.tenant_atual_id() já existir.                      │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS antes de
-- CREATE, ADD COLUMN IF NOT EXISTS, guardas WHERE no backfill.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. combos.item_principal_id passa a aceitar NULL ───────────────
-- Combo flexível não tem produto principal; é definido só por seus
-- grupos de escolha. DROP NOT NULL é idempotente (reexecutar é no-op).
ALTER TABLE combos ALTER COLUMN item_principal_id DROP NOT NULL;

-- ── 2. grupos_escolha ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grupos_escolha (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id BIGINT  REFERENCES products(id) ON DELETE CASCADE,
  combo_id   UUID    REFERENCES combos(id)   ON DELETE CASCADE,
  nome       TEXT    NOT NULL,
  minimo     INTEGER NOT NULL DEFAULT 1 CHECK (minimo >= 0),
  maximo     INTEGER NOT NULL DEFAULT 1 CHECK (maximo >= 1),
  origem     TEXT    NOT NULL DEFAULT 'lista' CHECK (origem IN ('lista', 'categoria')),
  categoria  TEXT,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- dono exclusivo: OU produto OU combo, nunca os dois nem nenhum
  CONSTRAINT grupos_escolha_dono_unico CHECK (
    (produto_id IS NOT NULL AND combo_id IS NULL)
    OR (produto_id IS NULL AND combo_id IS NOT NULL)
  ),
  CONSTRAINT grupos_escolha_maximo_valido CHECK (maximo >= minimo)
);

CREATE INDEX IF NOT EXISTS idx_grupos_escolha_produto ON grupos_escolha(produto_id);
CREATE INDEX IF NOT EXISTS idx_grupos_escolha_combo   ON grupos_escolha(combo_id);

-- ── 3. grupo_escolha_itens — opções de um grupo origem='lista' ─────
CREATE TABLE IF NOT EXISTS grupo_escolha_itens (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          UUID          NOT NULL REFERENCES grupos_escolha(id) ON DELETE CASCADE,
  produto_id        BIGINT        NOT NULL REFERENCES products(id)       ON DELETE CASCADE,
  preco_customizado NUMERIC(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  ordem             INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_grupo_escolha_itens_grupo   ON grupo_escolha_itens(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_escolha_itens_produto ON grupo_escolha_itens(produto_id);

ALTER TABLE grupos_escolha      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupo_escolha_itens ENABLE ROW LEVEL SECURITY;

-- Policies permissivas base (mesmo padrão de combo_produtos). O
-- isolamento REAL por tenant é a RESTRICTIVE do bloco condicional abaixo.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grupos_escolha' AND policyname = 'allow_all_grupos_escolha'
  ) THEN
    CREATE POLICY "allow_all_grupos_escolha" ON grupos_escolha FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grupo_escolha_itens' AND policyname = 'allow_all_grupo_escolha_itens'
  ) THEN
    CREATE POLICY "allow_all_grupo_escolha_itens" ON grupo_escolha_itens FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 4. Isolamento multi-tenant (condicional à Leva 1/2 já aplicada) ─
-- Replica para as duas tabelas exatamente o que 20260726 fez em
-- combo_produtos: coluna tenant_id (DEFAULT dinâmico via JWT + NOT NULL)
-- e policy RESTRICTIVE por tenant.
DO $$ BEGIN
  IF to_regprocedure('public.tenant_atual_id()') IS NOT NULL THEN
    -- grupos_escolha
    ALTER TABLE grupos_escolha ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
    UPDATE grupos_escolha
       SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
     WHERE tenant_id IS NULL;
    ALTER TABLE grupos_escolha ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
    ALTER TABLE grupos_escolha ALTER COLUMN tenant_id SET NOT NULL;
    DROP POLICY IF EXISTS grupos_escolha_tenant_isolation ON grupos_escolha;
    CREATE POLICY grupos_escolha_tenant_isolation ON grupos_escolha AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id())
      WITH CHECK (tenant_id = public.tenant_atual_id());
    CREATE INDEX IF NOT EXISTS grupos_escolha_tenant_id_idx ON grupos_escolha (tenant_id);

    -- grupo_escolha_itens
    ALTER TABLE grupo_escolha_itens ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
    UPDATE grupo_escolha_itens
       SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
     WHERE tenant_id IS NULL;
    ALTER TABLE grupo_escolha_itens ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
    ALTER TABLE grupo_escolha_itens ALTER COLUMN tenant_id SET NOT NULL;
    DROP POLICY IF EXISTS grupo_escolha_itens_tenant_isolation ON grupo_escolha_itens;
    CREATE POLICY grupo_escolha_itens_tenant_isolation ON grupo_escolha_itens AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id())
      WITH CHECK (tenant_id = public.tenant_atual_id());
    CREATE INDEX IF NOT EXISTS grupo_escolha_itens_tenant_id_idx ON grupo_escolha_itens (tenant_id);
  ELSE
    RAISE NOTICE 'public.tenant_atual_id() ausente — grupos_escolha/grupo_escolha_itens criadas sem tenant_id. Ao aplicar a Leva multitenant, adicionar tenant_id + policy de isolamento a ambas.';
  END IF;
END $$;

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabelas novas com RLS já habilitado e policies criadas aqui. Nenhuma
-- ação no painel é necessária além de conferir que RLS está ligada.
