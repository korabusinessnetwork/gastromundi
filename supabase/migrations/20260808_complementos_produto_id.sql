-- ══════════════════════════════════════════════════════════════════
-- Delivery — Complementos vinculados a produtos já criados.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: pode rodar de novo sem erro.
--
-- CONTEXTO:
--   Até aqui um complemento (ex.: "+ Bacon R$4") era digitado à mão:
--   nome e preço em texto livre. O dono pediu que o complemento seja um
--   ITEM JÁ CRIADO (produto do catálogo), escolhido por um menu de busca,
--   para não recadastrar o que já existe e manter o vínculo com o produto.
--
-- DECISÃO (dono, 2026-07-20):
--   • VINCULAR ao produto via `produto_id` (integridade + relatório por
--     produto + o item passa a existir de fato no cadastro).
--   • O PREÇO do complemento CONTINUA um campo próprio e editável
--     (`complementos.preco`), NÃO puxa o preço do PDV — o preço no
--     delivery pode ser diferente (ou igual) ao do balcão. Por isso
--     `preco` permanece coluna própria; só `produto_id` é adicionado.
--   • `nome` permanece coluna própria (snapshot preenchido a partir do
--     produto no cadastro) — assim a RPC pública do cardápio
--     (20260804, que lê c.nome/c.preco) NÃO muda e nada quebra na vitrine.
--
-- COMPATIBILIDADE:
--   Coluna nasce NULLABLE — os complementos antigos (texto livre, sem
--   vínculo) continuam válidos com produto_id NULL. ON DELETE SET NULL:
--   se o produto for excluído, o complemento sobrevive como item avulso
--   (mantém o nome/preço já gravados), não some do cardápio.
--
-- RLS: nenhuma mudança. As policies de complementos (20260804 isolamento
--   por tenant + 20260807 papel gerente/admin) são FOR ALL e não
--   referenciam esta coluna — seguem valendo sem ajuste no painel.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.complementos
  ADD COLUMN IF NOT EXISTS produto_id bigint
    REFERENCES public.products(id) ON DELETE SET NULL;

-- Índice para relatório/consulta por produto e para o FK.
CREATE INDEX IF NOT EXISTS complementos_produto_idx
  ON public.complementos (produto_id);
