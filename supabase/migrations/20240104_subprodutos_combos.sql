-- ══════════════════════════════════════════════════════════════════
-- Subprodutos, Combos e tabela de junção
-- products.id é bigint → item_principal_id bigint
-- ══════════════════════════════════════════════════════════════════

-- ── 1. subprodutos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subprodutos (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT        NOT NULL CHECK (length(trim(nome)) > 0),
  categoria        TEXT,
  preco            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (preco >= 0),
  unidade_medida   TEXT,
  controla_estoque BOOLEAN     NOT NULL DEFAULT false,
  ativo            BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subprodutos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subprodutos' AND policyname = 'allow_all_subprodutos'
  ) THEN
    CREATE POLICY "allow_all_subprodutos" ON subprodutos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. combos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              TEXT        NOT NULL CHECK (length(trim(nome)) > 0),
  item_principal_id BIGINT      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  modo              TEXT        NOT NULL DEFAULT 'combo' CHECK (modo IN ('combo', 'substituir')),
  preco_total       NUMERIC(10,2) CHECK (preco_total IS NULL OR preco_total >= 0),
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combos_item_principal ON combos(item_principal_id);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combos' AND policyname = 'allow_all_combos'
  ) THEN
    CREATE POLICY "allow_all_combos" ON combos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. combo_subprodutos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS combo_subprodutos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id          UUID        NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  subproduto_id     UUID        NOT NULL REFERENCES subprodutos(id) ON DELETE RESTRICT,
  quantidade        INTEGER     NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_customizado NUMERIC(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (combo_id, subproduto_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_subprodutos_combo     ON combo_subprodutos(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_subprodutos_subprod   ON combo_subprodutos(subproduto_id);

ALTER TABLE combo_subprodutos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'combo_subprodutos' AND policyname = 'allow_all_combo_subprodutos'
  ) THEN
    CREATE POLICY "allow_all_combo_subprodutos" ON combo_subprodutos FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
