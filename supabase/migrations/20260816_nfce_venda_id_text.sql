-- ══════════════════════════════════════════════════════════════════
-- NFC-e — venda_id: uuid → text (auditoria N4)
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: só altera se ainda for uuid (bloco guardado).
--
-- N4 — Descasamento de tipo trava a emissão:
--   nfce_emitidas.venda_id nasceu `uuid` (20260733), mas a PK de
--   public.vendas é `text` (id do PDV — string, não UUID). A Edge
--   emitir-nfce recebe vendaId como string e:
--     • filtra a idempotência com .eq("venda_id", vendaId), e
--     • grava venda_id no insert da nota.
--   Contra uma coluna uuid, um id de venda real (não-UUID) estoura
--   `invalid input syntax for type uuid` — a emissão QUEBRA para toda
--   venda do PDV. Alinha o tipo ao da fonte (vendas.id = text).
--
--   O índice nfce_emitidas_venda_idx (tenant_id, venda_id) é recriado
--   automaticamente pelo Postgres no ALTER TYPE; nenhum passo extra.
--   Sem FK para vendas: reenvios avulsos podem não ter venda e a nota
--   deve sobreviver ao ciclo de vida da venda (mantém o comportamento
--   atual da 20260733). RLS já configurada; nada a mexer no painel.
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'nfce_emitidas'
      AND column_name  = 'venda_id'
      AND data_type    = 'uuid'
  ) THEN
    ALTER TABLE public.nfce_emitidas
      ALTER COLUMN venda_id TYPE text USING venda_id::text;
  END IF;
END;
$$;
