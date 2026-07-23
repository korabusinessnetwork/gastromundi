-- ══════════════════════════════════════════════════════════════════
-- Estações de impressão (workstations) — vínculo local→impressora no banco
-- Fase 2 do plano de impressão de comandas · decisão 002 (multi-tenant/RLS)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Na Fase 1 o vínculo "local de impressão → impressora física"      │
-- │ vivia só no localStorage de cada máquina — some ao limpar cache   │
-- │ e não acompanha troca de PC. Aqui esse vínculo passa a viver no   │
-- │ banco, por ESTAÇÃO (um PC do restaurante) e por TENANT. Cada       │
-- │ máquina guarda apenas o `estacao_id` no localStorage (qual        │
-- │ estação ela é); os vínculos vêm do banco e sobrevivem a limpar    │
-- │ cache / trocar de PC. A descoberta das impressoras continua local │
-- │ (QZ Tray, físicas da máquina) — só o VÍNCULO é que foi pro banco. │
-- └───────────────────────────────────────────────────────────────────┘
--
-- `impressoras` (jsonb) mapeia local_impressao_id → { "nome": "<impressora>" }:
--   { "0b1e…": { "nome": "EPSON TM-T20 (Cozinha)" }, "9a2c…": { "nome": "Balcao" } }
--
-- PRÉ-REQUISITOS: Leva 1/2 do multi-tenant aplicadas — public.tenants,
-- public.tenant_atual_id() e o claim app_metadata.gastro_role no JWT
-- (mesmo padrão de mesas/grupos_categoria).
--
-- Idempotente: CREATE TABLE/POLICY IF NOT EXISTS, DROP POLICY IF EXISTS,
-- constraint adicionada só se não existir.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: as policies abaixo já isolam por tenant e por papel — confira
--    no painel (Authentication → Policies) que RLS ficou habilitada.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.estacoes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- tenant_id resolve o estabelecimento do JWT por requisição; NOT NULL fecha
  tenant_id   uuid        NOT NULL DEFAULT public.tenant_atual_id()
                          REFERENCES public.tenants(id),
  nome        text        NOT NULL,
  -- { [local_impressao_id]: { "nome": "<impressora>" } }
  impressoras jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Nome único POR tenant (dois estabelecimentos podem ter "Caixa 1").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estacoes_tenant_nome_key'
      AND conrelid = 'public.estacoes'::regclass
  ) THEN
    ALTER TABLE public.estacoes
      ADD CONSTRAINT estacoes_tenant_nome_key UNIQUE (tenant_id, nome);
  END IF;
END $$;

-- ── 2. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.estacoes ENABLE ROW LEVEL SECURITY;

-- Qualquer logado lê (a estação/vínculo é usada na hora de imprimir).
DROP POLICY IF EXISTS estacoes_select_auth ON public.estacoes;
CREATE POLICY estacoes_select_auth
  ON public.estacoes FOR SELECT
  USING (auth.role() = 'authenticated');

-- Gerente e admin configuram as estações (cadastrar PC + vincular impressoras).
DROP POLICY IF EXISTS estacoes_write_gerencia ON public.estacoes;
CREATE POLICY estacoes_write_gerencia
  ON public.estacoes FOR ALL
  USING      ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- Isolamento por tenant (RESTRICTIVE → soma AND às policies de papel acima).
DROP POLICY IF EXISTS estacoes_tenant_isolation ON public.estacoes;
CREATE POLICY estacoes_tenant_isolation
  ON public.estacoes AS RESTRICTIVE FOR ALL
  USING      (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());
