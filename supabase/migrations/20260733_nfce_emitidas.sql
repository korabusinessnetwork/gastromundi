-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — persistência das notas emitidas + fila de
-- contingência (Leva 8) · multi-tenant (decisão 002/028) · white-label
-- (decisão 017) · tenant_fiscal_config (20260731)
--
-- Toda emissão com desfecho vira uma linha DURÁVEL por tenant:
--   • autorizada → guarda o nfeProc (documento final) para REIMPRESSÃO;
--   • rejeitada  → trilha de auditoria (cStat/xMotivo), sem reenvio;
--   • pendente   → FILA de contingência/reenvio (Leva 9): a nota saiu em
--                  contingência offline (tpEmis=9) ou a transmissão online
--                  falhou; o xmlAssinado fica guardado para retransmitir
--                  quando a SEFAZ voltar.
--
-- DOMÍNIO: é a nota de VENDA (NFC-e, modelo 65) que o estabelecimento
-- EMITE ao consumidor — não é documento de entrada/compra. Uma linha por
-- nota (chave de acesso), ligada opcionalmente à venda do PDV (venda_id).
--
-- ┌─ FRONTEIRA DE SEGREDO (importante) ──────────────────────────────┐
-- │ Esta tabela guarda só DOCUMENTO PÚBLICO: o XML (nfeProc autorizado │
-- │ ou o XML assinado a reenviar), chave, protocolo, urlQrCode (já     │
-- │ hasheada — não revela o CSC) e o motivo. NUNCA entra aqui o        │
-- │ certificado A1, o .pfx, a senha nem o VALOR do CSC — esses são     │
-- │ segredos e vivem só no Vault/secret da Edge (CLAUDE.md: nunca      │
-- │ expor secret ao front, e esta tabela É lida pelo app).            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + policies com DROP ... IF EXISTS.
-- RLS: habilitada e com policies aqui — não precisa mexer no painel.
-- PRÉ-REQUISITOS: tenants, tenant_atual_id() e is_super_admin()
-- (20260723/20260730).
-- ⚠️ Aplicar no SQL Editor do Supabase (como a 20260732). A RLS já vem na
--    migration; nenhum passo extra no painel.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.nfce_emitidas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Link à venda do PDV (pode ser null em reenvios avulsos / sem venda).
  venda_id      uuid,

  -- Identificação fiscal da nota
  chave         text,      -- 44 dígitos (numa emissão real sempre há chave)
  numero        integer,   -- nNF
  serie         integer,

  -- status:
  --   autorizada — SEFAZ autorizou (tem protocolo + nfeProc)
  --   rejeitada  — SEFAZ rejeitou (trilha; sem reenvio)
  --   pendente   — fila de contingência/reenvio (Leva 9)
  --   cancelada  — nota cancelada posteriormente (evento futuro)
  status        text NOT NULL,

  -- Ambiente/emissão
  tp_amb        smallint,  -- 1=produção, 2=homologação
  tp_emis       smallint,  -- 1=normal, 9=contingência offline

  -- Retorno da SEFAZ
  protocolo     text,
  c_stat        text,
  x_motivo      text,

  -- Valores / data
  v_nf          numeric(12,2),
  dh_emi        timestamptz,

  -- Consulta pública (QR já hasheado no servidor — não expõe o CSC)
  url_qrcode    text,

  -- Documento XML público. xml_tipo diz o que está guardado:
  --   'proc'     → nfeProc autorizado (NFe assinada + protNFe) p/ reimpressão
  --   'assinado' → XML assinado aguardando retransmissão (fila pendente)
  xml           text,
  xml_tipo      text,

  -- Fila de reenvio
  tentativas    integer NOT NULL DEFAULT 0,
  motivo        text,               -- por que entrou na fila (ex.: sefaz_indisponivel)
  transmitida_em timestamptz,       -- quando foi autorizada de fato

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nfce_emitidas_status_valido
    CHECK (status IN ('autorizada', 'rejeitada', 'pendente', 'cancelada')),
  CONSTRAINT nfce_emitidas_xml_tipo_valido
    CHECK (xml_tipo IS NULL OR xml_tipo IN ('proc', 'assinado')),
  -- Idempotência da gravação: uma nota (chave) por tenant. A Edge usa
  -- ON CONFLICT (tenant_id, chave) para não duplicar num reenvio.
  CONSTRAINT nfce_emitidas_chave_unica UNIQUE (tenant_id, chave)
);

-- Busca da fila de reenvio (Leva 9): pendentes do tenant por data.
CREATE INDEX IF NOT EXISTS nfce_emitidas_pendentes_idx
  ON public.nfce_emitidas (tenant_id, status)
  WHERE status = 'pendente';

-- Reimpressão a partir da venda do PDV.
CREATE INDEX IF NOT EXISTS nfce_emitidas_venda_idx
  ON public.nfce_emitidas (tenant_id, venda_id);

ALTER TABLE public.nfce_emitidas ENABLE ROW LEVEL SECURITY;

-- ── Leitura: membros do próprio tenant + super-admin (Console) ─────
DROP POLICY IF EXISTS "nfce_emitidas_select" ON public.nfce_emitidas;
CREATE POLICY "nfce_emitidas_select" ON public.nfce_emitidas
  FOR SELECT
  USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin());

-- ── Inserção: por MEMBRO do próprio tenant (o caixa emite sob o seu ──
-- token). Sem exigir gastro_role='admin' e sem ramo de super-admin: quem
-- grava a nota é quem a emite, e só na própria linha do tenant.
DROP POLICY IF EXISTS "nfce_emitidas_insert" ON public.nfce_emitidas;
CREATE POLICY "nfce_emitidas_insert" ON public.nfce_emitidas
  FOR INSERT
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- ── Atualização: idem — reenvio/cancelamento atualiza a própria linha ──
DROP POLICY IF EXISTS "nfce_emitidas_update" ON public.nfce_emitidas;
CREATE POLICY "nfce_emitidas_update" ON public.nfce_emitidas
  FOR UPDATE
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());
