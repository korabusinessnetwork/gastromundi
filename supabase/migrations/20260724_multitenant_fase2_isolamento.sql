-- ══════════════════════════════════════════════════════════════════
-- Isolamento Multi-tenant — Fase 1 (S1-1, Leva 2): tenant_id + RLS de
-- isolamento por tenant nas 24 tabelas de dado de negócio
-- docs/08_DECISOES/adr-008.md §5, §6 · decisão 002 · decisão 028
--
-- Esta é a leva que torna o isolamento REAL: cada tabela operacional
-- passa a carregar `tenant_id` e ganha uma policy RESTRICTIVE que só
-- deixa ver/gravar linha do próprio tenant da requisição (lido do JWT
-- via public.tenant_atual_id(), criada na Leva 1). É ADITIVA: soma-se
-- (AND) às policies de papel (20240107) e às RESTRICTIVE de assinatura
-- (20260720) — não substitui nenhuma. O super-admin `plataforma` NÃO
-- entra aqui (ADR-008 §5, decisão v2 nº 2: dado operacional só por
-- impersonation/escopo explícito, sem `OR is_super_admin()` global).
--
-- ┌─ PRÉ-REQUISITOS (ORDEM É SEGURANÇA) ────────────────────────────┐
-- │ 1. Leva 1 (20260723) APLICADA — users.tenant_id, hook injetando  │
-- │    app_metadata.tenant_id, e os helpers tenant_atual_id()/        │
-- │    is_super_admin() já existem.                                   │
-- │ 2. TODOS os usuários RELOGADOS depois da Leva 1 — o tenant_id só  │
-- │    entra no JWT no próximo login. Enquanto um usuário estiver com │
-- │    JWT antigo (sem o claim), tenant_atual_id() volta NULL e a     │
-- │    policy de isolamento esconde TODAS as linhas dele (o PDV fica  │
-- │    "vazio"). Com 2 usuários (matheus, joana), o protocolo é       │
-- │    trivial: aplicar fora do horário de operação e os dois saírem  │
-- │    e entrarem de novo. NÃO aplique com o caixa aberto.            │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, backfill com guarda WHERE,
-- SET NOT NULL idempotente, DROP POLICY IF EXISTS antes de CREATE) —
-- mesmo estilo de 20260716-20260723. Enquanto houver 1 só tenant, o
-- comportamento do app NÃO muda: o backfill põe toda linha no tenant
-- atual e tenant_atual_id() resolve para esse mesmo tenant.
--
-- ┌─ DECISÃO DE ENGENHARIA 1 — DEFAULT dinâmico via JWT ─────────────┐
-- │ tenant_id nasce com DEFAULT public.tenant_atual_id(): toda linha  │
-- │ nova herda automaticamente o tenant de quem está gravando (lido   │
-- │ do JWT), SEM o app precisar mandar tenant_id em cada INSERT. Isso │
-- │ mantém a promessa "nada no app muda" (ADR-008 §Consequências) e   │
-- │ evita um deploy coordenado de front. NÃO é o "default fixo"       │
-- │ rejeitado no ADR-008 §6/Alternativas — aquele era um LIMIT 1 fixo │
-- │ (single-tenant disfarçado); ESTE resolve o tenant por requisição  │
-- │ a partir do JWT, exatamente o comportamento multi-tenant desejado.│
-- │ Consequência: gravação sem JWT (SQL Editor/service_role) recebe   │
-- │ NULL no default e é barrada pelo NOT NULL — manutenção via SQL    │
-- │ precisa informar tenant_id explicitamente (intencional).         │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ DECISÃO DE ENGENHARIA 2 — PK/UNIQUE compostos ficam para depois ┐
-- │ Três chaves são hoje GLOBAIS e vão colidir quando o 2º tenant     │
-- │ reusar a mesma chave natural (confirmado na produção):            │
-- │   • config                 PK (key)      → futuro (tenant_id, key) │
-- │   • mesas                  PK (numero)   → futuro (tenant_id, numero)
-- │   • categorias_roteamento  UNIQUE (categoria) → (tenant_id, categoria)
-- │ NÃO são alteradas aqui de propósito: (a) o ISOLAMENTO já é total  │
-- │ via RLS independentemente da PK — a PK só governa unicidade, e    │
-- │ com 1 tenant não há colisão; (b) trocar a PK de `config`/`mesas`  │
-- │ quebraria o UPSERT por `key`/`numero` que o app usa hoje, exigindo│
-- │ mudança de front — contra a promessa "nada no app muda". A colisão│
-- │ só é possível quando existir um 2º tenant, o que só acontece na   │
-- │ Leva 4 (provisionamento). Estas 3 trocas ficam registradas como   │
-- │ PENDÊNCIA para a leva de provisionamento (rodar ANTES do 1º       │
-- │ INSERT do 2º tenant). Uniques deixadas GLOBAIS por decisão, não   │
-- │ pendência: notas_fiscais.chave_acesso (chave da NF-e é única      │
-- │ nacionalmente) e estoque.produto_id como PK (products.id é uma    │
-- │ identity global — não repete entre tenants).                     │
-- └──────────────────────────────────────────────────────────────────┘
-- ══════════════════════════════════════════════════════════════════

-- As 24 tabelas de dado de negócio (ADR-008 §5). Núcleo operacional
-- (as 12 já enforced por assinatura) + cadastro/derivados + telemetria
-- por tenant. Lista única e auditável, igual ao estilo do loop de
-- 20260720_assinatura_enforcement.sql.
DO $$
DECLARE
  t text;
  v_tenant_atual constant text :=
    '(SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)';
  tabelas text[] := ARRAY[
    -- núcleo operacional (12 — já enforced por assinatura em 20260720)
    'sales', 'vendas', 'venda_itens', 'venda_pagamentos', 'pending',
    'lancamentos', 'estoque', 'clientes', 'products', 'fechamentos',
    'config', 'mesas',
    -- cadastro / derivados de negócio (9)
    'notas_fiscais', 'notas_fiscais_itens', 'estoque_entradas',
    'subprodutos', 'combos', 'combo_subprodutos', 'itens_fiscal',
    'locais_impressao', 'categorias_roteamento',
    -- telemetria / insight por tenant (3)
    'jarvas_eventos', 'jarvas_insights', 'operator_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- Robustez: pula silenciosamente tabela que não exista (todas as 24
    -- foram confirmadas em produção; a guarda é só defensiva/reexecução).
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe — pulando.', t;
      CONTINUE;
    END IF;

    -- ── 1. Coluna tenant_id (nasce NULLABLE, FK para tenants) ───────
    -- Com a coluna nula não há linha para o FK validar → ADD é instantâneo.
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)',
      t
    );

    -- ── 2. Backfill — toda linha existente é do único tenant de hoje ─
    -- Mesma expressão LIMIT 1 dos wrappers e da Leva 1. Guarda WHERE
    -- torna reexecutável e não mexe em linha já preenchida.
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = %s WHERE tenant_id IS NULL',
      t, v_tenant_atual
    );

    -- ── 3. DEFAULT dinâmico (decisão 1) + NOT NULL ──────────────────
    -- Default resolve o tenant do JWT por requisição; NOT NULL fecha a
    -- integridade (nenhuma linha operacional sem tenant). Ambos após o
    -- backfill, quando toda linha existente já tem tenant_id.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id()',
      t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',
      t
    );

    -- ── 4. Policy RESTRICTIVE de isolamento por tenant ──────────────
    -- FOR ALL: USING cobre SELECT/UPDATE/DELETE, WITH CHECK cobre
    -- INSERT/UPDATE. SEM `OR is_super_admin()` (ADR-008 §5, decisão v2).
    -- Como é RESTRICTIVE, soma (AND) às policies de papel e de assinatura.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
      'USING (tenant_id = public.tenant_atual_id()) '
      'WITH CHECK (tenant_id = public.tenant_atual_id())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;

-- ── Índice em tenant_id (RLS mais barata e filtro por tenant) ──────
-- A policy compara tenant_id em toda linha avaliada; um índice por
-- tenant paga barato. Criado só nas tabelas com volume/consulta que
-- justifica (as demais são pequenas/lookup). CREATE INDEX IF NOT EXISTS
-- é idempotente.
CREATE INDEX IF NOT EXISTS vendas_tenant_id_idx           ON public.vendas (tenant_id);
CREATE INDEX IF NOT EXISTS venda_itens_tenant_id_idx      ON public.venda_itens (tenant_id);
CREATE INDEX IF NOT EXISTS venda_pagamentos_tenant_id_idx ON public.venda_pagamentos (tenant_id);
CREATE INDEX IF NOT EXISTS sales_tenant_id_idx            ON public.sales (tenant_id);
CREATE INDEX IF NOT EXISTS pending_tenant_id_idx          ON public.pending (tenant_id);
CREATE INDEX IF NOT EXISTS lancamentos_tenant_id_idx      ON public.lancamentos (tenant_id);
CREATE INDEX IF NOT EXISTS clientes_tenant_id_idx         ON public.clientes (tenant_id);
CREATE INDEX IF NOT EXISTS products_tenant_id_idx         ON public.products (tenant_id);
CREATE INDEX IF NOT EXISTS operator_logs_tenant_id_idx    ON public.operator_logs (tenant_id);
CREATE INDEX IF NOT EXISTS jarvas_eventos_tenant_id_idx   ON public.jarvas_eventos (tenant_id);
CREATE INDEX IF NOT EXISTS jarvas_insights_tenant_id_idx  ON public.jarvas_insights (tenant_id);

-- ── Nota de RLS (painel Supabase) ──────────────────────────────────
-- Nenhuma tabela nova; RLS já estava ligado nas 24 (confirmado em
-- produção). Nenhum ajuste de painel é necessário nesta leva. Lembrete:
-- os usuários PRECISAM RELOGAR (pré-requisito 2 do cabeçalho) — sem o
-- claim tenant_id no JWT, a policy de isolamento esconde tudo.
--
-- PRÓXIMA LEVA (20260725): trocar o corpo dos 2 wrappers de conveniência
-- (tenant_atual_tem_modulo / assinatura_atual_ativa) de LIMIT 1 para
-- public.tenant_atual_id() (ADR-008 §4). Só depois desta leva aplicada
-- E com todos relogados.
