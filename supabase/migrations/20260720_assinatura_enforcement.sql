-- ══════════════════════════════════════════════════════════════════
-- Camada de Comercialização — Fase 5 (enforcement real da assinatura)
-- docs/08_DECISOES/adr-006.md §4 · docs/09_BACKLOG/plano_tecnico_comercializacao.md
--
-- Esta é a fase que BLOQUEIA de verdade. Decisão do founder (ADR-006,
-- decisão 024): bloqueio TOTAL — quando a assinatura está 'bloqueado',
-- nenhuma leitura NEM escrita das tabelas operacionais é permitida,
-- não importa por onde a chamada chegue (app, SQL Editor, API direta).
-- A UI (PrivateRoute) é só cortesia; a fonte de verdade é esta migração.
--
-- CRÍTICO: `assinatura_ativa` deriva de `calcular_status_assinatura`
-- (Fase 4) EM TEMPO REAL — nunca lê a coluna `status` (cache) para
-- decidir ativo/carência/bloqueado. Só olha o cache para o caso
-- 'cancelado' (estado manual, não recalculável a partir de datas).
-- ══════════════════════════════════════════════════════════════════

-- Genérica (pronta para multi-tenant real): recebe o tenant_id.
CREATE OR REPLACE FUNCTION public.assinatura_ativa(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_data_vencimento date;
  v_carencia_dias   integer;
  v_status_cache    text;
  v_status          text;
BEGIN
  SELECT data_vencimento, carencia_dias, status
    INTO v_data_vencimento, v_carencia_dias, v_status_cache
  FROM public.assinaturas
  WHERE tenant_id = p_tenant_id;

  -- Tenant sem linha em `assinaturas` ainda (billing não configurado
  -- para ele): não bloqueia — ausência de configuração não é o mesmo
  -- que inadimplência.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- 'cancelado' é estado manual — sempre bloqueia, não depende de data.
  IF v_status_cache = 'cancelado' THEN
    RETURN false;
  END IF;

  v_status := public.calcular_status_assinatura(v_data_vencimento, v_carencia_dias);
  RETURN v_status IN ('ativo', 'carencia');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assinatura_ativa(uuid) TO authenticated;

-- Conveniência para o single-tenant de hoje (mesma convenção de
-- tenant_atual_tem_modulo/tenant_atual_tem_addon — Fases 2/3): resolve
-- sozinha o único tenant, sem exigir que toda política de RLS
-- descubra o tenant_id. Isso que entra nas policies abaixo.
CREATE OR REPLACE FUNCTION public.assinatura_atual_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.assinatura_ativa((SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1));
$$;

GRANT EXECUTE ON FUNCTION public.assinatura_atual_ativa() TO authenticated;

-- ── Enforcement — bloqueio TOTAL (leitura + escrita) ────────────────
--
-- Tabelas ENFORCED (RESTRICTIVE em SELECT/INSERT/UPDATE/DELETE — some-se
-- às políticas de papel/módulo já existentes, não as substitui):
--   sales, vendas, venda_itens, venda_pagamentos  (PDV — a venda em si)
--   pending                                        (comandas em aberto)
--   lancamentos                                     (financeiro)
--   estoque                                         (estoque)
--   clientes                                        (clientes/fiado)
--   products                                        (cardápio)
--   fechamentos                                     (fechamento de caixa)
--   config                                          (estado do caixa: aberto/fechado, meios de pagamento)
--   mesas                                           (reserva de mesa do PDV)
--
-- Tabelas DELIBERADAMENTE FORA do enforcement, com o motivo:
--   tenants, assinaturas  → precisam continuar legíveis para o app
--     SABER que está bloqueado e montar a tela de aviso; bloqueá-las
--     criaria uma referência circular (não dá pra checar o bloqueio
--     lendo uma tabela que o próprio bloqueio esconde).
--   users                 → precisa continuar legível para a
--     autenticação (buscarDadosUsuario) resolver o usuário logado;
--     sem isso, o login falharia com "usuário não encontrado", uma
--     mensagem ENGANOSA em vez de "sua mensalidade está atrasada"
--     (princípio nº 1 — clareza sobre o que está acontecendo). O
--     bloqueio de verdade acontece imediatamente depois, no primeiro
--     PrivateRoute avaliado (ver App).
--   planos, planos_modulos, addons, tenant_addons → tabelas de
--     registro/lookup (Fases 2/3), não guardam dado operacional do
--     negócio do cliente; nunca foram gated por design.
--   jarvas_eventos, jarvas_insights, operator_logs → telemetria/
--     auditoria fire-and-forget (decisão 010 — Jarvas nunca bloqueia
--     a operação); manter o rastro de auditoria funcionando mesmo
--     durante o bloqueio é desejável, não um risco.
--   notas_fiscais(_itens), unidades_medida, subprodutos, combos(_subprodutos),
--   locais_impressao, categorias_roteamento, estoque_entradas, itens_fiscal
--     → cadastro/administração secundária (fichas técnicas, impressão,
--     fiscal por produto); fora do escopo desta passada — podem entrar
--     numa iteração futura se fizer sentido, sem risco para esta fase.
--
-- Implementado via loop (DO block) em vez de 9×4 CREATE POLICY
-- manuais: menos risco de erro de digitação, e a lista de tabelas
-- enforced fica num único lugar auditável.

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'sales', 'vendas', 'venda_itens', 'venda_pagamentos',
    'pending', 'lancamentos', 'estoque', 'clientes',
    'products', 'fechamentos', 'config', 'mesas'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_assinatura_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT USING (public.assinatura_atual_ativa())',
      t || '_assinatura_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_assinatura_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (public.assinatura_atual_ativa())',
      t || '_assinatura_insert', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_assinatura_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE USING (public.assinatura_atual_ativa()) WITH CHECK (public.assinatura_atual_ativa())',
      t || '_assinatura_update', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_assinatura_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING (public.assinatura_atual_ativa())',
      t || '_assinatura_delete', t
    );
  END LOOP;
END $$;
