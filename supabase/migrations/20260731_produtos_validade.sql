-- ══════════════════════════════════════════════════════════════════
-- C1 — Validade de produtos
--
-- Duas colunas em public.products (ambas nullable — produto sem controle
-- de validade fica NULL):
--   validade_dias    integer  — prazo de validade típico do produto, em
--                                dias (shelf life). Metadado por produto;
--                                NÃO é uma data fixa. A validade real é por
--                                lote de entrada.
--   proxima_validade date     — versão simples adotada: como o estoque hoje
--                                é um número agregado por produto (tabela
--                                public.estoque, sem estrutura de lote), a
--                                próxima data de vencimento a acompanhar é
--                                preenchida manualmente (e, opcionalmente, no
--                                import de NF-e). Quando existir estrutura de
--                                lote/entrada, mover a validade para o lote.
--
-- RLS: as colunas herdam a policy existente de public.products
-- (products_select_auth / products_write_gerente_admin em
-- 20240108_fix_jwt_role_claim.sql) — nenhuma policy nova é necessária.
--
-- ⚠️ EXECUÇÃO MANUAL: rode este arquivo no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS validade_dias    integer,
  ADD COLUMN IF NOT EXISTS proxima_validade date;

COMMENT ON COLUMN public.products.validade_dias    IS 'Prazo de validade típico (shelf life) em dias. NULL = produto sem controle de validade.';
COMMENT ON COLUMN public.products.proxima_validade IS 'Próxima data de vencimento a acompanhar (preenchida manualmente ou no import de NF-e). NULL = sem controle.';
