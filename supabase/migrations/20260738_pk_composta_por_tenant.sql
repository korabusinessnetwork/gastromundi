-- ══════════════════════════════════════════════════════════════════
-- Multi-tenant — chaves naturais compostas por tenant (pré-2º tenant)
-- docs/08_DECISOES/adr-008.md §6 · decisão 002/028 · pendência registrada
-- em 20260724_multitenant_fase2_isolamento.sql (DECISÃO DE ENGENHARIA 2)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ A Leva 2 (20260724_fase2) isolou 24 tabelas por tenant via RLS,  │
-- │ mas deixou 3 chaves naturais GLOBAIS de propósito (trocá-las      │
-- │ exigia mudar o front, e com 1 só tenant não há colisão):         │
-- │   • config                PK (key)       → (tenant_id, key)       │
-- │   • mesas                 PK (numero)    → (tenant_id, numero)    │
-- │   • categorias_roteamento UNIQUE(categoria) → UNIQUE(tenant_id,categoria)
-- │                                                                   │
-- │ A RLS isola a LEITURA/ESCRITA por tenant, mas uma PK/UNIQUE é     │
-- │ enforced no nível da TABELA, ACIMA da RLS. Com a chave global, o  │
-- │ 2º tenant que gravar `config.key='caixa_aberto'` (que o 1º já     │
-- │ tem), ou uma mesa "1", colide com "duplicate key" — mesmo sem     │
-- │ enxergar a linha do outro. Esta migration compõe as 3 chaves com  │
-- │ tenant_id para que cada estabelecimento tenha o seu espaço.       │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ ORDEM DE APLICAÇÃO (importante) ───────────────────────────────┐
-- │ Aplique esta migration ANTES de provisionar o 2º estabelecimento │
-- │ E junto do deploy de front correspondente (os upserts de mesas e │
-- │ categorias passam a usar onConflict composto):                   │
-- │   1) rode esta migration no SQL Editor;                          │
-- │   2) faça o deploy do front que acompanha este commit.          │
-- │ Entre (1) e (2), salvar layout de mesa / roteamento de categoria │
-- │ falha (a UNIQUE antiga de numero/categoria deixou de existir).   │
-- │ `config` NÃO tem essa janela: o upsert sem onConflict cai na PK  │
-- │ nova automaticamente. Faça os dois juntos, fora de operação.     │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PRÉ-REQUISITOS: Leva 2 aplicada (as 3 tabelas têm tenant_id NOT NULL
-- com DEFAULT tenant_atual_id()). Enquanto houver 1 tenant, a troca é
-- transparente: (tenant_id, chave) é única porque a chave já era única.
--
-- Idempotente: cada bloco só age se a chave ainda for a antiga (global);
-- reexecutar depois de composta é no-op.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. config — PK (key) → (tenant_id, key) ────────────────────────
DO $$
DECLARE
  v_con text;
  v_cols text[];
BEGIN
  SELECT c.conname,
         (SELECT array_agg(a.attname::text ORDER BY a.attnum)
          FROM unnest(c.conkey) k JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k)
    INTO v_con, v_cols
  FROM pg_constraint c
  WHERE c.conrelid = 'public.config'::regclass AND c.contype = 'p';

  IF v_cols = ARRAY['key'] THEN
    EXECUTE format('ALTER TABLE public.config DROP CONSTRAINT %I', v_con);
    ALTER TABLE public.config ADD PRIMARY KEY (tenant_id, key);
    RAISE NOTICE 'config: PK trocada para (tenant_id, key).';
  ELSE
    RAISE NOTICE 'config: PK já não é (key) — nada a fazer (%).', v_cols;
  END IF;
END $$;

-- ── 2. mesas — PK (numero) → (tenant_id, numero) ───────────────────
DO $$
DECLARE
  v_con text;
  v_cols text[];
BEGIN
  SELECT c.conname,
         (SELECT array_agg(a.attname::text ORDER BY a.attnum)
          FROM unnest(c.conkey) k JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = k)
    INTO v_con, v_cols
  FROM pg_constraint c
  WHERE c.conrelid = 'public.mesas'::regclass AND c.contype = 'p';

  IF v_cols = ARRAY['numero'] THEN
    EXECUTE format('ALTER TABLE public.mesas DROP CONSTRAINT %I', v_con);
    ALTER TABLE public.mesas ADD PRIMARY KEY (tenant_id, numero);
    RAISE NOTICE 'mesas: PK trocada para (tenant_id, numero).';
  ELSE
    RAISE NOTICE 'mesas: PK já não é (numero) — nada a fazer (%).', v_cols;
  END IF;
END $$;

-- ── 3. categorias_roteamento — UNIQUE(categoria) → UNIQUE(tenant_id,categoria)
-- A PK aqui é `id` (uuid, global e segura) — mexemos só a UNIQUE natural.
DO $$
DECLARE
  v_con text;
BEGIN
  -- Remove a UNIQUE de coluna única (categoria), se ainda existir.
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  WHERE c.conrelid = 'public.categorias_roteamento'::regclass
    AND c.contype = 'u'
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum)
         FROM unnest(c.conkey) k JOIN pg_attribute a
           ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['categoria'];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.categorias_roteamento DROP CONSTRAINT %I', v_con);
    RAISE NOTICE 'categorias_roteamento: UNIQUE(categoria) removida.';
  END IF;

  -- Adiciona a UNIQUE composta, se ainda não existir (por nome fixo).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categorias_roteamento_tenant_categoria_key'
      AND conrelid = 'public.categorias_roteamento'::regclass
  ) THEN
    ALTER TABLE public.categorias_roteamento
      ADD CONSTRAINT categorias_roteamento_tenant_categoria_key UNIQUE (tenant_id, categoria);
    RAISE NOTICE 'categorias_roteamento: UNIQUE(tenant_id, categoria) criada.';
  END IF;
END $$;
