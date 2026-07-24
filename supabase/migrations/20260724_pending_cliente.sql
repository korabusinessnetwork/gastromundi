-- ══════════════════════════════════════════════════════════════════
-- Vínculo de cliente à comanda (pending)
--
-- Contexto: o operador pode vincular um cliente cadastrado (F010) a uma
-- comanda direto no PDV — botão "Cliente" ao lado do botão de mesa. O
-- vínculo viaja no checkout: identifica a venda (histórico por cliente),
-- pré-satisfaz o fiado e pré-preenche o CPF na nota (add-on nfe).
--
-- cliente_id   — FK para clientes (ON DELETE SET NULL: apagar o cliente
--                não apaga a comanda, só desvincula).
-- cliente_nome — nome denormalizado p/ exibir na comanda/botão sem join
--                (e sobrevive à anonimização/exclusão do cliente).
--
-- RLS: pending já tem políticas próprias; colunas novas herdam a tabela.
-- Nenhuma política nova é necessária.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.pending
  ADD COLUMN IF NOT EXISTS cliente_id   uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome text;

CREATE INDEX IF NOT EXISTS idx_pending_cliente_id ON public.pending(cliente_id);
