-- ══════════════════════════════════════════════════════════════════
-- Delivery — pagamento do entregador vira SAÍDA DE CAIXA (sangria).
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Até aqui o fechamento do delivery só MOSTRAVA quanto pagar a cada │
-- │ entregador — o dinheiro saía da gaveta sem registro nenhum, e o   │
-- │ caixa fechava com "falta" do valor pago aos motoboys (era um dos  │
-- │ exemplos legítimos de sangria citados em caixaMovimentos.js).     │
-- │                                                                  │
-- │ Agora, ao registrar o pagamento de um entregador no fechamento,  │
-- │ o app grava uma SANGRIA em caixa_movimentos (dinheiro sai da      │
-- │ gaveta, com motivo e autor) e MARCA as corridas pagas para não   │
-- │ pagar a mesma entrega duas vezes.                                 │
-- │                                                                  │
-- │ entregador_pago_em: carimbo do momento do pagamento. NULL = ainda │
-- │ a pagar; preenchido = já saiu da gaveta. O fechamento separa      │
-- │ "a pagar" de "já pago" por este campo.                            │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: só adiciona uma coluna em delivery_pedidos. Nada é removido.
-- A coluna reaproveita a RLS de delivery_pedidos (20260807: escrita para
-- caixa/gerente/admin) — marcar como pago é um UPDATE do operador.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Rodar MANUALMENTE no SQL Editor do Supabase (o projeto não aplica
-- migrations automaticamente).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS entregador_pago_em timestamptz;

-- Consulta do fechamento filtra por entregador + status + pago/não pago.
CREATE INDEX IF NOT EXISTS delivery_pedidos_entregador_pago_idx
  ON public.delivery_pedidos (tenant_id, entregador_id, entregador_pago_em);

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Nenhuma policy nova: a coluna nova de delivery_pedidos usa as policies
-- já existentes da tabela (20260807 — escrita caixa/gerente/admin,
-- RESTRICTIVE de tenant). Basta conferir que RLS segue ligada em
-- public.delivery_pedidos.
