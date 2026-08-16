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

-- ── 3. RLS ──────────────────────────────────────────────────────────
-- Duas camadas, do mesmo jeito que o cardápio do Delivery (20260804 +
-- CORREÇÃO 20260807):
--   • PERMISSIVE de papel — LIBERA o acesso. No PostgreSQL uma policy
--     RESTRICTIVE só RESTRINGE (AND) linhas já liberadas por ALGUMA
--     permissive; sem NENHUMA permissive o resultado é "nega tudo" e o
--     INSERT/SELECT volta 403. (Foi exatamente o bug que a 20260807
--     corrigiu nas tabelas de Delivery que nasceram sem essa base.)
--   • RESTRICTIVE de tenant — ISOLA: cada papel só enxerga/escreve
--     dentro do próprio tenant (soma via AND com a permissive).
-- Espelha o padrão de gestão do cardápio: leitura para qualquer
-- autenticado (o painel mostra o nome do entregador no card do pedido
-- para o caixa também); escrita só para gerente/admin (== isAdmin no
-- app). Papel lido de app_metadata.gastro_role (NÃO da raiz `role` do
-- JWT, que o PostgREST reserva para authenticated/anon/service_role).
ALTER TABLE public.delivery_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_entregadores FORCE  ROW LEVEL SECURITY;

-- PERMISSIVE: leitura para autenticado.
DROP POLICY IF EXISTS delivery_entregadores_select_auth ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_select_auth
  ON public.delivery_entregadores FOR SELECT
  USING (auth.role() = 'authenticated');

-- PERMISSIVE: escrita (INSERT/UPDATE/DELETE) só para gerente/admin.
DROP POLICY IF EXISTS delivery_entregadores_write_gerente_admin ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_write_gerente_admin
  ON public.delivery_entregadores FOR ALL
  USING      ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- RESTRICTIVE: isolamento por tenant (soma via AND com as permissive acima).
DROP POLICY IF EXISTS delivery_entregadores_tenant_isolamento ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_tenant_isolamento
  ON public.delivery_entregadores AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabela nova com RLS já habilitado e policies (permissive de papel +
-- restrictive de tenant) criadas aqui. Nenhuma ação no painel é
-- necessária além de conferir que RLS está ligada em
-- public.delivery_entregadores. As colunas novas em delivery_pedidos
-- (entregador_id/valor_entregador) reaproveitam as policies dessa tabela
-- (20260807: escrita caixa/gerente/admin) — atribuir entregador é UPDATE.
