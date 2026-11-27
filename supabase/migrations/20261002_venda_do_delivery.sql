-- ══════════════════════════════════════════════════════════════════
-- O delivery passa a fechar a própria venda, com registro separado.
--
-- ┌─ Como era ────────────────────────────────────────────────────────┐
-- │ `criar_pedido_delivery` espelha todo pedido em `pending`, e esse   │
-- │ espelho aparecia na lista de comandas do PDV como qualquer mesa.   │
-- │ Era ELE que o caixa fechava para registrar a venda — está escrito  │
-- │ na 20260904: "'entregue' mantém a comanda de propósito: é ela que  │
-- │ o PDV fecha para registrar a venda".                                │
-- │                                                                     │
-- │ Consequências: o pedido de delivery poluía a tela do garçom (ele   │
-- │ não tem nada a fazer com uma comanda que ninguém vai atender na    │
-- │ mesa), e a venda de delivery nascia indistinguível de uma venda de │
-- │ balcão — sem como separar quanto o delivery vendeu.                 │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- ┌─ Como fica ───────────────────────────────────────────────────────┐
-- │ A venda do delivery é registrada pela PRÓPRIA aba Delivery, no    │
-- │ momento em que o pedido é marcado como entregue, e nasce marcada   │
-- │ com `origem = 'delivery'` e o vínculo com o pedido que a originou. │
-- │ O espelho em `pending` deixa de ser peça financeira e passa a ser  │
-- │ só o que sempre foi de fato útil: a comanda que a COZINHA lê e que │
-- │ a impressora imprime.                                               │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- Por que uma RPC e não três INSERTs no front: venda, itens e pagamento
-- têm que entrar juntos ou não entrar. Do lado do navegador, a aba
-- fechando entre o primeiro e o segundo INSERT deixaria uma venda sem
-- itens no relatório — dinheiro registrado sem lastro.
--
-- Idempotente de propósito: `delivery_pedido_id` é UNIQUE, e a função
-- devolve a venda que já existe em vez de criar outra. O clique duplo em
-- "Confirmar entrega", o eco do realtime e o operador que volta na tela
-- não podem render duas vendas do mesmo pedido.
--
-- Pedido CANCELADO não vira venda: quem cancelou não recebeu nada.
--
-- RLS: nenhuma tabela nova. As colunas entram em `vendas`, que já tem
-- RLS por tenant. A RPC é SECURITY DEFINER e confere o tenant do pedido
-- contra o tenant de quem chama — ela NÃO é exposta ao anon.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A venda sabe de onde veio ───────────────────────────────────
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pdv';

DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_origem_check') THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_origem_check CHECK (origem IN ('pdv', 'delivery'));
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.vendas.origem IS
  'De onde a venda veio: pdv (balcão/mesa) ou delivery. Toda venda que já existia é do PDV — era o único caminho.';

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS delivery_pedido_id uuid
    REFERENCES public.delivery_pedidos(id) ON DELETE SET NULL;

-- UNIQUE é a trava da idempotência: dois cliques em "Confirmar entrega"
-- não podem virar duas vendas do mesmo pedido.
CREATE UNIQUE INDEX IF NOT EXISTS vendas_delivery_pedido_id_key
  ON public.vendas (delivery_pedido_id)
  WHERE delivery_pedido_id IS NOT NULL;

COMMENT ON COLUMN public.vendas.delivery_pedido_id IS
  'Pedido de delivery que originou esta venda. UNIQUE: um pedido rende uma venda só, por mais vezes que o botão seja clicado.';

-- ── 2. Fechar o pedido de delivery: virar venda, em uma transação ──
CREATE OR REPLACE FUNCTION public.registrar_venda_delivery(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.tenant_atual_id();
  v_pedido  public.delivery_pedidos;
  v_venda   text;
  v_existe  text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sessão sem estabelecimento.';
  END IF;

  -- FOR UPDATE: dois operadores clicando ao mesmo tempo em telas
  -- diferentes esperam um pelo outro em vez de gravarem duas vendas.
  SELECT * INTO v_pedido
    FROM public.delivery_pedidos
   WHERE id = p_pedido_id AND tenant_id = v_tenant
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de delivery não encontrado.';
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não vira venda.';
  END IF;

  -- Já fechado: devolve a venda que existe. Não é erro — é o segundo
  -- clique, o eco do realtime, ou o operador voltando na tela.
  SELECT id INTO v_existe
    FROM public.vendas
   WHERE delivery_pedido_id = p_pedido_id AND tenant_id = v_tenant;
  IF v_existe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'venda_id', v_existe, 'ja_existia', true);
  END IF;

  v_venda := 'dlv_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.vendas (
    id, comanda, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste,
    total, cashier, at, tenant_id, origem, delivery_pedido_id
  ) VALUES (
    v_venda,
    -- O número do delivery é a comanda desta venda: é por ele que o dono
    -- reencontra o pedido quando o cliente liga reclamando.
    v_pedido.numero,
    NULL,
    v_pedido.subtotal,
    false,
    -- A taxa de ENTREGA ocupa o lugar da taxa de serviço no total. Não é
    -- gorjeta, mas é a única linha de acréscimo que a venda tem, e
    -- somá-la ao subtotal esconderia quanto foi comida e quanto foi frete.
    COALESCE(v_pedido.taxa_entrega, 0),
    0,
    v_pedido.total,
    'delivery',
    now(),
    v_tenant,
    'delivery',
    v_pedido.id
  );

  INSERT INTO public.venda_itens (venda_id, product_id, nome, preco, qtd, tenant_id)
  SELECT v_venda, i.produto_id, i.nome, i.preco_unit, i.qtd, v_tenant
    FROM public.delivery_pedido_itens i
   WHERE i.pedido_id = p_pedido_id AND i.tenant_id = v_tenant;

  -- Pagamento é na entrega: a forma já foi escolhida pelo cliente no
  -- cardápio, e o valor é o total. Sem esta linha o fechamento de caixa
  -- não sabe em qual meio o dinheiro entrou.
  INSERT INTO public.venda_pagamentos (venda_id, metodo, valor, tenant_id)
  VALUES (v_venda, v_pedido.forma_pagamento, v_pedido.total, v_tenant);

  -- O espelho em `pending` cumpriu o papel dele (a cozinha já produziu) e
  -- não é mais peça financeira: quem fecha a venda do delivery é esta
  -- função. Deixá-lo aberto faria o pedido entregue continuar contado
  -- como comanda em aberto para sempre.
  IF v_pedido.pending_id IS NOT NULL THEN
    DELETE FROM public.pending
     WHERE id = v_pedido.pending_id AND tenant_id = v_tenant;
  END IF;

  RETURN jsonb_build_object('ok', true, 'venda_id', v_venda, 'ja_existia', false);
END;
$$;

COMMENT ON FUNCTION public.registrar_venda_delivery(uuid) IS
  'Fecha um pedido de delivery como venda (origem=delivery), em uma transação. Idempotente: o mesmo pedido devolve sempre a mesma venda.';

-- Só quem está logado no estabelecimento fecha venda. O anon da vitrine
-- não tem nada que ver com isto.
REVOKE EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 3. Conferência ao vivo — aborta se faltar ponta. Não escreve dado.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
  n     integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendas'
     AND column_name IN ('origem', 'delivery_pedido_id');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Venda do delivery: faltam colunas em vendas (origem, delivery_pedido_id).';
  END IF;

  -- Toda venda que já existia é do PDV: era o único caminho que havia.
  SELECT count(*) INTO n FROM public.vendas WHERE origem NOT IN ('pdv', 'delivery');
  IF n > 0 THEN
    RAISE EXCEPTION 'Venda do delivery: % venda(s) com origem fora dos dois valores conhecidos.', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'vendas_delivery_pedido_id_key'
  ) THEN
    RAISE EXCEPTION 'Venda do delivery: falta o UNIQUE por pedido — dois cliques renderiam duas vendas.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'registrar_venda_delivery';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC não foi criada.';
  END IF;
  IF position('FOR UPDATE' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: sem FOR UPDATE, dois operadores simultâneos gravariam duas vendas.';
  END IF;
  IF position('ja_existia' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC precisa devolver a venda já existente em vez de criar outra.';
  END IF;
  IF position('Pedido cancelado não vira venda' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: falta a guarda de pedido cancelado.';
  END IF;
  IF has_function_privilege('public', 'public.registrar_venda_delivery(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC não devia ter EXECUTE para PUBLIC — o anon da vitrine não fecha venda.';
  END IF;

  RAISE NOTICE 'Venda do delivery: registro próprio (origem=delivery) no ar.';
END;
$conf$;
