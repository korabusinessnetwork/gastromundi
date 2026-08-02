-- ══════════════════════════════════════════════════════════════════
-- Sangria e suprimento do caixa — caixa_movimentos
-- F005 · docs/03_REGRAS_DE_NEGOCIO/CAIXA.md · decisão 002 (multi-tenant/RLS)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O caixa já abre e fecha, mas o dinheiro que SAI da gaveta no    │
-- │ meio do turno (sangria: levar o excesso ao cofre) e o que ENTRA │
-- │ como reforço de troco (suprimento) não tinham onde ser          │
-- │ registrados. Sem esse registro o fechamento acusa "falta" toda  │
-- │ vez que alguém tira dinheiro por um motivo legítimo, e não há   │
-- │ como saber quem tirou, quanto e por quê.                        │
-- │                                                                  │
-- │ O CAIXA.md define: esperado = fundo + entradas em dinheiro      │
-- │ + suprimentos − sangrias − estornos. Esta tabela entrega as     │
-- │ duas parcelas do meio.                                          │
-- └───────────────────────────────────────────────────────────────────┘
--
-- `valor` é numeric, não centavos inteiros: a camada operacional inteira
-- (vendas.total, lancamentos.valor) já é numeric e a conferência de caixa
-- soma tudo via round2 de src/lib/vendas.js. Centavos inteiros só existem
-- na camada de assinatura/console. Misturar as duas representações dentro
-- da mesma conta é que produziria erro de arredondamento.
--
-- SEM UPDATE E SEM DELETE, de propósito: movimento de caixa é trilha de
-- auditoria. Errou o valor? Registra o movimento inverso — não apaga.
--
-- PRÉ-REQUISITOS: multi-tenant aplicado — public.tenants,
-- public.tenant_atual_id() e o claim app_metadata.gastro_role no JWT.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- constraints adicionadas só se não existirem.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: as policies abaixo já isolam por tenant e por papel — confira
--    no painel (Authentication → Policies) que RLS ficou habilitada.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caixa_movimentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- tenant_id resolve o estabelecimento do JWT por requisição; NOT NULL fecha
  tenant_id         uuid        NOT NULL DEFAULT public.tenant_atual_id()
                                REFERENCES public.tenants(id),
  -- 'sangria' = dinheiro sai da gaveta · 'suprimento' = entra como troco
  tipo              text        NOT NULL,
  -- numeric como lancamentos.valor; sempre positivo — o sinal está no tipo
  valor             numeric     NOT NULL,
  -- obrigatório: "cada sangria/suprimento (autor e motivo)" (CAIXA.md)
  motivo            text        NOT NULL,
  -- username de quem operou (mesma chave do activity_log)
  autor             text        NOT NULL,
  -- preenchido só quando passou do limite e um gerente autorizou
  autorizado_por    text,
  -- recorte da sessão: o fechamento só conta os movimentos desta abertura
  sessao_aberta_em  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- tipo restrito ao conjunto conhecido (defensivo contra escrita torta).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caixa_movimentos_tipo_check'
      AND conrelid = 'public.caixa_movimentos'::regclass
  ) THEN
    ALTER TABLE public.caixa_movimentos
      ADD CONSTRAINT caixa_movimentos_tipo_check
      CHECK (tipo IN ('sangria', 'suprimento'));
  END IF;
END $$;

-- valor > 0: zero não é movimento e negativo inverteria a conta do esperado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'caixa_movimentos_valor_check'
      AND conrelid = 'public.caixa_movimentos'::regclass
  ) THEN
    ALTER TABLE public.caixa_movimentos
      ADD CONSTRAINT caixa_movimentos_valor_check
      CHECK (valor > 0);
  END IF;
END $$;

-- O fechamento lê "os movimentos deste tenant desde a abertura" — o índice
-- casa exatamente esse filtro.
CREATE INDEX IF NOT EXISTS caixa_movimentos_sessao_idx
  ON public.caixa_movimentos (tenant_id, created_at DESC);

-- ── 2. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.caixa_movimentos ENABLE ROW LEVEL SECURITY;

-- Qualquer logado LÊ: o fechamento precisa do ajuste para calcular o
-- esperado, e quem fecha nem sempre é quem sangrou.
DROP POLICY IF EXISTS caixa_movimentos_select_auth ON public.caixa_movimentos;
CREATE POLICY caixa_movimentos_select_auth
  ON public.caixa_movimentos FOR SELECT
  USING (auth.role() = 'authenticated');

-- REGISTRA quem opera a frente de caixa (CAIXA.md: dono, gerente, caixa).
-- Garçom/cozinha não movimentam dinheiro da gaveta.
DROP POLICY IF EXISTS caixa_movimentos_insert_operacao ON public.caixa_movimentos;
CREATE POLICY caixa_movimentos_insert_operacao
  ON public.caixa_movimentos FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('admin', 'gerente', 'caixa'));

-- Nenhuma policy de UPDATE ou DELETE: com RLS habilitada e sem policy, o
-- banco NEGA. É a trilha de auditoria — a ausência aqui é a regra.

-- Isolamento por tenant (RESTRICTIVE → soma AND às policies acima).
DROP POLICY IF EXISTS caixa_movimentos_tenant_isolation ON public.caixa_movimentos;
CREATE POLICY caixa_movimentos_tenant_isolation
  ON public.caixa_movimentos AS RESTRICTIVE FOR ALL
  USING      (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());
