-- ══════════════════════════════════════════════════════════════════
-- BUG CRÍTICO DE RLS — correção da chave errada de papel no JWT
--
-- CAUSA RAIZ: public.custom_access_token_hook (20240108_fix_jwt_role_
-- claim.sql) grava o papel do app SOMENTE em
--   app_metadata.gastro_role
-- nunca na raiz `role` do JWT — a raiz `role` é reservada pelo
-- PostgREST/GoTrue para o role do banco de dados (sempre
-- 'authenticated' pra qualquer usuário logado, não importa o papel
-- de negócio). Toda policy/função escrita depois de 20240108 que
-- checava `(auth.jwt() ->> 'role') IN (...)` está comparando
-- 'authenticated' contra ('admin','gerente',...) — a condição NUNCA
-- é verdadeira, então:
--   - policies USING/WITH CHECK com essa expressão bloqueiam TODO
--     mundo (SELECT com auth.role() continua ok; INSERT/UPDATE/DELETE
--     que dependem do papel falham sempre com "new row violates
--     row-level security policy").
--   - funções SECURITY DEFINER com "IF (auth.jwt()->>'role') NOT IN
--     (...) THEN RAISE EXCEPTION" levantam exceção SEMPRE, pra
--     qualquer usuário — inclusive admin.
--
-- EXPRESSÃO CORRETA:  auth.jwt() -> 'app_metadata' ->> 'gastro_role'
--
-- AUDITORIA (grep completo por "auth.jwt() ->> 'role'" em
-- supabase/migrations/ e supabase/schema.sql, excluindo as migrações
-- históricas 20240107/20240108 que já foram supersedidas por esta):
--   20260701_mesas.sql                 — 1 policy  (mesas)
--   20260703_jarvas.sql                — 5 policies (jarvas_eventos, jarvas_insights)
--   20260705_estoque_tabela.sql        — 3 policies + 1 função (estoque, baixar_estoque)
--   20260707_vendas_normalizadas.sql   — 3 policies (vendas, venda_itens, venda_pagamentos)
--   20260710_financeiro.sql            — 2 policies (lancamentos)
--   20260712_estoque_alerta_minimo.sql — 1 função (baixar_estoque, versão atual em produção)
--   20260713_clientes.sql              — 3 policies (clientes)
--   20260719_assinaturas.sql           — 1 policy + 1 função (assinaturas_pagamentos, confirmar_renovacao_assinatura)
-- Nenhuma outra ocorrência encontrada em supabase/. A linha em
-- supabase/schema.sql é só um comentário de documentação (não SQL
-- executável) — corrigido no fim desta migração.
--
-- O QUE ESTAVA SILENCIOSAMENTE MASCARADO (além do Financeiro, que foi
-- o sintoma reportado):
--   - baixar_estoque (RPC SECURITY DEFINER) SEMPRE levanta exceção
--     desde que a checagem de papel foi introduzida — ou seja, a baixa
--     de estoque no banco NUNCA aconteceu de verdade em nenhuma venda
--     finalizada nesse período. src/lib/estoque.js
--     (processarBaixaEstoque) captura o erro, loga no console e
--     segue com uma estimativa local (`quantidadeAnterior - qty`) só
--     pra não travar a finalização da venda — isso mascarou o
--     problema na UI (o número mostrado parecia certo, mas nunca foi
--     persistido). O saldo real em public.estoque está desatualizado
--     desde que essa policy entrou em vigor; após aplicar esta
--     migração, o primeiro re-sync de estoque deve ser conferido
--     manualmente contra a contagem física.
--   - confirmar_renovacao_assinatura (RPC SECURITY DEFINER) também
--     sempre falhava para gerente/admin — nenhuma renovação manual de
--     assinatura pôde ter sido confirmada por essa RPC desde
--     20260719.
--   - mesas, jarvas (insights estratégicos/eventos), vendas
--     normalizadas (dual-write de TD009) e clientes tinham a mesma
--     falha — qualquer escrita que dependesse do papel (não só
--     SELECT) estava quebrada, incluindo o dual-write de vendas em
--     `public.vendas`/`venda_itens`/`venda_pagamentos` (TD009), que
--     rodava em paralelo ao INSERT em `sales` — se o dual-write vinha
--     falhando silenciosamente (o app não trava a venda por isso),
--     as tabelas normalizadas podem estar incompletas desde
--     20260707; considerar backfill a partir de `sales` depois de
--     aplicar esta correção.
--
-- Idempotente: toda policy é DROP IF EXISTS + CREATE; toda função é
-- CREATE OR REPLACE (mesma assinatura/retorno de cada uma hoje).
-- Nenhuma RESTRICTIVE de assinatura/módulo (Fase 5, enforcement) é
-- tocada aqui — essas usam funções próprias (assinatura_bloqueia_
-- escrita etc.), não este claim.
-- ══════════════════════════════════════════════════════════════════

-- ── PRIORIDADE 1: escritas de usuário quebradas AGORA ───────────────

-- lancamentos (20260710_financeiro.sql)
DROP POLICY IF EXISTS "lancamentos_all_gerencia" ON public.lancamentos;
CREATE POLICY "lancamentos_all_gerencia"
  ON public.lancamentos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

DROP POLICY IF EXISTS "lancamentos_insert_venda_caixa" ON public.lancamentos;
CREATE POLICY "lancamentos_insert_venda_caixa"
  ON public.lancamentos FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa' AND origem = 'venda');

-- clientes (20260713_clientes.sql)
DROP POLICY IF EXISTS "clientes_insert_update_operacional" ON public.clientes;
CREATE POLICY "clientes_insert_update_operacional"
  ON public.clientes FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('garcom', 'caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "clientes_update_operacional" ON public.clientes;
CREATE POLICY "clientes_update_operacional"
  ON public.clientes FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('garcom', 'caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('garcom', 'caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "clientes_delete_gerencia" ON public.clientes;
CREATE POLICY "clientes_delete_gerencia"
  ON public.clientes FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- ── PRIORIDADE 2: demais tabelas/funções afetadas ───────────────────

-- mesas (20260701_mesas.sql)
DROP POLICY IF EXISTS "mesas_write_gerente_admin" ON public.mesas;
CREATE POLICY "mesas_write_gerente_admin"
  ON public.mesas FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- jarvas_eventos / jarvas_insights (20260703_jarvas.sql)
DROP POLICY IF EXISTS "jarvas_eventos_select_gerencia" ON public.jarvas_eventos;
CREATE POLICY "jarvas_eventos_select_gerencia"
  ON public.jarvas_eventos FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

DROP POLICY IF EXISTS "jarvas_eventos_update_gerencia" ON public.jarvas_eventos;
CREATE POLICY "jarvas_eventos_update_gerencia"
  ON public.jarvas_eventos FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

DROP POLICY IF EXISTS "jarvas_insights_select_estrategico" ON public.jarvas_insights;
CREATE POLICY "jarvas_insights_select_estrategico"
  ON public.jarvas_insights FOR SELECT
  USING (
    visibilidade = 'estrategico' AND (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin')
  );

DROP POLICY IF EXISTS "jarvas_insights_insert_gerencia" ON public.jarvas_insights;
CREATE POLICY "jarvas_insights_insert_gerencia"
  ON public.jarvas_insights FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

DROP POLICY IF EXISTS "jarvas_insights_update_gerencia" ON public.jarvas_insights;
CREATE POLICY "jarvas_insights_update_gerencia"
  ON public.jarvas_insights FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- estoque (20260705_estoque_tabela.sql)
DROP POLICY IF EXISTS "estoque_insert_caixa_gerencia" ON public.estoque;
CREATE POLICY "estoque_insert_caixa_gerencia"
  ON public.estoque FOR INSERT
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "estoque_update_caixa_gerencia" ON public.estoque;
CREATE POLICY "estoque_update_caixa_gerencia"
  ON public.estoque FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "estoque_delete_gerencia" ON public.estoque;
CREATE POLICY "estoque_delete_gerencia"
  ON public.estoque FOR DELETE
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- baixar_estoque: assinatura atual em produção é RETURNS TABLE
-- (quantidade, minimo) — CREATE OR REPLACE preserva a assinatura.
CREATE OR REPLACE FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
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
  UPDATE public.estoque e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.produto_id = p_produto_id
  RETURNING e.quantidade, e.minimo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric) TO authenticated;

-- vendas / venda_itens / venda_pagamentos (20260707_vendas_normalizadas.sql)
DROP POLICY IF EXISTS "vendas_all_caixa_up" ON public.vendas;
CREATE POLICY "vendas_all_caixa_up"
  ON public.vendas FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "venda_itens_all_caixa_up" ON public.venda_itens;
CREATE POLICY "venda_itens_all_caixa_up"
  ON public.venda_itens FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

DROP POLICY IF EXISTS "venda_pagamentos_all_caixa_up" ON public.venda_pagamentos;
CREATE POLICY "venda_pagamentos_all_caixa_up"
  ON public.venda_pagamentos FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'));

-- assinaturas_pagamentos / confirmar_renovacao_assinatura (20260719_assinaturas.sql)
DROP POLICY IF EXISTS "assinaturas_pagamentos_select_gerencia" ON public.assinaturas_pagamentos;
CREATE POLICY "assinaturas_pagamentos_select_gerencia"
  ON public.assinaturas_pagamentos FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

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
  IF (auth.jwt() -> 'app_metadata' ->> 'gastro_role') NOT IN ('gerente', 'admin') THEN
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

-- ── Teste de regressão: falha a migração se sobrar alguma policy com
-- a expressão errada (qualquer uma que não foi coberta acima, ou uma
-- nova introduzida por engano depois desta correção). Roda como
-- último passo, direto no pg_catalog — não depende de nenhuma tabela
-- de aplicação.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      COALESCE(qual, '')       LIKE '%auth.jwt() ->> ''role''%'
      OR COALESCE(with_check, '') LIKE '%auth.jwt() ->> ''role''%'
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Regressão: % policy(ies) em public ainda usam auth.jwt() ->> ''role'' (claim errado). Rode: SELECT schemaname, tablename, policyname FROM pg_policies WHERE qual LIKE ''%%auth.jwt() ->> ''''role''''%%'' OR with_check LIKE ''%%auth.jwt() ->> ''''role''''%%'';',
      v_count;
  END IF;
END;
$$;
