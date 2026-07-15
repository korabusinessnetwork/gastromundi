-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — configuração fiscal POR TENANT (Leva 1)
-- Integração direta SEFAZ (gratuita) · multi-tenant (decisão 002/028)
-- white-label (decisão 017) · encaixe do stub fiscal.js (F019)
--
-- Cada estabelecimento emite com a SUA identidade fiscal: CNPJ, IE,
-- regime tributário, série, ambiente. Nada disso pode ser hardcoded (é
-- SaaS multi-estabelecimento) — vive aqui, uma linha por tenant.
--
-- ┌─ FRONTEIRA DE SEGREDO (importante) ──────────────────────────────┐
-- │ Esta tabela guarda só a identidade fiscal NÃO-secreta (CNPJ, IE,  │
-- │ endereço, série, ambiente, o idToken do CSC). O que é SEGREDO —   │
-- │ o certificado digital A1 e o VALOR do CSC — NÃO entra aqui: vai   │
-- │ para armazenamento seguro (Supabase Vault / secret da Edge        │
-- │ Function) na Leva 3. Certificado em tabela lida pelo app seria    │
-- │ vazamento (CLAUDE.md: nunca expor secret ao front).              │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Nasce em AMBIENTE 2 (homologação) e ativo=false: nenhum tenant emite
-- nota com valor fiscal por engano antes de estar configurado e ligado
-- de propósito (prevenção de erro > erro — Princípio nº1).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + policies com DROP ... IF EXISTS.
-- RLS: habilitada e com policies aqui — não precisa mexer no painel.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tenant_fiscal_config (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identidade do emitente
  cnpj             text,
  ie               text,          -- inscrição estadual
  im               text,          -- inscrição municipal (ISS, opcional)
  razao_social     text,
  nome_fantasia    text,
  -- CRT — Código do Regime Tributário: 1=Simples Nacional,
  -- 2=Simples Nacional (excesso de sublimite), 3=Regime Normal.
  -- Decide o grupo de ICMS no XML (CSOSN x CST) na Leva 2.
  crt              smallint,

  -- Endereço fiscal do emitente (obrigatório no XML)
  uf               text NOT NULL DEFAULT 'RS',
  codigo_municipio text,          -- IBGE, 7 dígitos
  municipio        text,
  logradouro       text,
  numero_end       text,
  complemento      text,
  bairro           text,
  cep              text,
  fone             text,

  -- Parâmetros de emissão
  -- tpAmb — 1=produção, 2=homologação. Nasce em 2 (seguro).
  ambiente         smallint NOT NULL DEFAULT 2,
  serie            integer  NOT NULL DEFAULT 1,
  proximo_numero   integer  NOT NULL DEFAULT 1,   -- próximo nNF a emitir
  -- idToken do CSC (identificador, NÃO o segredo). O valor do CSC é
  -- secret e vive fora daqui (Leva 3).
  csc_id           text,

  -- Endpoints da SEFAZ (públicos, por UF e por ambiente). Não são
  -- segredo — são infraestrutura da UF. Ficam por-tenant para o
  -- white-label multi-UF (cada estabelecimento aponta pra sua SEFAZ):
  --   url_qrcode      → URL de consulta impressa no QR do cupom
  --   url_autorizacao → webservice NFeAutorizacao4 (transmissão)
  -- Preenchidos ao configurar o fiscal, junto com o certificado (Leva 3).
  url_qrcode       text,
  url_autorizacao  text,

  -- Só emite de verdade quando configurado e ligado de propósito.
  ativo            boolean  NOT NULL DEFAULT false,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_fiscal_crt_valido      CHECK (crt IS NULL OR crt IN (1, 2, 3)),
  CONSTRAINT tenant_fiscal_ambiente_valido CHECK (ambiente IN (1, 2)),
  CONSTRAINT tenant_fiscal_serie_positiva  CHECK (serie >= 1),
  CONSTRAINT tenant_fiscal_numero_positivo CHECK (proximo_numero >= 1)
);

ALTER TABLE public.tenant_fiscal_config ENABLE ROW LEVEL SECURITY;

-- ── Leitura: membros do próprio tenant + super-admin (Console) ─────
-- O plataforma (tenant_id NULL) lê via is_super_admin() para a visão
-- agregada; membros do tenant leem a config do próprio estabelecimento.
DROP POLICY IF EXISTS "fiscal_config_select" ON public.tenant_fiscal_config;
CREATE POLICY "fiscal_config_select" ON public.tenant_fiscal_config
  FOR SELECT
  USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin());

-- ── Escrita: só o admin do PRÓPRIO tenant configura o fiscal ───────
-- gastro_role='admin' E a linha é do tenant do chamador. Sem ramo de
-- super-admin na escrita: cada estabelecimento configura o seu.
DROP POLICY IF EXISTS "fiscal_config_write_admin" ON public.tenant_fiscal_config;
CREATE POLICY "fiscal_config_write_admin" ON public.tenant_fiscal_config
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'
    AND tenant_id = public.tenant_atual_id()
  );

-- NOTA: a emissão em si (Leva 3) roda na Edge Function com service_role,
-- que ignora RLS — estas policies protegem a TELA de configuração no app,
-- não o caminho de emissão.
