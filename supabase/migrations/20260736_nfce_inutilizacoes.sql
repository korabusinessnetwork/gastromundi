-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — INUTILIZAÇÃO de faixa de numeração (Leva 11,
-- NFeInutilizacao4) · multi-tenant (decisão 002/028) · white-label
-- (decisão 017) · tenant_fiscal_config (20260731)
--
-- Inutilizar é "queimar" oficialmente na SEFAZ uma faixa de nNF que pulou
-- e NUNCA virou (nem virará) nota autorizada — ex.: uma falha técnica
-- consumiu os nNF 45–48 sem emitir. A legislação exige justificar esse
-- buraco na sequência; sem isso o Fisco cobra as notas "faltantes". NÃO é
-- cancelamento (Leva 10): cancelar age sobre nota AUTORIZADA; inutilizar
-- age sobre NÚMEROS que nunca viraram nota. Sucesso = cStat 102 (homologada)
-- → guarda o procInutNFe (documento durável).
--
-- ┌─ FRONTEIRA DE SEGREDO (importante) ──────────────────────────────┐
-- │ Esta tabela guarda só DOCUMENTO PÚBLICO: faixa, justificativa,     │
-- │ protocolo, cStat/xMotivo e o xml (procInutNFe). NUNCA entra aqui o │
-- │ certificado A1, o .pfx, a senha nem o VALOR do CSC — esses são     │
-- │ segredos e vivem só no Vault/secret da Edge (CLAUDE.md: nunca      │
-- │ expor secret ao front, e esta tabela É lida pelo app).            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + policies com DROP ... IF EXISTS
-- + ADD COLUMN IF NOT EXISTS. RLS: habilitada e com policies aqui — não
-- precisa mexer no painel.
-- PRÉ-REQUISITOS: tenants, tenant_atual_id() e is_super_admin()
-- (20260723/20260730); tenant_fiscal_config (20260731/35).
-- ⚠️ Aplicar no SQL Editor do Supabase (como as anteriores). A RLS já vem na
--    migration; nenhum passo extra no painel.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.nfce_inutilizacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.tenant_atual_id()
                  REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Faixa inutilizada
  serie         integer  NOT NULL,
  nnf_ini       integer  NOT NULL,
  nnf_fin       integer  NOT NULL,
  ano           smallint NOT NULL,          -- AA (2 dígitos) do ano da faixa
  justificativa text     NOT NULL,          -- 15–255

  -- Ambiente
  tp_amb        smallint,                   -- 1=produção, 2=homologação

  -- status:
  --   inutilizada — SEFAZ homologou (cStat 102), tem protocolo + xml
  --   rejeitada   — SEFAZ rejeitou / falha de transmissão (trilha)
  status        text NOT NULL,

  -- Retorno da SEFAZ
  protocolo     text,                       -- nProt
  c_stat        text,
  x_motivo      text,

  -- Documento XML público (procInutNFe) — inutNFe assinado + retInutNFe.
  xml           text,

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nfce_inut_faixa_valida   CHECK (nnf_fin >= nnf_ini),
  CONSTRAINT nfce_inut_serie_valida   CHECK (serie >= 0),
  CONSTRAINT nfce_inut_tp_amb_valido  CHECK (tp_amb IS NULL OR tp_amb IN (1, 2)),
  CONSTRAINT nfce_inut_status_valido  CHECK (status IN ('inutilizada', 'rejeitada'))
);

-- Consulta das faixas inutilizadas do tenant por data.
CREATE INDEX IF NOT EXISTS nfce_inutilizacoes_tenant_idx
  ON public.nfce_inutilizacoes (tenant_id, created_at DESC);

ALTER TABLE public.nfce_inutilizacoes ENABLE ROW LEVEL SECURITY;

-- ── Leitura: membros do próprio tenant + super-admin (Console) ─────
DROP POLICY IF EXISTS "nfce_inutilizacoes_select" ON public.nfce_inutilizacoes;
CREATE POLICY "nfce_inutilizacoes_select" ON public.nfce_inutilizacoes
  FOR SELECT
  USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin());

-- ── Escrita: só o admin do PRÓPRIO tenant inutiliza (ação fiscal rara e
-- deliberada de gestor). gastro_role='admin' E a linha é do tenant do
-- chamador — espelha a fiscal_config_write_admin (20260731). A Edge roda
-- user-scoped (ANON_KEY + Authorization), então a RLS aplica o INSERT.
DROP POLICY IF EXISTS "nfce_inutilizacoes_write_admin" ON public.nfce_inutilizacoes;
CREATE POLICY "nfce_inutilizacoes_write_admin" ON public.nfce_inutilizacoes
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- ── Endpoint do serviço de INUTILIZAÇÃO (NFeInutilizacao4) — NÃO-secreto.
-- Fecha a Leva 13: a coluna não existia quando o PainelFiscal foi feito, por
-- isso o endpoint ficou de fora; agora ele existe e a tela o expõe.
ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS url_inutilizacao text;
