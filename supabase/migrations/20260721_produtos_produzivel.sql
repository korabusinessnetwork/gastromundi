-- ══════════════════════════════════════════════════════════════════
-- F015 — Layouts de impressão (via de produção / cozinha)
-- docs/09_BACKLOG/features.md (F015) · docs/03_REGRAS_DE_NEGOCIO/COZINHA.md
--
-- A via de produção (ticket de cozinha) só deve listar itens que a
-- cozinha de fato prepara — bebida de garrafa/lata, por exemplo, não
-- precisa aparecer lá (COZINHA.md já previa esse flag como roadmap).
--
-- `produzivel` nasce `true` por padrão: nenhum produto existente muda
-- de comportamento (continua aparecendo na via de produção, igual a
-- hoje, até alguém marcar explicitamente um produto como não-produzível
-- via UI futura). Como o carrinho do PDV já espalha o produto inteiro
-- (`{...product, qty, _key}` em PDVView.handleAddProduct), este campo
-- flui automaticamente para `pending.items`/`sales.items` sem precisar
-- tocar em mais nenhum ponto do fluxo de venda.
--
-- Sem mudança de RLS: as políticas de `products` já cobrem a tabela
-- inteira (products_select_auth / products_write_gerente_admin),
-- nenhuma política nova é necessária só por causa de uma coluna.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS produzivel boolean NOT NULL DEFAULT true;
