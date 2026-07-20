-- ══════════════════════════════════════════════════════════════════
-- Delivery — CORREÇÃO de RLS: faltava a policy PERMISSIVE de papel.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: pode rodar de novo sem erro.
--
-- PROBLEMA (403 ao importar/cadastrar cardápio):
--   A 20260804 criou as tabelas do Delivery com RLS + apenas uma policy
--   RESTRICTIVE de isolamento por tenant. No PostgreSQL, uma policy
--   RESTRICTIVE só RESTRINGE (AND) linhas já liberadas por alguma policy
--   PERMISSIVE. Sem NENHUMA permissive, o resultado é "nega tudo" — por
--   isso o INSERT em produto_delivery voltava 403.
--   As tabelas ANTIGAS (products, config, sales…) já tinham as permissive
--   de papel da 20240107, e por isso a mesma RESTRICTIVE funcionava nelas;
--   as tabelas NOVAS do Delivery nasceram sem essa base.
--
-- SOLUÇÃO:
--   Adicionar as policies PERMISSIVE de papel que faltavam, espelhando o
--   padrão já usado no cardápio/operação do PDV:
--     • Gestão do cardápio (config_delivery, produto_delivery,
--       grupos_complemento, complementos) → igual a `products`/`config`:
--         leitura para authenticated; escrita para gerente/admin.
--     • Pedidos (delivery_pedidos, delivery_pedido_itens) → igual a
--       `sales`: leitura para authenticated; escrita para caixa/gerente/admin.
--       (O cliente público cria o pedido via RPC SECURITY DEFINER, que
--        ignora RLS; aqui liberamos só o que o painel de operação faz
--        direto — listar e avançar status.)
--
--   A RESTRICTIVE de tenant da 20260804 CONTINUA valendo (soma via AND):
--   cada papel só enxerga/escreve dentro do próprio tenant.
-- ══════════════════════════════════════════════════════════════════

-- ── Gestão do cardápio: leitura authenticated + escrita gerente/admin ──
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'config_delivery', 'produto_delivery', 'grupos_complemento', 'complementos'
  ] LOOP
    -- SELECT para qualquer autenticado (o tenant já é filtrado pela RESTRICTIVE).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT '
      'USING (auth.role() = ''authenticated'')',
      tbl || '_select_auth', tbl);

    -- Escrita (INSERT/UPDATE/DELETE) só para gerente/admin (dono do cardápio).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_write_gerente_admin', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING ((auth.jwt() ->> ''role'') IN (''gerente'', ''admin'')) '
      'WITH CHECK ((auth.jwt() ->> ''role'') IN (''gerente'', ''admin''))',
      tbl || '_write_gerente_admin', tbl);
  END LOOP;
END;
$$;

-- ── Pedidos: leitura authenticated + escrita caixa/gerente/admin ──────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'delivery_pedidos', 'delivery_pedido_itens'
  ] LOOP
    -- SELECT para qualquer autenticado (painel de operação; tenant via RESTRICTIVE).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT '
      'USING (auth.role() = ''authenticated'')',
      tbl || '_select_auth', tbl);

    -- Escrita (avançar status etc.) para o operador de caixa e acima.
    -- O cliente público NÃO usa esta policy — cria pedido via RPC (definer).
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_write_caixa_up', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL '
      'USING ((auth.jwt() ->> ''role'') IN (''caixa'', ''gerente'', ''admin'')) '
      'WITH CHECK ((auth.jwt() ->> ''role'') IN (''caixa'', ''gerente'', ''admin''))',
      tbl || '_write_caixa_up', tbl);
  END LOOP;
END;
$$;
