-- ══════════════════════════════════════════════════════════════════
-- Fila de impressão em rede — trabalhos_impressao
-- Fase 3 do plano de impressão de comandas · decisão 002 (multi-tenant/RLS)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Nas Fases 1/2 cada máquina imprime as vias dos locais vinculados │
-- │ NELA. Um local vinculado no PC do bar não sai no PC do caixa.     │
-- │ Aqui entra a FILA: quando uma via é roteada para um local que    │
-- │ NÃO está vinculado na máquina que gerou o pedido, ela vira um     │
-- │ `trabalho_impressao` pendente. A máquina DONA daquele local       │
-- │ (cuja estação tem binding pra ele) faz poll de 5s, reivindica o   │
-- │ trabalho (claim atômico) e imprime. Local vinculado na própria    │
-- │ máquina continua imprimindo na hora (rápido/offline) — a fila só  │
-- │ carrega o que é "remoto". Recurso opt-in (config_impressao        │
-- │ .impressaoEmRede = false por padrão) → desligado = Fase 2 intacta.│
-- └───────────────────────────────────────────────────────────────────┘
--
-- `documento` (jsonb) guarda a saída autocontida de montarViaProducao
-- (tipo/comanda/mesa/itens…) — qualquer máquina imprime sem recalcular.
--
-- PRÉ-REQUISITOS: Leva 1/2 do multi-tenant aplicadas — public.tenants,
-- public.tenant_atual_id() e o claim app_metadata.gastro_role no JWT
-- (mesmo padrão de estacoes/mesas/grupos_categoria).
--
-- Idempotente: CREATE TABLE/INDEX/POLICY IF NOT EXISTS, DROP POLICY IF EXISTS,
-- constraint adicionada só se não existir.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: as policies abaixo já isolam por tenant e por papel — confira
--    no painel (Authentication → Policies) que RLS ficou habilitada.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trabalhos_impressao (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- tenant_id resolve o estabelecimento do JWT por requisição; NOT NULL fecha
  tenant_id          uuid        NOT NULL DEFAULT public.tenant_atual_id()
                                 REFERENCES public.tenants(id),
  -- destino do trabalho: a máquina que "possui" este local o imprime
  local_impressao_id uuid        NOT NULL,
  -- via de produção autocontida (montarViaProducao) — imprimível como está
  documento          jsonb       NOT NULL,
  -- pendente → processando (reivindicado) → impresso | erro
  status             text        NOT NULL DEFAULT 'pendente',
  tentativas         int         NOT NULL DEFAULT 0,
  erro               text,
  -- estação que reivindicou/imprimiu (auditoria; Fase 4 usa)
  estacao_id         uuid,
  criado_em          timestamptz DEFAULT now(),
  atualizado_em      timestamptz DEFAULT now(),
  impresso_em        timestamptz
);

-- status restrito ao conjunto conhecido (defensivo contra escrita torta).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trabalhos_impressao_status_check'
      AND conrelid = 'public.trabalhos_impressao'::regclass
  ) THEN
    ALTER TABLE public.trabalhos_impressao
      ADD CONSTRAINT trabalhos_impressao_status_check
      CHECK (status IN ('pendente', 'processando', 'impresso', 'erro'));
  END IF;
END $$;

-- Poll da fila filtra por (tenant, status, local) — índice casa a query.
CREATE INDEX IF NOT EXISTS trabalhos_impressao_fila_idx
  ON public.trabalhos_impressao (tenant_id, status, local_impressao_id);

-- ── 2. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.trabalhos_impressao ENABLE ROW LEVEL SECURITY;

-- Qualquer logado LÊ (o poll acontece em qualquer PC operando).
DROP POLICY IF EXISTS trabalhos_impressao_select_auth ON public.trabalhos_impressao;
CREATE POLICY trabalhos_impressao_select_auth
  ON public.trabalhos_impressao FOR SELECT
  USING (auth.role() = 'authenticated');

-- Qualquer logado ENFILEIRA (o caixa/PDV gera o trabalho ao lançar o pedido).
DROP POLICY IF EXISTS trabalhos_impressao_insert_auth ON public.trabalhos_impressao;
CREATE POLICY trabalhos_impressao_insert_auth
  ON public.trabalhos_impressao FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Qualquer logado ATUALIZA (a estação dona reivindica/marca impresso/erro).
DROP POLICY IF EXISTS trabalhos_impressao_update_auth ON public.trabalhos_impressao;
CREATE POLICY trabalhos_impressao_update_auth
  ON public.trabalhos_impressao FOR UPDATE
  USING      (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Limpeza/expurgo da fila é de gerente/admin (operação de manutenção).
DROP POLICY IF EXISTS trabalhos_impressao_delete_gerencia ON public.trabalhos_impressao;
CREATE POLICY trabalhos_impressao_delete_gerencia
  ON public.trabalhos_impressao FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- Isolamento por tenant (RESTRICTIVE → soma AND às policies acima).
DROP POLICY IF EXISTS trabalhos_impressao_tenant_isolation ON public.trabalhos_impressao;
CREATE POLICY trabalhos_impressao_tenant_isolation
  ON public.trabalhos_impressao AS RESTRICTIVE FOR ALL
  USING      (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());
