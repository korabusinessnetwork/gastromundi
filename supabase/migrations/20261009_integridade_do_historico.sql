-- ══════════════════════════════════════════════════════════════════
-- Integridade e rastreabilidade: o que foi pedido e o que foi vendido
-- não se apaga.
--
-- ┌─ O buraco ────────────────────────────────────────────────────────┐
-- │ Três caminhos de exclusão de HISTÓRICO, todos abertos:            │
-- │                                                                    │
-- │ 1. Cancelar comanda apagava a linha de `pending` (useCancelar-    │
-- │    Comanda → removePending → DELETE). O que o cliente pediu       │
-- │    sumia do banco. O único rastro era o payload de um log         │
-- │    fire-and-forget — que, por ser fire-and-forget, pode falhar    │
-- │    sem ninguém saber. Pedido cancelado é justamente o que mais    │
-- │    precisa ficar registrado.                                       │
-- │                                                                    │
-- │ 2. Cancelar venda fechada apagava venda_pagamentos, venda_itens,  │
-- │    vendas E o lançamento financeiro. Sobrava só o blob em `sales` │
-- │    marcado como cancelado — e a itemização sumia das tabelas que  │
-- │    o próprio app usa para ler. Um fiado cancelado desaparecia do  │
-- │    Financeiro em vez de ficar como cancelado.                      │
-- │                                                                    │
-- │ 3. E o banco não impedia nada: TODA policy dessas tabelas é       │
-- │    `FOR ALL`, então DELETE sempre foi permitido para qualquer     │
-- │    operador autenticado. A única coisa que segurava era a tela    │
-- │    não oferecer o botão — regra na tela e não no servidor, que é  │
-- │    o padrão de furo que este projeto já corrigiu várias vezes.     │
-- └────────────────────────────────────────────────────────────────────┘
--
-- O que esta migração faz:
--
--  A. `vendas` ganha as colunas de cancelamento, para cancelar deixar de
--     significar apagar. Espelha o que `venda_itens` já tinha por item.
--  B. `lancamentos.status` passa a aceitar 'cancelado', com quem e por quê.
--  C. `comandas_arquivadas` guarda TODA comanda que sai de `pending`,
--     escrita por um gatilho BEFORE DELETE — vale para a tela, para um
--     script e para um bug futuro, porque não depende de ninguém lembrar.
--  D. Policies RESTRICTIVE bloqueiam DELETE nas tabelas de histórico para
--     o app. Continuam deletáveis com a service_role (manutenção de DBA),
--     que é o corte certo: o app nunca apaga, o dono do banco ainda pode.
--
-- Por que a comanda vai inteira como jsonb: `pending` já ganhou colunas
-- depois de criada (cliente_id, status_cozinha, a trava de edição). Um
-- arquivo com colunas fixas pararia de guardar a coluna seguinte sem
-- avisar — que é exatamente o tipo de perda silenciosa que este arquivo
-- existe para impedir. `to_jsonb(OLD)` pega a linha como ela é hoje e
-- como ela for amanhã.
--
-- `pending` CONTINUA deletável de propósito: finalizar uma comanda tira
-- ela da tela de trabalho, e quem passa a ser o registro é a venda. O que
-- muda é que agora sair de `pending` sempre deixa cópia.
--
-- RLS: comandas_arquivadas nasce com RLS por tenant, no mesmo molde das
-- demais, e com DELETE bloqueado. LEMBRETE: confira no painel do Supabase
-- que a tabela aparece com RLS ativa depois de aplicar.
-- ══════════════════════════════════════════════════════════════════

-- ── A. Cancelar venda deixa de ser apagar venda ────────────────────
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cancelada            boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento  text,
  ADD COLUMN IF NOT EXISTS cancelada_por        text,
  ADD COLUMN IF NOT EXISTS cancelada_em         timestamptz;

COMMENT ON COLUMN public.vendas.cancelada IS
  'Venda cancelada depois de fechada. A linha NUNCA é apagada: relatório e auditoria precisam saber que ela existiu e que foi desfeita, por quem e por quê.';

CREATE INDEX IF NOT EXISTS vendas_cancelada_idx ON public.vendas (cancelada) WHERE cancelada;

-- ── B. Lançamento cancelado fica como cancelado ────────────────────
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS cancelado_por       text,
  ADD COLUMN IF NOT EXISTS cancelado_em        timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- O CHECK de status nasceu inline, então o nome gerado varia com a ordem
-- de criação: derruba-se pelo catálogo, não por nome adivinhado.
DO $st$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.lancamentos'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%previsto%'
  LOOP
    EXECUTE format('ALTER TABLE public.lancamentos DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.lancamentos
    ADD CONSTRAINT lancamentos_status_check
    CHECK (status IN ('previsto', 'pago', 'recebido', 'vencido', 'cancelado'));
END;
$st$;

COMMENT ON COLUMN public.lancamentos.cancelado_por IS
  'Quem cancelou o lançamento. Cancelar é mudar o status para cancelado — a linha fica, porque uma conta que existiu e foi desfeita é informação, não sujeira.';

-- ── C. Toda comanda que sai de `pending` deixa cópia ───────────────
CREATE TABLE IF NOT EXISTS public.comandas_arquivadas (
  id           text        PRIMARY KEY,
  comanda      text,
  mesa         text,
  total        numeric(12,2),
  garcom       text,
  criada_em    timestamptz,
  arquivada_em timestamptz NOT NULL DEFAULT now(),
  -- A linha inteira, como estava no instante em que saiu. Colunas novas
  -- de `pending` entram aqui sozinhas.
  dados        jsonb       NOT NULL,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id)
);

CREATE INDEX IF NOT EXISTS comandas_arquivadas_tenant_idx  ON public.comandas_arquivadas (tenant_id);
CREATE INDEX IF NOT EXISTS comandas_arquivadas_data_idx    ON public.comandas_arquivadas (arquivada_em DESC);
CREATE INDEX IF NOT EXISTS comandas_arquivadas_comanda_idx ON public.comandas_arquivadas (comanda);

ALTER TABLE public.comandas_arquivadas ENABLE ROW LEVEL SECURITY;

DO $pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'comandas_arquivadas'
       AND policyname = 'comandas_arquivadas_leitura'
  ) THEN
    CREATE POLICY "comandas_arquivadas_leitura"
      ON public.comandas_arquivadas FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END;
$pol$;

CREATE OR REPLACE FUNCTION public.arquivar_comanda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- ON CONFLICT porque o mesmo id pode voltar a `pending` (reabertura,
  -- compensação de erro) e sair de novo: vale o último estado conhecido.
  INSERT INTO public.comandas_arquivadas
    (id, comanda, mesa, total, garcom, criada_em, dados, tenant_id)
  VALUES
    (OLD.id, OLD.comanda, OLD.mesa, OLD.total, OLD.garcom, OLD.created_at,
     to_jsonb(OLD), OLD.tenant_id)
  ON CONFLICT (id) DO UPDATE
     SET comanda      = EXCLUDED.comanda,
         mesa         = EXCLUDED.mesa,
         total        = EXCLUDED.total,
         garcom       = EXCLUDED.garcom,
         dados        = EXCLUDED.dados,
         arquivada_em = now();
  RETURN OLD;
END;
$fn$;

COMMENT ON FUNCTION public.arquivar_comanda() IS
  'Copia a comanda para comandas_arquivadas antes de ela sair de pending. No gatilho e não na tela porque tem de valer também para script e para bug: o que o cliente pediu não pode depender de alguém lembrar de arquivar.';

DROP TRIGGER IF EXISTS pending_arquiva_antes_de_sair ON public.pending;
CREATE TRIGGER pending_arquiva_antes_de_sair
  BEFORE DELETE ON public.pending
  FOR EACH ROW EXECUTE FUNCTION public.arquivar_comanda();

-- ── D. O app não apaga histórico ───────────────────────────────────
-- RESTRICTIVE: soma-se às policies existentes em vez de substituir, e
-- `USING (false)` recusa todo DELETE. Não vale para a service_role, que
-- ignora RLS — o corte certo, porque manutenção de banco continua
-- possível para quem tem a chave, e o app nunca apaga por engano.
DO $blk$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendas', 'venda_itens', 'venda_pagamentos', 'sales',
    'lancamentos', 'delivery_pedidos', 'delivery_pedido_itens',
    'comandas_arquivadas'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t
         AND policyname = t || '_sem_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE USING (false)',
        t || '_sem_delete', t);
    END IF;
  END LOOP;
END;
$blk$;

-- ══════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — executa o que acabou de criar contra os casos reais e
-- aborta se algum divergir. Estabelecimento descartável, limpo no fim.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tenant uuid;
  v_qtd    integer;
  v_itens  jsonb;
BEGIN
  INSERT INTO public.tenants (nome, slug)
       VALUES ('__conf_integridade__', '__conf_integridade__') RETURNING id INTO v_tenant;

  -- Caso 1 — comanda que sai de `pending` deixa cópia, com os itens.
  INSERT INTO public.pending (id, comanda, items, total, garcom, tenant_id)
       VALUES ('__conf_p1__', '7',
               '[{"name":"X-Burguer","qty":2,"price":30}]'::jsonb, 60, 'Ana', v_tenant);
  DELETE FROM public.pending WHERE id = '__conf_p1__';

  SELECT count(*) INTO v_qtd FROM public.comandas_arquivadas WHERE id = '__conf_p1__';
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Integridade: comanda apagada não deixou cópia — o que o cliente pediu sumiria.';
  END IF;

  SELECT dados -> 'items' INTO v_itens FROM public.comandas_arquivadas WHERE id = '__conf_p1__';
  IF v_itens IS NULL OR jsonb_array_length(v_itens) <> 1 THEN
    RAISE EXCEPTION 'Integridade: a cópia da comanda não guardou os itens pedidos.';
  END IF;

  -- Caso 2 — a cópia guarda a linha INTEIRA, não um punhado de colunas.
  -- É o que faz coluna nova em `pending` continuar sendo arquivada.
  IF NOT (SELECT dados ? 'status' AND dados ? 'created_at'
            FROM public.comandas_arquivadas WHERE id = '__conf_p1__') THEN
    RAISE EXCEPTION 'Integridade: a cópia perdeu colunas da comanda.';
  END IF;

  -- Caso 3 — a MESMA comanda saindo de novo atualiza a cópia em vez de
  -- estourar por chave duplicada (reabertura, compensação de erro).
  INSERT INTO public.pending (id, comanda, items, total, garcom, tenant_id)
       VALUES ('__conf_p1__', '7', '[]'::jsonb, 99, 'Bruno', v_tenant);
  DELETE FROM public.pending WHERE id = '__conf_p1__';
  SELECT count(*) INTO v_qtd FROM public.comandas_arquivadas WHERE id = '__conf_p1__';
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Integridade: comanda reaberta duplicou o arquivo em vez de atualizá-lo.';
  END IF;

  -- Caso 4 — venda cancelada tem onde ser marcada como cancelada.
  INSERT INTO public.vendas (id, comanda, total, tenant_id)
       VALUES ('__conf_v1__', '7', 60, v_tenant);
  UPDATE public.vendas
     SET cancelada = true, motivo_cancelamento = 'teste',
         cancelada_por = 'Ana', cancelada_em = now()
   WHERE id = '__conf_v1__';
  SELECT count(*) INTO v_qtd FROM public.vendas WHERE id = '__conf_v1__' AND cancelada;
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Integridade: não deu para marcar a venda como cancelada.';
  END IF;

  -- Caso 5 — lançamento aceita o status 'cancelado'.
  INSERT INTO public.lancamentos (tipo, categoria, valor, competencia, status, tenant_id)
       VALUES ('receita', 'Vendas', 60, current_date, 'cancelado', v_tenant);
  SELECT count(*) INTO v_qtd
    FROM public.lancamentos WHERE tenant_id = v_tenant AND status = 'cancelado';
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Integridade: o lançamento não aceitou o status cancelado — o cancelamento continuaria sendo apagar.';
  END IF;

  -- Caso 6 — os status que já existiam continuam valendo. Trocar o CHECK
  -- sem isto poderia derrubar o fluxo normal do Financeiro.
  FOREACH v_itens IN ARRAY ARRAY['"previsto"'::jsonb, '"pago"', '"recebido"', '"vencido"'] LOOP
    UPDATE public.lancamentos
       SET status = (v_itens #>> '{}')
     WHERE tenant_id = v_tenant;
  END LOOP;

  DELETE FROM public.lancamentos        WHERE tenant_id = v_tenant;
  DELETE FROM public.vendas             WHERE tenant_id = v_tenant;
  DELETE FROM public.comandas_arquivadas WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants            WHERE id = v_tenant;

  RAISE NOTICE 'Integridade conferida: comanda apagada deixa cópia inteira, venda cancela sem sumir e lançamento aceita cancelado.';
END;
$conf$;
