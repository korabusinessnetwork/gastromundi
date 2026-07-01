-- ══════════════════════════════════════════════════════════════════
-- MESAS — layout físico e status manual de mesas do estabelecimento
--
-- Pré-requisito: Fase 4 concluída (20240107_rls_por_role.sql)
--
-- Status é derivado no front-end:
--   "ocupada"    → existe pending com mesa = numero e status = 'open'
--   "reservada"  → status_manual = 'reservada'
--   "manutencao" → status_manual = 'manutencao'
--   "livre"      → nenhuma das condições acima
--
-- Convenção: leitura para authenticated, escrita para gerente/admin
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mesas (
  numero        text        PRIMARY KEY,
  capacidade    integer     DEFAULT 4,
  posicao_x     integer,
  posicao_y     integer,
  status_manual text        DEFAULT 'livre',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;

-- Qualquer logado lê
CREATE POLICY "mesas_select_auth"
  ON public.mesas FOR SELECT
  USING (auth.role() = 'authenticated');

-- Gerente e admin escrevem
CREATE POLICY "mesas_write_gerente_admin"
  ON public.mesas FOR ALL
  USING  ((auth.jwt() ->> 'role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));
