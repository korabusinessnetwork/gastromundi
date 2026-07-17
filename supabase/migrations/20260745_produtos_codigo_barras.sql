-- ════════════════════════════════════════════════════════════════════
-- 20260745 — coluna codigo_barras em products
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (varredura Kora, médio):
--   O front já referencia products.codigo_barras em dois pontos —
--   ProdutosView grava o campo quando FEATURE_BARCODE_SCANNER estiver
--   ligada, e o PDV busca produto por código de barras — mas a coluna
--   nunca existiu no banco. Ligar a flag hoje quebraria o cadastro de
--   produtos com erro de coluna inexistente.
--
-- CORREÇÃO:
--   Cria a coluna (nullable; produto sem código continua normal) e um
--   índice parcial para o lookup do leitor no PDV ser instantâneo.
--
-- ⚠️  Aplicar no painel/CLI do Supabase — ainda NÃO aplicada em produção.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS codigo_barras text;

COMMENT ON COLUMN public.products.codigo_barras IS
  'Código de barras (EAN/GTIN) para busca rápida no PDV — usado quando FEATURE_BARCODE_SCANNER estiver ativa; nullable.';

CREATE INDEX IF NOT EXISTS idx_products_codigo_barras
  ON public.products (codigo_barras)
  WHERE codigo_barras IS NOT NULL;
