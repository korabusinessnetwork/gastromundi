-- ══════════════════════════════════════════════════════════════════
-- Índices de tenant_id em subprodutos e combo_subprodutos
-- decisão 002 (multi-tenant por RLS) · integração do PR #32
-- ──────────────────────────────────────────────────────────────────
-- A 20260921 deixou estas duas tabelas de fora porque, no #32, a tela de
-- Subprodutos tinha saído do front-end. Na integração com a main as duas
-- formas de montar combo ficaram (subprodutos e grupos de escolha), e a
-- tela de Subprodutos e o editor de combos voltam a consultar as duas.
-- Com RLS ligada, cada consulta ganha `tenant_id = tenant_atual_id()`;
-- sem índice, isso lê a tabela inteira.
--
-- Cada índice corresponde a uma consulta do código:
--   • subprodutos: lista ordenada por nome (features/cardapio/dados).
--   • combo_subprodutos: composição de um combo (filtro por combo_id).
--
-- Idempotente: CREATE INDEX IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS subprodutos_tenant_id_idx
  ON public.subprodutos (tenant_id, nome);

CREATE INDEX IF NOT EXISTS combo_subprodutos_tenant_id_idx
  ON public.combo_subprodutos (tenant_id, combo_id);
