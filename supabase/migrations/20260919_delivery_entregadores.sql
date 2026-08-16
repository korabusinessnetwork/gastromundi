-- ══════════════════════════════════════════════════════════════════
-- Delivery — entregadores (motoboys) + atribuição ao pedido
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O painel de delivery precisa saber QUEM leva cada pedido para:   │
-- │   • acompanhar quantas entregas cada entregador tem em rota;      │
-- │   • fechar o dia por entregador (quanto pagar a cada um).         │
-- │                                                                  │
-- │ Modelo simples e de custo zero (fase de bootstrap): cada         │
-- │ entregador tem um `valor_por_entrega` (R$ fixo por corrida). Ao  │
-- │ atribuir um entregador ao pedido, esse valor é FOTOGRAFADO em    │
-- │ delivery_pedidos.valor_entregador — assim o fechamento histórico │
-- │ não muda se o dono reajustar o valor do entregador depois. O     │
-- │ snapshot também é editável por pedido (corrida mais longa vale   │
-- │ mais), sem afetar os outros pedidos.                             │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: cria uma tabela e adiciona duas colunas em delivery_pedidos.
-- Nada é removido. Segue o padrão da fundação (20260804): tenant_id com
-- DEFAULT public.tenant_atual_id() + RLS RESTRICTIVE por tenant, para o
-- admin inserir/editar DIRETO pelo client sem passar tenant_id.
--
-- Idempotente: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS antes de CREATE, CREATE INDEX IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. delivery_entregadores — cadastro de motoboys/entregadores ───
CREATE TABLE IF NOT EXISTS public.delivery_entregadores (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome              text        NOT NULL,
  telefone          text,
  ativo             boolean     NOT NULL DEFAULT true,
  valor_por_entrega numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_entregadores_tenant_idx
  ON public.delivery_entregadores (tenant_id);

-- ── 2. delivery_pedidos ganha o entregador atribuído + snapshot R$ ──
-- entregador_id: ON DELETE SET NULL — apagar um entregador não apaga o
-- histórico de pedidos, só desvincula. valor_entregador: fotografia do
-- valor no momento da atribuição (editável por pedido).
ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS entregador_id   uuid REFERENCES public.delivery_entregadores(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS valor_entregador numeric;

CREATE INDEX IF NOT EXISTS delivery_pedidos_entregador_idx
  ON public.delivery_pedidos (tenant_id, entregador_id);

-- ── 3. RLS — isolamento por tenant (mesmo padrão da fundação) ──────
ALTER TABLE public.delivery_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_entregadores FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_entregadores_tenant_isolamento ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_tenant_isolamento
  ON public.delivery_entregadores AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabela nova com RLS já habilitado e policy RESTRICTIVE criada aqui.
-- Nenhuma ação no painel é necessária além de conferir que RLS está
-- ligada em public.delivery_entregadores.
