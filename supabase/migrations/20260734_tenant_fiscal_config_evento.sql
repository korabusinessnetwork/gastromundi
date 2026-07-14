-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — endpoint de EVENTO + desfecho do CANCELAMENTO
-- (Leva 10) · multi-tenant (decisão 002/028) · white-label (decisão 017)
--
-- O cancelamento de NFC-e é um EVENTO assinado (RecepcaoEvento4), serviço
-- DISTINTO do de autorização. A tenant_fiscal_config (20260731) só tinha a
-- url_autorizacao — aqui adicionamos o endpoint de recepção de evento
-- (NÃO-secreto, é só a URL do webservice da SEFAZ-RS).
--
-- Para guardar o desfecho do cancelamento SEM poluir os campos da emissão em
-- public.nfce_emitidas (20260733), adicionamos colunas próprias e nullable.
-- O status 'cancelada' JÁ é válido no CHECK existente — NÃO mexemos nele.
--
-- ┌─ FRONTEIRA DE SEGREDO ────────────────────────────────────────────┐
-- │ Tudo aqui é PÚBLICO: URL de webservice, justificativa, protocolo e │
-- │ o procEventoNFe (documento do evento). Nada de certificado/CSC.    │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. NÃO edita a 20260733 nem a 20260731.
-- RLS: as tabelas já têm policies (20260731/20260733) — nada a fazer no painel
-- além de aplicar esta migration.
-- ⚠️ Aplicar no SQL Editor do Supabase (como as anteriores).
-- ══════════════════════════════════════════════════════════════════

-- Endpoint do serviço de EVENTOS (recepção de evento) — NÃO-secreto.
ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS url_recepcao_evento text;

-- Desfecho do cancelamento em public.nfce_emitidas (colunas próprias, nullable
-- — não sobrescrevem os campos da emissão original).
ALTER TABLE public.nfce_emitidas
  ADD COLUMN IF NOT EXISTS cancelada_em              timestamptz,
  ADD COLUMN IF NOT EXISTS justificativa_cancelamento text,
  ADD COLUMN IF NOT EXISTS protocolo_cancelamento    text,
  ADD COLUMN IF NOT EXISTS xml_evento                text;  -- procEventoNFe (documento durável do evento)
