-- ══════════════════════════════════════════════════════════════════
-- Cozinha / KDS (F007) — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md
--
-- Contexto: o "pedido" nesta base é a própria comanda em
-- public.pending (JSONB items) — não existe tabela pedidos/pedido_itens
-- separada (docs/09_BACKLOG/mvp_operacional.md descreve o modelo-alvo,
-- não o estado atual; ADR-004 já registra essa divergência). O KDS
-- rastreia o avanço de preparo com 3 colunas novas em pending.
--
-- status_cozinha: aguardando (default, ao lançar itens) → em_preparo
-- → pronto. Sai do painel quando a comanda é finalizada/cancelada
-- (a linha já é removida de pending nesses casos, sem mudança aqui).
--
-- RLS: a policy existente "pending_all_auth" (qualquer logado,
-- FOR ALL) já cobre leitura e escrita destas colunas — nenhuma
-- policy nova é necessária.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.pending
  ADD COLUMN IF NOT EXISTS status_cozinha text        NOT NULL DEFAULT 'aguardando'
    CHECK (status_cozinha IN ('aguardando', 'em_preparo', 'pronto')),
  ADD COLUMN IF NOT EXISTS em_preparo_em  timestamptz,
  ADD COLUMN IF NOT EXISTS pronto_em      timestamptz;
