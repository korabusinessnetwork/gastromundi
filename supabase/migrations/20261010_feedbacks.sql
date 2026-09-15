-- ══════════════════════════════════════════════════════════════════
-- Feedback: da equipe que opera e do cliente que pediu.
--
-- ┌─ Por que ─────────────────────────────────────────────────────────┐
-- │ Quem vê o problema é quem está no balcão às 20h de sexta, e hoje  │
-- │ não existe caminho nenhum entre essa pessoa e o dono. O relato    │
-- │ vira mensagem solta no WhatsApp, ou não vira nada.                │
-- │                                                                    │
-- │ Do outro lado, o cliente que pediu pela vitrine também não tem    │
-- │ como dizer se foi bom — e essa é a única leitura de qualidade que │
-- │ um delivery sem praça de alimentação consegue ter.                 │
-- └────────────────────────────────────────────────────────────────────┘
--
-- Uma tabela para os dois, separados por `origem`. São perguntas
-- diferentes ("está quebrado" x "foi bom?"), mas o ciclo de vida é o
-- mesmo — chega, é lido, é resolvido — e duas tabelas quase iguais
-- custariam duas policies, dois índices e duas telas de leitura.
--
-- `nota` só faz sentido no cliente; `tela` e `autor`, só na equipe. Um
-- CHECK garante que cada origem preencha o que lhe cabe, em vez de
-- deixar linha meio preenchida que ninguém sabe interpretar depois.
--
-- RLS: a equipe escreve autenticada; o CLIENTE escreve ANÔNIMO, porque a
-- vitrine é anônima — mesma situação de criar_pedido_delivery. Por isso o
-- caminho do cliente é uma RPC SECURITY DEFINER com `tenant_id`
-- explícito, e não INSERT direto: sem isso, ou o anon não consegue
-- gravar, ou ganharia INSERT livre na tabela.
--
-- LEMBRETE: confira no painel do Supabase que `feedbacks` aparece com RLS
-- ativa depois de aplicar.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  origem     text        NOT NULL CHECK (origem IN ('equipe', 'cliente')),
  texto      text        NOT NULL CHECK (btrim(texto) <> ''),
  -- Cliente: 1 a 5. Equipe não dá nota.
  nota       integer     CHECK (nota IS NULL OR nota BETWEEN 1 AND 5),
  -- Equipe: em que tela estava e quem escreveu (o login, não o nome).
  tela       text,
  autor      text,
  -- Cliente: o pedido de que ele está falando, quando houver.
  pedido_id  uuid        REFERENCES public.delivery_pedidos(id) ON DELETE SET NULL,
  resolvido  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedbacks_campos_da_origem CHECK (
    (origem = 'cliente' AND autor IS NULL AND tela IS NULL)
    OR (origem = 'equipe' AND nota IS NULL AND pedido_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS feedbacks_tenant_idx ON public.feedbacks (tenant_id);
CREATE INDEX IF NOT EXISTS feedbacks_data_idx   ON public.feedbacks (created_at DESC);
CREATE INDEX IF NOT EXISTS feedbacks_abertos_idx ON public.feedbacks (tenant_id) WHERE NOT resolvido;

COMMENT ON TABLE public.feedbacks IS
  'Relato da equipe (origem=equipe: o que quebrou, em que tela) e avaliação do cliente do delivery (origem=cliente: nota e comentário). Uma tabela porque o ciclo de vida é o mesmo; o CHECK feedbacks_campos_da_origem impede linha meio preenchida.';

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- ── A equipe lê e escreve o do próprio estabelecimento ─────────────
DO $pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'feedbacks' AND policyname = 'feedbacks_equipe'
  ) THEN
    CREATE POLICY "feedbacks_equipe"
      ON public.feedbacks FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  -- Isolamento por tenant no mesmo molde das demais: RESTRICTIVE soma-se
  -- à policy acima, então nenhuma policy nova reabre o vazamento entre
  -- estabelecimentos por engano.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'feedbacks' AND policyname = 'feedbacks_tenant_isolation'
  ) THEN
    CREATE POLICY "feedbacks_tenant_isolation"
      ON public.feedbacks AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id() OR public.tenant_atual_id() IS NULL);
  END IF;
END;
$pol$;

-- ── O cliente (anônimo) manda pela RPC, nunca por INSERT direto ────
CREATE OR REPLACE FUNCTION public.registrar_feedback_cliente(
  p_slug      text,
  p_nota      integer,
  p_texto     text,
  p_pedido_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tenant uuid;
  v_texto  text;
  v_id     uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = p_slug;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado.';
  END IF;

  IF p_nota IS NULL OR p_nota < 1 OR p_nota > 5 THEN
    RAISE EXCEPTION 'A nota precisa ser de 1 a 5.';
  END IF;

  -- Comentário é opcional: quem só quer dar a nota não deve ser obrigado
  -- a escrever. O texto vazio vira a própria nota por extenso, para a
  -- linha nunca nascer sem conteúdo (o CHECK exige texto).
  v_texto := btrim(coalesce(p_texto, ''));
  IF v_texto = '' THEN
    v_texto := p_nota || ' de 5';
  END IF;
  -- Teto de tamanho: campo aberto em página pública é porta de entrada
  -- para texto gigante entupir a tabela.
  v_texto := left(v_texto, 2000);

  INSERT INTO public.feedbacks (tenant_id, origem, nota, texto, pedido_id)
       VALUES (v_tenant, 'cliente', p_nota, v_texto,
               -- Pedido de OUTRO estabelecimento não se cola aqui: seria
               -- um jeito de descobrir que um id existe.
               (SELECT id FROM public.delivery_pedidos
                 WHERE id = p_pedido_id AND tenant_id = v_tenant))
    RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

COMMENT ON FUNCTION public.registrar_feedback_cliente(text, integer, text, uuid) IS
  'Avaliação do cliente na vitrine (anônima). SECURITY DEFINER com tenant resolvido pelo slug, porque a vitrine não tem sessão — e porque dar INSERT direto ao anon abriria a tabela.';

REVOKE ALL ON FUNCTION public.registrar_feedback_cliente(text, integer, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.registrar_feedback_cliente(text, integer, text, uuid) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- CONFERÊNCIA — executa o que acabou de criar e aborta se divergir.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tenant uuid;
  v_outro  uuid;
  v_pedido uuid;
  v_id     uuid;
  v_qtd    integer;
  v_txt    text;
BEGIN
  INSERT INTO public.tenants (nome, slug)
       VALUES ('__conf_fb__', '__conf_fb__') RETURNING id INTO v_tenant;
  INSERT INTO public.tenants (nome, slug)
       VALUES ('__conf_fb2__', '__conf_fb2__') RETURNING id INTO v_outro;

  -- Caso 1 — a equipe relata: tela e autor entram, nota não.
  INSERT INTO public.feedbacks (tenant_id, origem, texto, tela, autor)
       VALUES (v_tenant, 'equipe', 'A impressora não puxa', 'PDV', 'maria');
  SELECT count(*) INTO v_qtd
    FROM public.feedbacks WHERE tenant_id = v_tenant AND origem = 'equipe';
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Feedback: o relato da equipe não gravou.';
  END IF;

  -- Caso 2 — linha meio preenchida é recusada. Sem o CHECK, um feedback
  -- de cliente com "autor" viraria dado que ninguém sabe interpretar.
  BEGIN
    INSERT INTO public.feedbacks (tenant_id, origem, texto, nota, autor)
         VALUES (v_tenant, 'cliente', 'x', 5, 'maria');
    RAISE EXCEPTION 'Feedback: aceitou cliente com autor preenchido.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Caso 3 — nota fora de 1..5 não entra.
  BEGIN
    INSERT INTO public.feedbacks (tenant_id, origem, texto, nota)
         VALUES (v_tenant, 'cliente', 'x', 9);
    RAISE EXCEPTION 'Feedback: aceitou nota 9.';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Caso 4 — a RPC do cliente grava e resolve o tenant pelo slug.
  v_id := public.registrar_feedback_cliente('__conf_fb__', 5, 'Chegou quentinho');
  SELECT count(*) INTO v_qtd
    FROM public.feedbacks WHERE id = v_id AND tenant_id = v_tenant AND origem = 'cliente';
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Feedback: a RPC do cliente não gravou no estabelecimento certo.';
  END IF;

  -- Caso 5 — sem comentário, a nota vira o texto: a linha nunca nasce vazia.
  v_id := public.registrar_feedback_cliente('__conf_fb__', 4, '   ');
  SELECT texto INTO v_txt FROM public.feedbacks WHERE id = v_id;
  IF v_txt <> '4 de 5' THEN
    RAISE EXCEPTION 'Feedback: comentário vazio não virou a nota por extenso (veio "%").', v_txt;
  END IF;

  -- Caso 6 — pedido de OUTRO estabelecimento não se cola ao feedback.
  INSERT INTO public.delivery_pedidos
    (tenant_id, numero, cliente_nome, endereco, subtotal, total, forma_pagamento)
       VALUES (v_outro, '1', 'x', 'rua x', 10, 10, 'pix') RETURNING id INTO v_pedido;
  v_id := public.registrar_feedback_cliente('__conf_fb__', 5, 'ok', v_pedido);
  SELECT count(*) INTO v_qtd FROM public.feedbacks WHERE id = v_id AND pedido_id IS NULL;
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Feedback: colou um pedido de outro estabelecimento.';
  END IF;

  -- Caso 7 — slug inexistente é recusado, não vira feedback órfão.
  BEGIN
    PERFORM public.registrar_feedback_cliente('__nao_existe__', 5, 'x');
    RAISE EXCEPTION 'Feedback: aceitou um estabelecimento que não existe.';
  EXCEPTION WHEN others THEN
    IF sqlerrm NOT LIKE '%não encontrado%' THEN RAISE; END IF;
  END;

  DELETE FROM public.feedbacks         WHERE tenant_id IN (v_tenant, v_outro);
  DELETE FROM public.delivery_pedidos  WHERE tenant_id IN (v_tenant, v_outro);
  DELETE FROM public.tenants           WHERE id IN (v_tenant, v_outro);

  RAISE NOTICE 'Feedback conferido: equipe e cliente gravam, linha meio preenchida é recusada e pedido de outro estabelecimento não cola.';
END;
$conf$;
