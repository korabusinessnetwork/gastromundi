-- ══════════════════════════════════════════════════════════════════
-- Adiciona colunas mesa e apelido à tabela pending
--
-- Contexto: o código já envia esses campos em addPending/updatePending,
-- mas a tabela foi criada sem eles. Resultado: erro PGRST204 em produção.
--
-- mesa    — número/nome da mesa associada à comanda (ex: "5", "Varanda A")
-- apelido — nome informal do cliente para identificar a comanda na fila
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.pending
  ADD COLUMN IF NOT EXISTS mesa    text,
  ADD COLUMN IF NOT EXISTS apelido text;
