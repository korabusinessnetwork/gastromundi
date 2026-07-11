-- ══════════════════════════════════════════════════════════════════
-- F010 — Clientes (cadastro, histórico, fiado)
-- docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md
--
-- Contexto: cliente é opcionalmente vinculado a uma venda; fiado
-- exige cliente identificado. O fiado JÁ existe como conta a receber
-- em public.lancamentos (Financeiro, 20260710_financeiro.sql) — esta
-- migração só acrescenta o vínculo ao cliente, não cria um segundo
-- sistema de fiado. Histórico de compras vem de public.vendas
-- (TD009), também só com o vínculo novo.
--
-- NOTA: CLIENTES.md menciona isolamento multi-tenant absoluto, mas
-- não existe tenant_id em nenhuma tabela real do app (ADR-004: stack
-- real prevalece, single-tenant hoje) — não introduzido aqui.
--
-- Convenção: leitura/escrita para garcom/caixa/gerente/admin (cadastro
-- rápido no balcão); exclusão/anonimização restrita a gerente/admin.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.clientes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text        NOT NULL,
  telefone     text,
  endereco     text,
  observacoes  text,
  anonimizado  boolean     NOT NULL DEFAULT false,
  criado_por   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clientes_nome_idx     ON public.clientes (nome);
CREATE INDEX IF NOT EXISTS clientes_telefone_idx ON public.clientes (telefone);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select_auth"
  ON public.clientes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "clientes_insert_update_operacional"
  ON public.clientes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'role') IN ('garcom', 'caixa', 'gerente', 'admin'));

CREATE POLICY "clientes_update_operacional"
  ON public.clientes FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('garcom', 'caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('garcom', 'caixa', 'gerente', 'admin'));

CREATE POLICY "clientes_delete_gerencia"
  ON public.clientes FOR DELETE
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── Vínculo opcional venda ↔ cliente (histórico de compras) ─────────
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS vendas_cliente_id_idx ON public.vendas (cliente_id);

-- ── Vínculo fiado ↔ cliente (o lançamento em si já existe) ──────────
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS lancamentos_cliente_id_idx ON public.lancamentos (cliente_id);
