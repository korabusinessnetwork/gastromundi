-- ══════════════════════════════════════════════════════════════════
-- B4 — Estoque de subprodutos (combos baixam estoque dos componentes)
--
-- Contexto: subprodutos têm o toggle `controla_estoque`, mas não
-- existia onde guardar o saldo — `estoque.produto_id` é bigint (FK
-- para products) e subprodutos usam uuid. Esta migração cria a tabela
-- de saldo por subproduto (mesmo shape de public.estoque, 20260705)
-- e a RPC de decremento atômico (mesmo contrato de baixar_estoque,
-- 20260712: devolve quantidade e mínimo na mesma transação).
--
-- Multi-tenant: a tabela nasce já com tenant_id (default
-- public.tenant_atual_id(), NOT NULL) + policy RESTRICTIVE de
-- isolamento — padrão da fase 2 (20260724), já que ela não existia
-- quando o loop das 24 tabelas rodou.
--
-- ⚠️  Aplicar no painel/CLI do Supabase.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.estoque_subprodutos (
  subproduto_id uuid        PRIMARY KEY REFERENCES public.subprodutos(id) ON DELETE CASCADE,
  quantidade    numeric     NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  minimo        numeric     NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  tenant_id     uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estoque_subprodutos ENABLE ROW LEVEL SECURITY;

-- Qualquer logado lê
CREATE POLICY "estoque_subprodutos_select_auth"
  ON public.estoque_subprodutos FOR SELECT
  USING (auth.role() = 'authenticated');

-- Caixa desconta ao finalizar venda; gerente/admin também ajustam
CREATE POLICY "estoque_subprodutos_insert_caixa_gerencia"
  ON public.estoque_subprodutos FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "estoque_subprodutos_update_caixa_gerencia"
  ON public.estoque_subprodutos FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

CREATE POLICY "estoque_subprodutos_delete_gerencia"
  ON public.estoque_subprodutos FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- Isolamento por tenant (RESTRICTIVE — soma às policies de papel acima)
CREATE POLICY "estoque_subprodutos_tenant_isolation"
  ON public.estoque_subprodutos AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- ── RPC baixar_estoque_subproduto ──────────────────────────────────
-- Decremento atômico, mesmo contrato de baixar_estoque (20260712):
-- devolve quantidade e mínimo já atualizados para o app checar o
-- alerta sem segunda leitura. GREATEST(0, …) clampa em zero (oversell
-- vira alerta no app, não erro de venda).
CREATE OR REPLACE FUNCTION public.baixar_estoque_subproduto(p_subproduto_id uuid, p_qtd numeric)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- SECURITY DEFINER contorna a RLS; checagem de role explícita aqui
  IF (auth.jwt() -> 'app_metadata' ->> 'gastro_role') NOT IN ('caixa', 'gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  RETURN QUERY
  UPDATE public.estoque_subprodutos e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.subproduto_id = p_subproduto_id
     AND e.tenant_id = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.baixar_estoque_subproduto(uuid, numeric) TO authenticated;
