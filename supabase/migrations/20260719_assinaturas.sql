-- ══════════════════════════════════════════════════════════════════
-- Camada de Comercialização — Fase 4 (billing: assinatura, mensalidade,
-- ciclo e cálculo de status)
-- docs/08_DECISOES/adr-006.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md
--
-- SEM ENFORCEMENT AINDA — esta migração só modela dados e calcula
-- status. Nenhuma política de escrita das tabelas operacionais muda
-- aqui; o bloqueio real (RLS ligada a assinatura_ativa) é a Fase 5.
--
-- Decisões do founder incorporadas (ADR-006 §"Questões em Aberto —
-- RESOLVIDAS", decisão 024):
--   - carência = 3 dias (carencia_dias default 3)
--   - status é DERIVADO NA CONSULTA a partir de data_vencimento +
--     carencia_dias — nunca de uma coluna que dependeria de job.
--     `status` aqui é só um CACHE para telas administrativas; a
--     função pura `calcular_status_assinatura` é a fonte de verdade,
--     e será chamada de novo (sem cache) na Fase 5 para o enforcement.
--   - renovação é manual nesta fase (RPC confirmar_renovacao_assinatura),
--     sem gateway de pagamento pago (Restrições de Custo).
--
-- Add-ons (NF-e/TEF, decisão 019, Fase 3) NÃO vivem aqui — ciclo e
-- cobrança independentes da mensalidade do plano (ver ADR-006 §1).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.assinaturas (
  tenant_id        uuid        PRIMARY KEY REFERENCES public.tenants(id),
  valor_mensal     numeric     NOT NULL DEFAULT 0,
  ciclo_dias       integer     NOT NULL DEFAULT 30,
  data_inicio      date        NOT NULL DEFAULT current_date,
  data_vencimento  date        NOT NULL,
  status           text        NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo', 'carencia', 'bloqueado', 'cancelado')),
  carencia_dias    integer     NOT NULL DEFAULT 3,
  ultima_renovacao date,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

-- Histórico de ciclos pagos — auditoria e futura integração com gateway.
CREATE TABLE IF NOT EXISTS public.assinaturas_pagamentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id),
  competencia    date        NOT NULL,
  valor          numeric     NOT NULL,
  metodo         text,
  confirmado_por text,
  confirmado_em  timestamptz NOT NULL DEFAULT now()
);

-- Seed: assinatura ATIVA para o tenant atual, vencimento 30 dias à
-- frente — não afeta a operação de hoje (status calculado = 'ativo').
-- `valor_mensal` nasce em 0 (placeholder): ajustar para o preço real
-- antes de cobrar qualquer cliente de verdade — não é usado em
-- nenhum cálculo de status/enforcement, só é dado informativo/billing.
INSERT INTO public.assinaturas (tenant_id, valor_mensal, data_inicio, data_vencimento)
SELECT id, 0, current_date, current_date + 30
FROM public.tenants
WHERE NOT EXISTS (SELECT 1 FROM public.assinaturas)
ORDER BY created_at ASC
LIMIT 1;

ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinaturas_select_auth" ON public.assinaturas;
CREATE POLICY "assinaturas_select_auth"
  ON public.assinaturas FOR SELECT
  USING (auth.role() = 'authenticated');
-- Sem política de escrita pelo app: a única forma de mudar
-- data_vencimento/status é a RPC confirmar_renovacao_assinatura
-- (SECURITY DEFINER, com checagem de role) ou a sincronização de
-- cache (sincronizar_status_assinatura) — nunca update direto.

ALTER TABLE public.assinaturas_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinaturas_pagamentos_select_gerencia" ON public.assinaturas_pagamentos;
CREATE POLICY "assinaturas_pagamentos_select_gerencia"
  ON public.assinaturas_pagamentos FOR SELECT
  USING ((auth.jwt() ->> 'role') IN ('gerente', 'admin'));

-- ── Cálculo de status (fonte de verdade — nunca depende de job) ─────

-- Pura: mesma lógica espelhada em src/lib/assinatura.js
-- (calcularStatusAssinatura) para poder ser testada sem Postgres.
CREATE OR REPLACE FUNCTION public.calcular_status_assinatura(
  p_data_vencimento date,
  p_carencia_dias integer,
  p_hoje date DEFAULT current_date
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_hoje <= p_data_vencimento THEN 'ativo'
    WHEN p_hoje <= p_data_vencimento + p_carencia_dias THEN 'carencia'
    ELSE 'bloqueado'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_status_assinatura(date, integer, date) TO authenticated;

-- Sincroniza o CACHE (coluna `status`) com o status calculado — usada
-- de forma lazy a partir do bootstrap (Questão 3 do ADR-006, resolvida:
-- sem pg_cron nesta fase). Nunca é a fonte de verdade do enforcement
-- (isso é calcular_status_assinatura, chamada direto na Fase 5); serve
-- só para telas administrativas/relatórios não mostrarem um cache
-- visivelmente desatualizado.
CREATE OR REPLACE FUNCTION public.sincronizar_status_assinatura(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data_vencimento  date;
  v_carencia_dias    integer;
  v_status_atual     text;
  v_status_calculado text;
BEGIN
  SELECT data_vencimento, carencia_dias, status
    INTO v_data_vencimento, v_carencia_dias, v_status_atual
  FROM public.assinaturas
  WHERE tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 'cancelado' é manual — nunca recalculado a partir de datas.
  IF v_status_atual = 'cancelado' THEN
    RETURN v_status_atual;
  END IF;

  v_status_calculado := public.calcular_status_assinatura(v_data_vencimento, v_carencia_dias);

  IF v_status_calculado IS DISTINCT FROM v_status_atual THEN
    UPDATE public.assinaturas SET status = v_status_calculado WHERE tenant_id = p_tenant_id;
  END IF;

  RETURN v_status_calculado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sincronizar_status_assinatura(uuid) TO authenticated;

-- ── Renovação manual (sem gateway pago nesta fase) ──────────────────

-- Registra o pagamento confirmado FORA do sistema (Pix/transferência)
-- e empurra o vencimento por um ciclo. Restrito a gerente/admin —
-- SECURITY DEFINER contorna a RLS, checagem de role explícita aqui
-- (mesmo padrão de baixar_estoque, 20260705_estoque_tabela.sql).
CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(
  p_tenant_id uuid,
  p_competencia date,
  p_valor numeric,
  p_metodo text,
  p_confirmado_por text
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ciclo  integer;
  v_result public.assinaturas;
BEGIN
  IF (auth.jwt() ->> 'role') NOT IN ('gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para confirmar renovação de assinatura.';
  END IF;

  SELECT ciclo_dias INTO v_ciclo FROM public.assinaturas WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada para o tenant %.', p_tenant_id;
  END IF;

  INSERT INTO public.assinaturas_pagamentos (tenant_id, competencia, valor, metodo, confirmado_por)
  VALUES (p_tenant_id, p_competencia, p_valor, p_metodo, p_confirmado_por);

  UPDATE public.assinaturas
    SET data_vencimento  = data_vencimento + v_ciclo,
        status           = 'ativo',
        ultima_renovacao = current_date
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text) TO authenticated;
