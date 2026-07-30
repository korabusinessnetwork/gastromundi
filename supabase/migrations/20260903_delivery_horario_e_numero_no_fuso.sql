-- ──────────────────────────────────────────────────────────────────
-- Run 6, leva 5 — o delivery inteiro estava rodando no relógio errado.
--
-- Dois defeitos com a MESMA raiz: o servidor decide coisas do dia a dia
-- do restaurante usando UTC, e o Brasil está três horas atrás. Todo dia,
-- às 21h da noite, o banco já virou o dia seguinte.
--
-- ── D14 · o número do pedido vira o de amanhã às 21h e reinicia em 001
--
-- O número humano do pedido era montado assim:
--     to_char(now(), 'YYMMDD') || '-' || lpad((count(*)+1)::text, 3, '0')
--   FROM delivery_pedidos
--   WHERE tenant_id = ... AND created_at::date = now()::date;
--
-- Às 20:59 (horário de Brasília) o pedido sai como `260729-047`. Às 21:01
-- o MESMO expediente, com o mesmo movimento na rua, passa a emitir
-- `260730-001`. A cozinha recebe "Delivery 260730-001" logo depois de
-- "Delivery 260729-047" e o entregador não sabe mais qual pedido é qual.
-- A conferência do fim da noite (a hora de maior movimento no delivery)
-- fica partida em dois dias que não existem.
--
-- Segunda cara do mesmo defeito, e essa derruba a loja: `count(*)+1`
-- pressupõe que nenhum pedido do dia foi apagado. Existe
-- `UNIQUE (tenant_id, numero)`. Apague o pedido 002 de três, e a conta
-- passa a devolver 003 — que já existe. O laço de 8 tentativas recalcula
-- exatamente o mesmo 003 oito vezes e desiste com "Não foi possível gerar
-- o número do pedido". A vitrine para de aceitar pedidos e não volta
-- sozinha nunca mais.
--
-- Terceira: `lpad(texto, 3, '0')` TRUNCA quando o texto é maior que 3.
-- O pedido 1000 do dia viraria `...-100`, colidindo com o de número 100.
--
-- Correção: o dia vem do fuso do estabelecimento; a sequência vem de
-- MAX(sequência já emitida no dia) + tentativa, filtrando pelo PRÓPRIO
-- prefixo do número (não por created_at, que é UTC) — assim pedido
-- apagado não trava mais nada; e a formatação passa a `to_char(n,'FM000')`,
-- que preenche com zero à esquerda sem nunca truncar.
--
-- ── D15 · o horário de funcionamento só valia com o dono olhando a tela
--
-- `config_delivery.horario` guarda o agendamento (dias + faixas), e a
-- regra que decide se está aberto morava só no navegador: `DeliveryView`
-- roda `ajusteAutomaticoAbertura` a cada 30 s ENQUANTO a tela do Delivery
-- está montada, e grava o flag `config_delivery.aberto`. Quem lê o flag
-- é a vitrine (`cardapio_publico`) e a guarda fail-closed da entrada do
-- pedido. Ou seja: o horário só acontece se alguém estiver com aquela
-- tela aberta na hora exata da virada.
--
-- Na prática, as duas pontas quebram:
--   • O dono abre a tela de manhã, vai atender o salão, e às 23:00
--     ninguém fecha a loja. A vitrine segue aceitando pedido às 3 da
--     manhã, o pedido cai na fila da cozinha e ninguém vê.
--   • O dono não abre a tela naquele dia: às 18:00 ninguém abre a loja.
--     A vitrine diz "Fechado no momento" durante todo o expediente e
--     recusa cada pedido, sem que nada apareça errado no painel.
--
-- Isso não era descuido: o cabeçalho de `src/lib/deliveryHorario.js`
-- registra a decisão — "sem servidor/cron (fase de bootstrap, custo
-- zero): quem reconcilia é o app do operador". A correção aqui respeita
-- essa restrição e continua custando ZERO: não há cron, não há serviço,
-- não há job. O horário passa a ser avaliado no instante da leitura, nas
-- duas chamadas que o cliente já faz de qualquer forma. Sem cron, sem
-- custo, e sem depender de ninguém estar com o navegador aberto.
--
-- `public.delivery_aberto_agora` é transcrição fiel de
-- `deliveryDeveEstarAberto` (src/lib/deliveryHorario.js), cláusula por
-- cláusula, inclusive a faixa que vira a noite e o "rescaldo" da
-- madrugada seguinte. A semântica de hoje é preservada exatamente:
-- agendamento desligado ou incompleto NÃO governa (vale o controle
-- manual); ligado e completo, governa. A reconciliação client-side
-- continua existindo e segue mantendo o flag do painel coerente —
-- ela apenas deixou de ser a única fonte de verdade.
--
-- ── Fuso por estabelecimento (decisão 017)
--
-- Nada de zona fixa no código: `config_delivery.fuso` guarda o nome IANA
-- do fuso do estabelecimento, com `America/Sao_Paulo` como padrão de
-- produto (não como regra de um cliente). Fuso desconhecido ou em branco
-- cai no padrão em vez de derrubar a função.
--
-- RLS: nenhuma tabela nova; a coluna entra numa tabela que já tem RLS
-- configurada. Nada a configurar no painel.
--
-- Este arquivo termina com um bloco DO $$ ... $$ que EXECUTA a regra
-- contra casos conhecidos e aborta a migração se algum resultado estiver
-- errado — o teste roda onde o Postgres existe, no momento de aplicar.
-- ──────────────────────────────────────────────────────────────────

-- ── 1. Fuso do estabelecimento ─────────────────────────────────────
ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS fuso text NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN public.config_delivery.fuso IS
  'Nome IANA do fuso do estabelecimento (ex.: America/Sao_Paulo, America/Manaus). '
  'Define o dia do número do pedido e a hora do agendamento de abertura. '
  'Valor desconhecido cai no padrão America/Sao_Paulo.';

-- ── 2. Fuso utilizável (nunca derruba a função) ────────────────────
CREATE OR REPLACE FUNCTION public.fuso_valido(p_fuso text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT name FROM pg_timezone_names WHERE name = btrim(p_fuso)),
    'America/Sao_Paulo'
  );
$$;

-- ── 3. "HH:MM" → minutos desde a meia-noite ────────────────────────
-- Espelha paraMinutos() de src/lib/deliveryHorario.js: aceita "8:05" e
-- "08:05", devolve NULL para qualquer coisa fora de 00:00..23:59.
CREATE OR REPLACE FUNCTION public.hhmm_para_minutos(p_hhmm text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN btrim(p_hhmm) ~ '^[0-9]{1,2}:[0-9]{2}$'
     AND split_part(btrim(p_hhmm), ':', 1)::int BETWEEN 0 AND 23
     AND split_part(btrim(p_hhmm), ':', 2)::int BETWEEN 0 AND 59
    THEN split_part(btrim(p_hhmm), ':', 1)::int * 60
       + split_part(btrim(p_hhmm), ':', 2)::int
  END;
$$;

-- ── 4. O delivery está aberto AGORA? ───────────────────────────────
-- Transcrição de deliveryDeveEstarAberto() + ajusteAutomaticoAbertura():
--   agendamento não governa (desligado/incompleto) → vale o flag manual;
--   governa → vale a faixa de atendimento no fuso do estabelecimento.
CREATE OR REPLACE FUNCTION public.delivery_aberto_agora(
  p_horario jsonb,
  p_aberto  boolean,
  p_fuso    text        DEFAULT 'America/Sao_Paulo',
  p_agora   timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_manual    boolean := COALESCE(p_aberto, false);
  v_dias      int[];
  v_abre      int[];
  v_fecha     int[];
  v_qtd       int;
  v_furadas   int;
  v_local     timestamp;
  v_dia       int;
  v_ontem     int;
  v_minutos   int;
  v_i         int;
BEGIN
  -- auto: no app é `h.auto === true` — estritamente o booleano verdadeiro.
  IF COALESCE(p_horario -> 'auto', 'null'::jsonb) <> 'true'::jsonb THEN
    RETURN v_manual;
  END IF;

  -- dias: só inteiros de 0 (domingo) a 6, sem repetição — como normalizarHorario.
  -- Só aceita número: a coluna é escrita exclusivamente por normalizarHorario,
  -- que sempre grava inteiros. Lixo escrito à mão cai fora, e se cair tudo a
  -- lista fica vazia — o agendamento não governa e o manual continua valendo,
  -- que é o lado seguro.
  SELECT COALESCE(array_agg(DISTINCT n::int), ARRAY[]::int[])
    INTO v_dias
  FROM (
    SELECT (e #>> '{}')::numeric AS n
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_horario -> 'dias') = 'array'
                THEN p_horario -> 'dias' ELSE '[]'::jsonb END) e
    WHERE jsonb_typeof(e) = 'number'
  ) s
  WHERE n = trunc(n) AND n BETWEEN 0 AND 6;

  -- faixas: a lista nova, ou a janela única do formato legado (abre/fecha no
  -- topo do objeto). A hora é normalizada ANTES do descarte, como em
  -- normalizarFaixas: faixa cujas duas pontas não viram hora válida é ruído de
  -- edição e sai da lista; faixa com uma ponta só fica e invalida o conjunto.
  SELECT COALESCE(array_agg(a ORDER BY o), ARRAY[]::int[]),
         COALESCE(array_agg(b ORDER BY o), ARRAY[]::int[]),
         count(*)::int,
         count(*) FILTER (WHERE a IS NULL OR b IS NULL OR a = b)::int
    INTO v_abre, v_fecha, v_qtd, v_furadas
  FROM (
    SELECT public.hhmm_para_minutos(f ->> 'abre') AS a,
           public.hhmm_para_minutos(f ->> 'fecha') AS b,
           o
    FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(p_horario -> 'faixas') = 'array'
               THEN p_horario -> 'faixas'
             WHEN p_horario ? 'abre' OR p_horario ? 'fecha'
               THEN jsonb_build_array(jsonb_build_object(
                      'abre',  p_horario -> 'abre',
                      'fecha', p_horario -> 'fecha'))
             ELSE '[]'::jsonb
           END) WITH ORDINALITY AS t(f, o)
    WHERE jsonb_typeof(f) = 'object'
  ) k
  WHERE a IS NOT NULL OR b IS NOT NULL;

  -- Incompleto ⇒ não governa: não fecha a loja por engano.
  IF cardinality(v_dias) = 0 OR v_qtd = 0 OR v_furadas > 0 THEN
    RETURN v_manual;
  END IF;

  v_local   := timezone(public.fuso_valido(p_fuso), p_agora);
  v_dia     := EXTRACT(DOW  FROM v_local)::int;   -- 0=domingo, igual a getDay()
  v_ontem   := (v_dia + 6) % 7;
  v_minutos := EXTRACT(HOUR FROM v_local)::int * 60
             + EXTRACT(MINUTE FROM v_local)::int;

  FOR v_i IN 1..v_qtd LOOP
    IF v_fecha[v_i] > v_abre[v_i] THEN
      -- Janela no mesmo dia: [abre, fecha).
      IF v_dia = ANY(v_dias)
         AND v_minutos >= v_abre[v_i]
         AND v_minutos <  v_fecha[v_i] THEN
        RETURN true;
      END IF;
    ELSE
      -- Janela que vira a meia-noite: o trecho de hoje até 00:00, mais a
      -- madrugada de hoje se ONTEM era dia de atendimento.
      IF (v_dia   = ANY(v_dias) AND v_minutos >= v_abre[v_i])
         OR (v_ontem = ANY(v_dias) AND v_minutos < v_fecha[v_i]) THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- Funções auxiliares rodam DENTRO das RPCs SECURITY DEFINER; a anon key
-- não precisa alcançá-las (padrão do projeto: nada de EXECUTE p/ PUBLIC).
REVOKE EXECUTE ON FUNCTION public.fuso_valido(text)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hhmm_para_minutos(text)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_aberto_agora(jsonb, boolean, text, timestamptz) FROM PUBLIC;

-- ── 5. cardapio_publico: `aberto` passa a ser a verdade do horário ──
-- Idêntica à definição de 20260822, com UMA linha diferente: o valor de
-- 'aberto'. Todo o resto (guarda DL5, produtos, grupos, combos) é igual.
CREATE OR REPLACE FUNCTION public.cardapio_publico(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tenant uuid := public.delivery_tenant_por_slug(p_slug);
  v_cfg    public.config_delivery;
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.config_delivery WHERE tenant_id = v_tenant;
  -- DL5: tenant existe mas não tem delivery configurado → indistinguível
  -- de slug inexistente (não vaza a existência do estabelecimento).
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    -- D15: o agendamento decide, no fuso do estabelecimento. O flag
    -- gravado só vale quando não há agendamento governando.
    'aberto',            public.delivery_aberto_agora(
                           v_cfg.horario, v_cfg.aberto, v_cfg.fuso),
    'pedido_minimo',     COALESCE(v_cfg.pedido_minimo, 0),
    'tempo_preparo_min', COALESCE(v_cfg.tempo_preparo_min, 30),
    'produtos', COALESCE((
      SELECT jsonb_agg(prod ORDER BY prod->>'categoria', (prod->>'ordem')::int, prod->>'nome')
      FROM (
        SELECT jsonb_build_object(
          'produto_id', p.id,
          'nome',       p.name,
          'preco',      p.price,
          'categoria',  p.category,
          'emoji',      p.emoji,
          'foto_url',   pd.foto_url,
          'descricao',  pd.descricao,
          'ordem',      pd.ordem,
          'grupos', COALESCE((
            SELECT jsonb_agg(g_json ORDER BY g_ordem)
            FROM (
              SELECT public.montar_grupo_delivery(pg.grupo_id, v_tenant, 0) AS g_json,
                     pg.ordem AS g_ordem
              FROM public.produto_grupos pg
              WHERE pg.produto_id = p.id AND pg.tenant_id = v_tenant
            ) gg
            WHERE g_json IS NOT NULL
          ), '[]'::jsonb)
        ) AS prod
        FROM public.products p
        JOIN public.produto_delivery pd
          ON pd.produto_id = p.id AND pd.tenant_id = v_tenant
        WHERE p.tenant_id = v_tenant
          AND p.active
          AND pd.disponivel
      ) sub
    ), '[]'::jsonb),
    'combos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'combo_id', cb.id,
        'nome',     cb.nome,
        'preco',    cb.preco_total
      ) ORDER BY cb.nome)
      FROM public.combos cb
      WHERE cb.tenant_id = v_tenant AND cb.ativo
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 6. criar_pedido_delivery ───────────────────────────────────────
-- Idêntica à definição de 20260902 (Run 6, leva 1), com dois trechos
-- diferentes: a guarda fail-closed e o bloco do número do pedido.
CREATE OR REPLACE FUNCTION public.criar_pedido_delivery(
  p_slug    text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant     uuid := public.delivery_tenant_por_slug(p_slug);
  v_cfg        public.config_delivery;
  v_item       jsonb;
  v_prod       public.products;
  v_combo      public.combos;
  v_nome       text;
  v_preco_base numeric;
  v_preco_unit numeric;
  v_qtd        integer;
  v_comp_ids   uuid[];
  v_comp_soma  numeric;
  v_comp_nomes text;
  v_comp_validos integer;
  v_grupo_ids  uuid[];
  v_grp        record;
  v_grp_qtd    integer;
  v_subtotal   numeric := 0;
  v_taxa_res   jsonb;
  v_taxa       numeric;
  v_lat        numeric;
  v_lng        numeric;
  v_motivo     text;
  v_forma      text;
  v_endereco   text;
  v_pending_items jsonb := '[]'::jsonb;
  v_pedido     public.delivery_pedidos;
  v_numero     text;
  v_pending_id text;
  v_obs_txt    text;
  v_try        integer;
  v_fuso       text;
  v_dia        text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado.';
  END IF;

  SELECT * INTO v_cfg FROM public.config_delivery WHERE tenant_id = v_tenant;

  v_fuso := public.fuso_valido(v_cfg.fuso);

  -- Fail-closed: fechado → não aceita pedido. D15: quem decide é o
  -- agendamento no fuso do estabelecimento, não o flag que dependia de
  -- alguém estar com a tela do painel aberta na hora da virada.
  -- COALESCE porque a guarda é fail-CLOSED: `NOT NULL` é NULL, e um NULL
  -- escorregando aqui aceitaria o pedido com a loja fechada.
  IF NOT COALESCE(public.delivery_aberto_agora(v_cfg.horario, v_cfg.aberto, v_fuso), false) THEN
    RAISE EXCEPTION 'Estabelecimento fechado para pedidos no momento.';
  END IF;

  -- Forma de pagamento válida (pagamento é na entrega).
  v_forma := p_payload -> 'pagamento' ->> 'forma';
  IF NOT COALESCE(v_forma IN ('dinheiro', 'pix', 'cartao'), false) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  -- Endereço de entrega é obrigatório (guarda antes de qualquer INSERT).
  v_endereco := NULLIF(btrim(p_payload -> 'entrega' ->> 'endereco'), '');
  IF v_endereco IS NULL THEN
    RAISE EXCEPTION 'Endereço de entrega é obrigatório.';
  END IF;

  IF jsonb_typeof(p_payload -> 'itens') <> 'array'
     OR jsonb_array_length(p_payload -> 'itens') = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens.';
  END IF;

  -- ── Recalcula cada item no servidor ──────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'itens')
  LOOP
    v_qtd := GREATEST(1, COALESCE((v_item->>'qtd')::int, 1));
    v_comp_soma := 0;
    v_comp_nomes := NULL;
    v_comp_ids := NULL;  -- zera por item (não vazar escolha do item anterior)

    IF v_item ? 'combo_id' AND NULLIF(v_item->>'combo_id','') IS NOT NULL THEN
      SELECT * INTO v_combo
      FROM public.combos
      WHERE id = (v_item->>'combo_id')::uuid AND tenant_id = v_tenant AND ativo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      v_nome := v_combo.nome;
      v_preco_base := COALESCE(v_combo.preco_total, 0);
    ELSE
      SELECT * INTO v_prod
      FROM public.products
      WHERE id = (v_item->>'produto_id')::bigint AND tenant_id = v_tenant AND active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      -- exige que o produto esteja publicado no delivery e disponível
      IF NOT EXISTS (
        SELECT 1 FROM public.produto_delivery pd
        WHERE pd.produto_id = v_prod.id AND pd.tenant_id = v_tenant AND pd.disponivel
      ) THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      v_nome := v_prod.name;
      v_preco_base := v_prod.price;

      -- Fecho da árvore: TODOS os grupos alcançáveis por este produto
      -- (raiz + subgrupos, em qualquer profundidade).
      v_grupo_ids := ARRAY(
        SELECT grupo_id FROM public.grupos_do_produto(v_prod.id, v_tenant)
      );

      -- IDs de complemento escolhidos (deduplicados — cliente pode repetir).
      IF jsonb_typeof(v_item -> 'complementos') = 'array' THEN
        SELECT array_agg(DISTINCT (e)::uuid) INTO v_comp_ids
        FROM jsonb_array_elements_text(v_item -> 'complementos') e;
      END IF;

      -- ── D2: recusa complemento fora da árvore DESTE produto ──────────
      -- Conta quantos escolhidos são válidos (disponível, do tenant, em
      -- grupo do fecho). Se sobrar id que não casa, payload adulterado.
      IF v_comp_ids IS NOT NULL THEN
        SELECT count(DISTINCT c.id) INTO v_comp_validos
        FROM public.complementos c
        WHERE c.id = ANY(v_comp_ids)
          AND c.tenant_id = v_tenant
          AND c.disponivel
          AND c.grupo_id = ANY(v_grupo_ids);
        IF v_comp_validos <> COALESCE(array_length(v_comp_ids, 1), 0) THEN
          RAISE EXCEPTION 'Complemento indisponível ou inválido para este item.';
        END IF;

        -- ── D1: soma o preço dos complementos da árvore ───────────────
        SELECT COALESCE(sum(c.preco), 0), string_agg(c.nome, ', ' ORDER BY c.nome)
        INTO v_comp_soma, v_comp_nomes
        FROM public.complementos c
        WHERE c.id = ANY(v_comp_ids)
          AND c.tenant_id = v_tenant
          AND c.disponivel
          AND c.grupo_id = ANY(v_grupo_ids);
      END IF;

      -- ── D2: min/max/obrigatoriedade por grupo da árvore ──────────────
      -- Varre TODOS os grupos do fecho (mesmo os sem escolha) para pegar
      -- grupo obrigatório (min ≥ 1) que o cliente não mandou — em qualquer
      -- profundidade (subgrupos incluídos).
      FOR v_grp IN
        SELECT g.id, g.nome, g.min_escolhas, g.max_escolhas
        FROM public.grupos_complemento g
        WHERE g.tenant_id = v_tenant
          AND g.id = ANY(v_grupo_ids)
      LOOP
        SELECT count(*) INTO v_grp_qtd
        FROM public.complementos c
        WHERE c.grupo_id = v_grp.id
          AND c.tenant_id = v_tenant
          AND c.disponivel
          AND c.id = ANY(COALESCE(v_comp_ids, ARRAY[]::uuid[]));

        IF v_grp_qtd < COALESCE(v_grp.min_escolhas, 0) THEN
          RAISE EXCEPTION 'Escolha ao menos % opção(ões) em "%".',
            v_grp.min_escolhas, v_grp.nome;
        END IF;
        IF v_grp.max_escolhas IS NOT NULL AND v_grp_qtd > v_grp.max_escolhas THEN
          RAISE EXCEPTION 'No máximo % opção(ões) em "%".',
            v_grp.max_escolhas, v_grp.nome;
        END IF;
      END LOOP;
    END IF;

    v_preco_unit := v_preco_base + COALESCE(v_comp_soma, 0);
    v_subtotal := v_subtotal + v_preco_unit * v_qtd;

    -- obs consolidada (complementos + observação do cliente) p/ pending
    v_obs_txt := NULLIF(concat_ws(' · ', v_comp_nomes, NULLIF(btrim(v_item->>'obs'), '')), '');

    v_pending_items := v_pending_items || jsonb_build_object(
      'id',    COALESCE(v_item->>'produto_id', v_item->>'combo_id'),
      'name',  v_nome,
      'price', v_preco_unit,
      'qty',   v_qtd,
      'obs',   CASE WHEN v_obs_txt IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_obs_txt) END
    );
  END LOOP;

  -- ── Pedido mínimo ────────────────────────────────────────────────
  IF v_subtotal < COALESCE(v_cfg.pedido_minimo, 0) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo de R$ %.', v_cfg.pedido_minimo;
  END IF;

  -- ── Taxa recalculada no servidor ─────────────────────────────────
  -- Coordenada só é aceita quando o JSON traz NÚMERO (payload adulterado
  -- com texto não derruba a função num erro de cast).
  IF jsonb_typeof(p_payload -> 'entrega' -> 'lat') = 'number'
     AND jsonb_typeof(p_payload -> 'entrega' -> 'lng') = 'number' THEN
    v_lat := (p_payload -> 'entrega' ->> 'lat')::numeric;
    v_lng := (p_payload -> 'entrega' ->> 'lng')::numeric;
  END IF;

  -- (0,0) não é endereço de ninguém — é o meio do Atlântico. App antigo em
  -- cache manda o par zerado no lugar de omitir; trata como ausente.
  IF v_lat = 0 AND v_lng = 0 THEN
    v_lat := NULL;
    v_lng := NULL;
  END IF;

  v_taxa_res := public.calcular_taxa_entrega(
    p_slug,
    p_payload -> 'entrega' ->> 'cep',
    p_payload -> 'entrega' ->> 'bairro',
    v_lat,
    v_lng
  );
  IF NOT COALESCE((v_taxa_res->>'ok')::boolean, false) THEN
    v_motivo := v_taxa_res->>'motivo';
    -- Falta de coordenada ou origem não configurada NÃO é endereço fora
    -- de área: dizer que é manda o cliente corrigir o que está certo.
    IF v_motivo IN ('sem_coordenada', 'origem_indefinida') THEN
      RAISE EXCEPTION 'Não conseguimos calcular a entrega para este endereço agora. Confira a rua e o número, ou fale com o estabelecimento.';
    END IF;
    RAISE EXCEPTION 'Endereço fora da área de entrega.';
  END IF;
  v_taxa := (v_taxa_res->>'taxa')::numeric;

  v_pending_id := 'dlv_' || replace(gen_random_uuid()::text, '-', '');

  -- ── Número do pedido (humano, por tenant/dia) + gravação ─────────
  -- D14: o dia é o do ESTABELECIMENTO, não o de Greenwich — senão o
  -- expediente vira de dia às 21h e a contagem reinicia em 001 no meio
  -- do movimento. A sequência sai do MAIOR número já emitido no dia (não
  -- de count(*)), e o filtro é o próprio prefixo do número (não
  -- created_at, que é UTC): assim um pedido apagado não faz a conta
  -- devolver para sempre um número que já existe, travando a loja.
  -- to_char(...,'FM000') no lugar de lpad(...,3,'0') porque lpad TRUNCA
  -- o que passa de 3 dígitos — o pedido 1000 viraria 100.
  v_dia := to_char(timezone(v_fuso, now()), 'YYMMDD');

  FOR v_try IN 1..8 LOOP
    SELECT v_dia || '-' || to_char(
             COALESCE(max(split_part(numero, '-', 2)::int), 0) + v_try, 'FM000')
      INTO v_numero
    FROM public.delivery_pedidos
    WHERE tenant_id = v_tenant
      AND numero ~ ('^' || v_dia || '-[0-9]+$');

    BEGIN
      INSERT INTO public.delivery_pedidos (
        tenant_id, numero, cliente_nome, cliente_telefone,
        cep, bairro, endereco, complemento_endereco,
        subtotal, taxa_entrega, total,
        forma_pagamento, troco_para, levar_maquininha, status, pending_id
      ) VALUES (
        v_tenant,
        v_numero,
        COALESCE(NULLIF(btrim(p_payload -> 'cliente' ->> 'nome'), ''), 'Cliente'),
        p_payload -> 'cliente' ->> 'telefone',
        p_payload -> 'entrega' ->> 'cep',
        p_payload -> 'entrega' ->> 'bairro',
        v_endereco,
        p_payload -> 'entrega' ->> 'complemento',
        v_subtotal, v_taxa, v_subtotal + v_taxa,
        v_forma,
        NULLIF(p_payload -> 'pagamento' ->> 'troco_para', '')::numeric,
        COALESCE((p_payload -> 'pagamento' ->> 'levar_maquininha')::boolean, false),
        'recebido',
        v_pending_id
      ) RETURNING * INTO v_pedido;
      EXIT;  -- gravou sem colisão de número
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 8 THEN
        RAISE EXCEPTION 'Não foi possível gerar o número do pedido. Tente novamente.';
      END IF;
    END;
  END LOOP;

  INSERT INTO public.delivery_pedido_itens (
    tenant_id, pedido_id, produto_id, combo_id, nome, qtd, preco_unit, complementos, obs
  )
  SELECT
    v_tenant, v_pedido.id,
    NULLIF(orig->>'produto_id','')::bigint,
    NULLIF(orig->>'combo_id','')::uuid,
    COALESCE(pi->>'name', 'Item'),
    GREATEST(1, COALESCE((orig->>'qtd')::int, 1)),
    (pi->>'price')::numeric,
    COALESCE(orig->'complementos', '[]'::jsonb),
    NULLIF(btrim(orig->>'obs'), '')
  FROM jsonb_array_elements(p_payload -> 'itens') WITH ORDINALITY AS a(orig, o1)
  JOIN jsonb_array_elements(v_pending_items)      WITH ORDINALITY AS b(pi,   o2)
    ON o1 = o2;

  -- ── Espelha em `pending` (Realtime → Cozinha / mini-painel) ──────
  INSERT INTO public.pending (
    id, tenant_id, comanda, items, status, note, total, created_by, apelido
  ) VALUES (
    v_pending_id,
    v_tenant,
    'Delivery ' || v_numero,
    v_pending_items,
    'open',
    concat_ws(' · ',
      'DELIVERY',
      p_payload -> 'entrega' ->> 'endereco',
      CASE v_forma WHEN 'dinheiro' THEN 'Dinheiro'
                   WHEN 'pix' THEN 'Pix'
                   ELSE 'Cartão' END
      || CASE WHEN COALESCE((p_payload -> 'pagamento' ->> 'levar_maquininha')::boolean, false)
              THEN ' (levar maquininha)' ELSE '' END),
    v_subtotal + v_taxa,
    'delivery',
    COALESCE(NULLIF(btrim(p_payload -> 'cliente' ->> 'nome'), ''), 'Cliente')
  );

  RETURN jsonb_build_object(
    'ok',     true,
    'numero', v_numero,
    'status', 'recebido',
    'total',  v_subtotal + v_taxa
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- 7. Autoteste — roda AGORA, no banco, e aborta a migração se errar.
--    O front não tem Postgres para rodar plpgsql; esta é a prova de
--    que a regra faz o que promete, executada onde ela vive.
-- ══════════════════════════════════════════════════════════════════
DO $auto$
DECLARE
  -- Sempre aberto, 18:00 às 23:00, todos os dias.
  h_dia    jsonb := '{"auto":true,"dias":[0,1,2,3,4,5,6],
                      "faixas":[{"abre":"18:00","fecha":"23:00"}]}';
  -- Só quarta-feira, 18:00 às 02:00 (vira a noite).
  h_noite  jsonb := '{"auto":true,"dias":[3],
                      "faixas":[{"abre":"18:00","fecha":"02:00"}]}';
  -- Só quarta-feira, 21:30 às 23:00 — janela que só existe no fuso local.
  h_tarde  jsonb := '{"auto":true,"dias":[3],
                      "faixas":[{"abre":"21:30","fecha":"23:00"}]}';
  -- Formato legado: janela única em abre/fecha no topo.
  h_legado jsonb := '{"auto":true,"dias":[3],"abre":"18:00","fecha":"23:00"}';
  n        int;
BEGIN
  -- ── paraMinutos ──────────────────────────────────────────────────
  IF public.hhmm_para_minutos('08:05') <> 485 THEN RAISE EXCEPTION 'hhmm 08:05'; END IF;
  IF public.hhmm_para_minutos('8:05')  <> 485 THEN RAISE EXCEPTION 'hhmm 8:05';  END IF;
  IF public.hhmm_para_minutos(' 18:00 ') <> 1080 THEN RAISE EXCEPTION 'hhmm com espaço'; END IF;
  IF public.hhmm_para_minutos('24:00') IS NOT NULL THEN RAISE EXCEPTION 'hhmm 24:00'; END IF;
  IF public.hhmm_para_minutos('12:60') IS NOT NULL THEN RAISE EXCEPTION 'hhmm 12:60'; END IF;
  IF public.hhmm_para_minutos('abc')   IS NOT NULL THEN RAISE EXCEPTION 'hhmm texto'; END IF;
  IF public.hhmm_para_minutos(NULL)    IS NOT NULL THEN RAISE EXCEPTION 'hhmm nulo';  END IF;

  -- ── fuso_valido ──────────────────────────────────────────────────
  IF public.fuso_valido('UTC') <> 'UTC' THEN RAISE EXCEPTION 'fuso UTC'; END IF;
  IF public.fuso_valido('Marte/Olympus') <> 'America/Sao_Paulo' THEN
    RAISE EXCEPTION 'fuso inexistente devia cair no padrão'; END IF;
  IF public.fuso_valido(NULL) <> 'America/Sao_Paulo' THEN RAISE EXCEPTION 'fuso nulo'; END IF;
  IF public.fuso_valido('   ') <> 'America/Sao_Paulo' THEN RAISE EXCEPTION 'fuso em branco'; END IF;

  -- ── Agendamento desligado ⇒ vale o controle manual ───────────────
  IF public.delivery_aberto_agora('{"auto":false}', true)  IS NOT TRUE  THEN
    RAISE EXCEPTION 'auto off + manual aberto'; END IF;
  IF public.delivery_aberto_agora('{"auto":false}', false) IS NOT FALSE THEN
    RAISE EXCEPTION 'auto off + manual fechado'; END IF;
  IF public.delivery_aberto_agora(NULL, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'horario nulo devia deixar o manual mandar'; END IF;

  -- ── Agendamento incompleto ⇒ não governa (não fecha por engano) ──
  IF public.delivery_aberto_agora(
       '{"auto":true,"faixas":[{"abre":"18:00","fecha":"23:00"}]}', true) IS NOT TRUE THEN
    RAISE EXCEPTION 'sem dias não devia governar'; END IF;
  IF public.delivery_aberto_agora('{"auto":true,"dias":[3]}', true) IS NOT TRUE THEN
    RAISE EXCEPTION 'sem faixas não devia governar'; END IF;
  IF public.delivery_aberto_agora(
       '{"auto":true,"dias":[3],"faixas":[{"abre":"18:00","fecha":"23:00"},{"abre":"10:00"}]}',
       true, 'America/Sao_Paulo', '2026-07-29 23:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'faixa pela metade não devia governar'; END IF;
  IF public.delivery_aberto_agora(
       '{"auto":true,"dias":[3],"faixas":[{"abre":"18:00","fecha":"18:00"}]}',
       false, 'America/Sao_Paulo', '2026-07-29 23:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'abre igual a fecha não devia governar'; END IF;
  -- Faixa vazia é ruído de edição: sai da lista e não invalida o resto.
  IF public.delivery_aberto_agora(
       '{"auto":true,"dias":[3],"faixas":[{"abre":"18:00","fecha":"23:00"},{}]}',
       false, 'America/Sao_Paulo', '2026-07-29 23:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'faixa vazia devia ser descartada'; END IF;
  -- Faixa com as duas pontas ilegíveis também sai (normalizarFaixas normaliza
  -- a hora ANTES de descartar) — não pode derrubar a loja por ruído.
  IF public.delivery_aberto_agora(
       '{"auto":true,"dias":[3],"faixas":[{"abre":"18:00","fecha":"23:00"},{"abre":"abc","fecha":"xyz"}]}',
       false, 'America/Sao_Paulo', '2026-07-29 23:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'faixa ilegível inteira devia ser descartada'; END IF;
  -- Mas com UMA ponta ilegível a faixa continua na lista e invalida o conjunto.
  IF public.delivery_aberto_agora(
       '{"auto":true,"dias":[3],"faixas":[{"abre":"18:00","fecha":"23:00"},{"abre":"abc","fecha":"22:00"}]}',
       false, 'America/Sao_Paulo', '2026-07-29 23:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'faixa com uma ponta ilegível devia invalidar o conjunto'; END IF;

  -- ── Janela normal: o agendamento manda nos DOIS sentidos ─────────
  -- 2026-07-29 21:00Z = quarta, 18:00 em São Paulo → abre mesmo com o
  -- flag gravado dizendo "fechado" (ninguém precisou estar com a tela aberta).
  IF public.delivery_aberto_agora(h_dia, false, 'America/Sao_Paulo',
       '2026-07-29 21:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'devia abrir às 18:00 locais'; END IF;
  -- 20:59Z = 17:59 local → ainda fechado, mesmo com o flag dizendo "aberto".
  IF public.delivery_aberto_agora(h_dia, true, 'America/Sao_Paulo',
       '2026-07-29 20:59:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'não devia abrir antes da hora'; END IF;
  -- 2026-07-30 02:00Z = 23:00 local → fim exclusivo, fecha na hora certa.
  IF public.delivery_aberto_agora(h_dia, true, 'America/Sao_Paulo',
       '2026-07-30 02:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'devia fechar às 23:00 locais'; END IF;

  -- ── A prova do fuso: mesma chamada, relógio diferente ────────────
  -- 2026-07-30 01:00Z é quinta em Greenwich e QUARTA 22:00 em São Paulo.
  IF public.delivery_aberto_agora(h_tarde, false, 'America/Sao_Paulo',
       '2026-07-30 01:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'janela 21:30-23:00 devia estar aberta às 22:00 locais'; END IF;
  IF public.delivery_aberto_agora(h_tarde, false, 'UTC',
       '2026-07-30 01:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'em UTC o mesmo instante é quinta 01:00 — devia estar fechado'; END IF;

  -- ── Janela que vira a noite + rescaldo da madrugada ──────────────
  -- Quarta 22:00 local (= 2026-07-30 01:00Z).
  IF public.delivery_aberto_agora(h_noite, false, 'America/Sao_Paulo',
       '2026-07-30 01:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'noturno: quarta 22:00 devia estar aberto'; END IF;
  -- Quinta 01:00 local (= 04:00Z) — madrugada que pertence à quarta.
  IF public.delivery_aberto_agora(h_noite, false, 'America/Sao_Paulo',
       '2026-07-30 04:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'noturno: rescaldo da quarta devia estar aberto'; END IF;
  -- Quinta 03:00 local (= 06:00Z) — passou de 02:00, acabou.
  IF public.delivery_aberto_agora(h_noite, false, 'America/Sao_Paulo',
       '2026-07-30 06:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'noturno: 03:00 da quinta devia estar fechado'; END IF;
  -- Quarta 17:00 local (= 20:00Z) — antes de abrir.
  IF public.delivery_aberto_agora(h_noite, false, 'America/Sao_Paulo',
       '2026-07-29 20:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'noturno: 17:00 da quarta devia estar fechado'; END IF;
  -- Sexta 01:00 local (= 04:00Z de sexta): quinta não é dia de atendimento,
  -- então não existe rescaldo.
  IF public.delivery_aberto_agora(h_noite, false, 'America/Sao_Paulo',
       '2026-07-31 04:00:00+00') IS NOT FALSE THEN
    RAISE EXCEPTION 'noturno: sem atendimento na quinta não há rescaldo'; END IF;

  -- ── Formato legado (janela única no topo do objeto) ──────────────
  IF public.delivery_aberto_agora(h_legado, false, 'America/Sao_Paulo',
       '2026-07-29 23:00:00+00') IS NOT TRUE THEN
    RAISE EXCEPTION 'formato legado devia continuar funcionando'; END IF;

  -- ── Número do pedido: sequência sobrevive a pedido apagado ───────
  CREATE TEMP TABLE _numeros (numero text);
  INSERT INTO _numeros VALUES ('260730-001'), ('260730-003'),
                              ('260729-009'), ('Delivery avulso');
  -- O 002 foi apagado. count(*)+1 daria 3 (que já existe e travaria a loja
  -- para sempre); MAX+1 dá 4.
  SELECT COALESCE(max(split_part(numero, '-', 2)::int), 0) + 1 INTO n
  FROM _numeros WHERE numero ~ '^260730-[0-9]+$';
  IF n <> 4 THEN RAISE EXCEPTION 'sequência do dia devia ser 4, veio %', n; END IF;
  -- Dia sem nenhum pedido começa em 001.
  SELECT COALESCE(max(split_part(numero, '-', 2)::int), 0) + 1 INTO n
  FROM _numeros WHERE numero ~ '^260801-[0-9]+$';
  IF n <> 1 THEN RAISE EXCEPTION 'dia vazio devia começar em 1, veio %', n; END IF;
  -- Formatação não trunca acima de 999 (lpad truncava).
  IF to_char(1, 'FM000')    <> '001'  THEN RAISE EXCEPTION 'formato 001';  END IF;
  IF to_char(47, 'FM000')   <> '047'  THEN RAISE EXCEPTION 'formato 047';  END IF;
  IF to_char(1000, 'FM000') <> '1000' THEN RAISE EXCEPTION 'formato 1000'; END IF;
  DROP TABLE _numeros;

  RAISE NOTICE 'Run 6 leva 5: autoteste OK (horário no fuso do estabelecimento + numeração à prova de exclusão).';
END;
$auto$;
