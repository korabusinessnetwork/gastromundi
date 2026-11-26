-- ══════════════════════════════════════════════════════════════════
-- A opção do delivery deixa de ser marcado/desmarcado: passa a ter
-- QUANTIDADE, e o grupo conta porções.
--
-- ┌─ Por que ─────────────────────────────────────────────────────────┐
-- │ "Escolha 3 cortes" numa caixa de frango quase nunca é um de cada:  │
-- │ é dois de filezinho e um de coxinha da asa. A vitrine só sabia     │
-- │ marcar e desmarcar, então a segunda porção não tinha como ser      │
-- │ pedida, e o mínimo do grupo contava OPÇÕES distintas em vez das    │
-- │ três porções que o cliente ia receber. O PDV já contava porções    │
-- │ desde o "double cheddar"; era a vitrine que ficara para trás.      │
-- └────────────────────────────────────────────────────────────────────┘
--
-- O QUE MUDA NO PAYLOAD: `complementos` continua sendo um array, e o id
-- solto continua valendo (uma porção). Quando o cliente pede a mesma
-- opção mais de uma vez, a entrada vira { "id": ..., "qtd": n }. As duas
-- formas convivem de propósito: o navegador guarda o app em cache, então
-- uma tela nova pode chegar aqui antes desta migração rodar, e é melhor
-- que só o que é novo falhe do que todo pedido com complemento.
--
-- O QUE MUDA NA COBRANÇA: o array de preços do grupo entra REPETIDO pela
-- quantidade. É o que faz as três regras continuarem valendo sem nenhum
-- caso especial e sem divergir do JS (`precoDoGrupo` em src/lib/combos.js):
--
--   • 'soma'  — duas porções de R$ 4 custam R$ 8;
--   • 'maior' — duas fatias de calabresa e uma de portuguesa continuam
--     sendo UMA pizza, cobrada pelo sabor mais caro;
--   • 'media' — a média ponderada pelas fatias.
--
-- O QUE NÃO MUDA: quem cobra continua sendo o servidor. A opção ainda
-- precisa ser de um grupo DAQUELE produto, o mínimo e o máximo continuam
-- sendo cobrados (agora em porções), e loja fechada, pedido mínimo,
-- endereço fora de área e item indisponível continuam recusando antes.
--
-- A função vem LITERALMENTE da 20261012 (que já trazia o aceite
-- automático), com o mapa de quantidades acrescentado nos cinco pontos
-- onde a contagem acontecia. Numeração, taxa, espelho em `pending` e
-- cadastro do cliente são o mesmo texto.
-- ══════════════════════════════════════════════════════════════════

-- ── Quantas porções daquela opção o cliente pediu ──────────────────
--
-- Opção que não está no mapa vale 1: é o pedido de sempre, com a lista
-- de ids soltos, e também o item que chegou por outro caminho. Zero e
-- negativo não existem aqui — quem não quer a opção não a manda.
CREATE OR REPLACE FUNCTION public.qtd_da_opcao(p_opcoes jsonb, p_id text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, COALESCE(NULLIF(p_opcoes ->> p_id, '')::int, 1));
$$;

COMMENT ON FUNCTION public.qtd_da_opcao(jsonb, text) IS
  'Quantas porções de uma opção o item pediu; 1 quando a lista não diz.';

-- ── criar_pedido_delivery: a opção passa a ter quantidade ──────────
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
  -- As opções escolhidas DESTE item, já normalizadas: id (texto) → quantas.
  -- A lista crua aceita as duas formas, o id solto de sempre e
  -- { "id": ..., "qtd": n }, porque o navegador guarda o app em cache e a
  -- tela antiga continua no ar por um tempo depois do deploy.
  v_opcoes     jsonb;
  v_comp_soma  numeric;
  v_comp_nomes text;
  v_comp_validos integer;
  v_grupo_ids  uuid[];
  v_grp        record;
  v_grp_qtd    integer;
  -- Grupos de escolha do cadastro do produto (modelo do PDV).
  v_esc_ids    uuid[];
  v_cat_ids    bigint[];
  v_esc_soma   numeric;
  v_esc_nomes  text;
  v_esc_validos integer;
  v_ge         record;
  v_ge_precos  numeric[];
  v_ge_qtd     integer;
  v_subtotal   numeric := 0;
  v_taxa_res   jsonb;
  v_taxa       numeric;
  v_lat        numeric;
  v_lng        numeric;
  v_motivo     text;
  v_forma      text;
  v_endereco   text;
  v_retirada   boolean;
  v_dispositivo uuid;
  v_telefone   text;
  v_nascimento date;
  v_agora      timestamptz := now();
  v_pending_items jsonb := '[]'::jsonb;
  v_pedido     public.delivery_pedidos;
  v_numero     text;
  v_pending_id text;
  v_obs_txt    text;
  v_try        integer;
  v_fuso       text;
  v_dia        text;
  v_seq        integer;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado.';
  END IF;

  SELECT * INTO v_cfg FROM public.config_delivery WHERE tenant_id = v_tenant;

  v_fuso := public.fuso_valido(v_cfg.fuso);

  IF NOT COALESCE(public.delivery_aberto_agora(v_cfg.horario, v_cfg.aberto, v_fuso), false) THEN
    RAISE EXCEPTION 'Estabelecimento fechado para pedidos no momento.';
  END IF;

  v_forma := p_payload -> 'pagamento' ->> 'forma';
  IF NOT COALESCE(v_forma IN ('dinheiro', 'pix', 'cartao'), false) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  -- Identidade anônima do aparelho. Só entra se for UUID de verdade:
  -- texto qualquer viraria erro de cast e derrubaria o pedido inteiro por
  -- causa de uma comodidade, não de uma regra.
  BEGIN
    v_dispositivo := NULLIF(btrim(COALESCE(p_payload ->> 'dispositivo_id', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_dispositivo := NULL;
  END;

  -- Telefone obrigatório. É o único caminho do estabelecimento até o
  -- cliente quando o pedido trava: o entregador não acha o endereço, um
  -- item acabou, a campainha não toca. Sem ele o pedido vira um bilhete
  -- sem remetente e o botão de WhatsApp do painel fica inerte.
  v_telefone := regexp_replace(COALESCE(p_payload -> 'cliente' ->> 'telefone', ''), '\D', '', 'g');
  -- Data de nascimento: OPCIONAL e tolerante. Rabisco, data no futuro ou
  -- idade impossível viram NULL em vez de derrubar o pedido — ninguém
  -- perde a janta porque errou o ano de nascimento. Quem valida de
  -- verdade é a tela; aqui é a última linha de defesa contra lixo.
  BEGIN
    v_nascimento := NULLIF(btrim(COALESCE(p_payload -> 'cliente' ->> 'data_nascimento', '')), '')::date;
  EXCEPTION WHEN others THEN
    v_nascimento := NULL;
  END;
  IF v_nascimento IS NOT NULL
     AND (v_nascimento > CURRENT_DATE OR v_nascimento < CURRENT_DATE - INTERVAL '120 years') THEN
    v_nascimento := NULL;
  END IF;

  IF NOT public.telefone_br_valido(v_telefone) THEN
    RAISE EXCEPTION 'Informe um telefone válido com DDD para o estabelecimento falar com você.';
  END IF;

  v_retirada := COALESCE(p_payload -> 'entrega' ->> 'tipo', 'entrega') = 'retirada';

  IF v_retirada THEN
    IF NOT COALESCE(v_cfg.permite_retirada, false) THEN
      RAISE EXCEPTION 'Este estabelecimento não aceita retirada no local.';
    END IF;
    v_endereco := COALESCE(
      NULLIF(btrim(COALESCE(v_cfg.endereco_origem, '')), ''),
      'Retirada no local'
    );
    v_taxa := 0;
  ELSE
    v_endereco := NULLIF(btrim(p_payload -> 'entrega' ->> 'endereco'), '');
    IF v_endereco IS NULL THEN
      RAISE EXCEPTION 'Endereço de entrega é obrigatório.';
    END IF;
  END IF;

  IF jsonb_typeof(p_payload -> 'itens') <> 'array'
     OR jsonb_array_length(p_payload -> 'itens') = 0 THEN
    RAISE EXCEPTION 'Pedido sem itens.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload -> 'itens')
  LOOP
    v_qtd := GREATEST(1, COALESCE((v_item->>'qtd')::int, 1));
    v_comp_soma := 0;
    v_comp_nomes := NULL;
    v_comp_ids := NULL;
    v_opcoes := '{}'::jsonb;
    v_esc_ids := NULL;
    v_cat_ids := NULL;
    v_esc_soma := 0;
    v_esc_nomes := NULL;

    IF v_item ? 'combo_id' AND NULLIF(v_item->>'combo_id','') IS NOT NULL THEN
      SELECT * INTO v_combo
      FROM public.combos
      WHERE id = (v_item->>'combo_id')::uuid AND tenant_id = v_tenant AND ativo;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      IF public.combo_indisponivel(v_combo.id, v_tenant) THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      IF COALESCE(v_combo.preco_total, 0) <= 0 THEN
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
      IF NOT EXISTS (
        SELECT 1 FROM public.produto_delivery pd
        WHERE pd.produto_id = v_prod.id AND pd.tenant_id = v_tenant AND pd.disponivel
      ) THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      IF public.categoria_interna(v_prod.category) OR COALESCE(v_prod.price, 0) <= 0 THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      v_nome := v_prod.name;
      v_preco_base := v_prod.price;

      v_grupo_ids := ARRAY(
        SELECT grupo_id FROM public.grupos_do_produto(v_prod.id, v_tenant)
      );

      -- As opções chegam todas no mesmo array `complementos`, em uma de
      -- duas formas: o id solto de sempre, ou { "id": ..., "qtd": n }
      -- quando o cliente pediu a MESMA opção mais de uma vez. As duas
      -- viram aqui o mesmo mapa id → quantas, e id repetido SOMA em vez
      -- de ser descartado: era o DISTINCT que fazia a segunda porção
      -- sumir sem ninguém notar.
      IF jsonb_typeof(v_item -> 'complementos') = 'array' THEN
        SELECT COALESCE(jsonb_object_agg(t.id, t.qtd), '{}'::jsonb)
        INTO v_opcoes
        FROM (
          SELECT CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'id'
                      ELSE e #>> '{}' END AS id,
                 sum(CASE WHEN jsonb_typeof(e) = 'object'
                            THEN GREATEST(1, COALESCE((e->>'qtd')::int, 1))
                          ELSE 1 END)::int AS qtd
          FROM jsonb_array_elements(v_item -> 'complementos') e
          WHERE CASE WHEN jsonb_typeof(e) = 'object' THEN e->>'id'
                     ELSE e #>> '{}' END IS NOT NULL
          GROUP BY 1
        ) t;

        -- A separação por ONDE o id existe é a mesma de antes: complemento
        -- do delivery, item de grupo de escolha, ou 'cat:<produto_id>' de
        -- um grupo por categoria. Só a origem mudou, do array para as
        -- chaves do mapa.
        SELECT array_agg(DISTINCT substring(k from 5)::bigint) INTO v_cat_ids
        FROM jsonb_object_keys(v_opcoes) k
        WHERE k LIKE 'cat:%' AND substring(k from 5) ~ '^[0-9]+$';

        SELECT array_agg(DISTINCT k::uuid) INTO v_comp_ids
        FROM jsonb_object_keys(v_opcoes) k
        WHERE k NOT LIKE 'cat:%';
      END IF;

      -- Os uuids que são item de grupo de escolha DESTE produto saem da
      -- lista de complementos: são outro modelo, com outra validação e
      -- outra conta. Sem esta separação eles cairiam na checagem de
      -- complemento e o pedido seria recusado como "inválido".
      IF v_comp_ids IS NOT NULL THEN
        SELECT array_agg(DISTINCT gei.id) INTO v_esc_ids
        FROM public.grupo_escolha_itens gei
        JOIN public.grupos_escolha ge
          ON ge.id = gei.grupo_id AND ge.tenant_id = v_tenant
        WHERE gei.id = ANY(v_comp_ids)
          AND gei.tenant_id = v_tenant
          AND ge.produto_id = v_prod.id;

        IF v_esc_ids IS NOT NULL THEN
          SELECT array_agg(c) INTO v_comp_ids
          FROM unnest(v_comp_ids) c
          WHERE NOT (c = ANY(v_esc_ids));
        END IF;
      END IF;

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

        -- Cada complemento cobra pela quantidade pedida, e o nome sai com
        -- ela na frente: "2x Bacon" e não "Bacon", senão a cozinha monta
        -- um e o cliente pagou dois.
        SELECT COALESCE(sum(c.preco * public.qtd_da_opcao(v_opcoes, c.id::text)), 0),
               string_agg(
                 CASE WHEN public.qtd_da_opcao(v_opcoes, c.id::text) > 1
                        THEN public.qtd_da_opcao(v_opcoes, c.id::text) || 'x ' || c.nome
                      ELSE c.nome END,
                 ', ' ORDER BY c.nome)
        INTO v_comp_soma, v_comp_nomes
        FROM public.complementos c
        WHERE c.id = ANY(v_comp_ids)
          AND c.tenant_id = v_tenant
          AND c.disponivel
          AND c.grupo_id = ANY(v_grupo_ids);
      END IF;

      FOR v_grp IN
        SELECT g.id, g.nome, g.min_escolhas, g.max_escolhas
        FROM public.grupos_complemento g
        WHERE g.tenant_id = v_tenant
          AND g.id = ANY(v_grupo_ids)
      LOOP
        -- Mínimo e máximo contam PORÇÕES, não opções distintas: duas de
        -- bacon e uma de ovo são três, que é como o PDV sempre contou.
        SELECT COALESCE(sum(public.qtd_da_opcao(v_opcoes, c.id::text)), 0) INTO v_grp_qtd
        FROM public.complementos c
        WHERE c.grupo_id = v_grp.id
          AND c.tenant_id = v_tenant
          AND c.disponivel
          AND c.id = ANY(COALESCE(v_comp_ids, ARRAY[]::uuid[]));

        IF v_grp_qtd < COALESCE(v_grp.min_escolhas, 0) THEN
          RAISE EXCEPTION 'Escolha ao menos % opção(ões) em "%".',
            v_grp.min_escolhas, v_grp.nome;
        END IF;
        -- max_escolhas = 0 é "sem limite": o grupo aceita quantas o
        -- cliente quiser. Sem o `> 0` esta linha recusaria QUALQUER
        -- escolha nesses grupos (qtd 1 já é > 0), que é o oposto do que
        -- zerar o máximo quer dizer na tela.
        IF v_grp.max_escolhas IS NOT NULL AND v_grp.max_escolhas > 0
           AND v_grp_qtd > v_grp.max_escolhas THEN
          RAISE EXCEPTION 'No máximo % opção(ões) em "%".',
            v_grp.max_escolhas, v_grp.nome;
        END IF;
      END LOOP;

      -- ── Grupos de escolha do cadastro do produto ─────────────────
      -- Todo id que sobrou tem de ser opção viva de um grupo DESTE
      -- produto. Um id de outro produto aqui seria o cliente pedindo um
      -- sabor que a tela nunca ofereceu.
      IF v_esc_ids IS NOT NULL THEN
        SELECT count(*) INTO v_esc_validos
        FROM public.grupo_escolha_itens gei
        JOIN public.grupos_escolha ge
          ON ge.id = gei.grupo_id AND ge.tenant_id = v_tenant
        JOIN public.products pr
          ON pr.id = gei.produto_id AND pr.tenant_id = v_tenant
        WHERE gei.id = ANY(v_esc_ids)
          AND gei.tenant_id = v_tenant
          AND ge.produto_id = v_prod.id
          AND COALESCE(gei.ativo, true)
          AND pr.active;
        IF v_esc_validos <> COALESCE(array_length(v_esc_ids, 1), 0) THEN
          RAISE EXCEPTION 'Opção indisponível ou inválida para este item.';
        END IF;
      END IF;

      -- Cada grupo cobra pela SUA regra; grupos diferentes se somam. É o
      -- que faz "4 sabores de R$ 40" custar uma pizza e não quatro.
      FOR v_ge IN
        SELECT ge.id, ge.nome, ge.minimo, ge.maximo, ge.origem, ge.categoria,
               COALESCE(NULLIF(ge.regra_preco, ''), 'soma') AS regra
        FROM public.grupos_escolha ge
        WHERE ge.tenant_id = v_tenant AND ge.produto_id = v_prod.id
      LOOP
        IF v_ge.origem = 'categoria' THEN
          -- O array de preços entra REPETIDO pela quantidade, e é isso
          -- que faz as três regras continuarem valendo sem nenhum caso
          -- especial: 'soma' soma as porções, 'maior' ignora quantas são
          -- (duas fatias de calabresa continuam sendo uma pizza) e
          -- 'media' pondera por elas. Mesma conta do JS (precoDoGrupo).
          WITH escolhidas AS (
            SELECT pr.name AS nome,
                   CASE WHEN v_ge.regra = 'soma' THEN 0
                        ELSE COALESCE(pr.price, 0) END AS preco,
                   public.qtd_da_opcao(v_opcoes, 'cat:' || pr.id) AS q
            FROM public.products pr
            WHERE pr.tenant_id = v_tenant
              AND pr.active
              AND pr.category = v_ge.categoria
              AND pr.id = ANY(COALESCE(v_cat_ids, ARRAY[]::bigint[]))
          )
          SELECT
            (SELECT array_agg(e.preco) FROM escolhidas e, generate_series(1, e.q)),
            (SELECT COALESCE(sum(e.q), 0) FROM escolhidas e),
            (SELECT string_agg(
                      CASE WHEN e.q > 1 THEN e.q || 'x ' || e.nome ELSE e.nome END,
                      ', ' ORDER BY e.nome)
             FROM escolhidas e)
          INTO v_ge_precos, v_ge_qtd, v_esc_nomes;
        ELSE
          -- Mesma regra de preço do PDV (precoDaOpcao): preço próprio
          -- manda; sem ele, 'soma' não cobra e as outras usam o preço do
          -- produto no cadastro.
          WITH escolhidas AS (
            SELECT pr.name AS nome,
                   CASE
                     WHEN COALESCE(gei.preco_customizado, 0) > 0
                       THEN gei.preco_customizado
                     WHEN v_ge.regra = 'soma' THEN 0
                     ELSE COALESCE(pr.price, 0)
                   END AS preco,
                   public.qtd_da_opcao(v_opcoes, gei.id::text) AS q
            FROM public.grupo_escolha_itens gei
            JOIN public.products pr
              ON pr.id = gei.produto_id AND pr.tenant_id = v_tenant
            WHERE gei.grupo_id = v_ge.id
              AND gei.tenant_id = v_tenant
              AND gei.id = ANY(COALESCE(v_esc_ids, ARRAY[]::uuid[]))
          )
          SELECT
            (SELECT array_agg(e.preco) FROM escolhidas e, generate_series(1, e.q)),
            (SELECT COALESCE(sum(e.q), 0) FROM escolhidas e),
            (SELECT string_agg(
                      CASE WHEN e.q > 1 THEN e.q || 'x ' || e.nome ELSE e.nome END,
                      ', ' ORDER BY e.nome)
             FROM escolhidas e)
          INTO v_ge_precos, v_ge_qtd, v_esc_nomes;
        END IF;

        v_ge_qtd := COALESCE(v_ge_qtd, 0);

        IF v_ge_qtd < COALESCE(v_ge.minimo, 0) THEN
          RAISE EXCEPTION 'Escolha ao menos % opção(ões) em "%".',
            v_ge.minimo, v_ge.nome;
        END IF;
        -- maximo = 0 é "sem limite", igual ao resto do sistema.
        IF v_ge.maximo IS NOT NULL AND v_ge.maximo > 0 AND v_ge_qtd > v_ge.maximo THEN
          RAISE EXCEPTION 'No máximo % opção(ões) em "%".', v_ge.maximo, v_ge.nome;
        END IF;

        v_esc_soma := COALESCE(v_esc_soma, 0)
          + public.preco_grupo_escolha_delivery(v_ge_precos, v_ge.regra);
        -- Os sabores escolhidos entram na mesma linha de observação dos
        -- complementos: é ela que a cozinha e o cliente leem.
        v_comp_nomes := NULLIF(concat_ws(', ', v_comp_nomes, v_esc_nomes), '');
      END LOOP;
    END IF;

    v_preco_unit := v_preco_base + COALESCE(v_comp_soma, 0) + COALESCE(v_esc_soma, 0);
    v_subtotal := v_subtotal + v_preco_unit * v_qtd;

    v_obs_txt := NULLIF(concat_ws(' · ', v_comp_nomes, NULLIF(btrim(v_item->>'obs'), '')), '');

    v_pending_items := v_pending_items || jsonb_build_object(
      'id',    COALESCE(v_item->>'produto_id', v_item->>'combo_id'),
      'name',  v_nome,
      'price', v_preco_unit,
      'qty',   v_qtd,
      'obs',   CASE WHEN v_obs_txt IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_obs_txt) END,
      -- O CARIMBO QUE FALTAVA. Sem ele o pedido de delivery não rende
      -- lançamento nenhum (lancamentosDoPedido pula item sem launched_at),
      -- e o vigia que imprime sozinho no computador do caixa nunca via o
      -- pedido chegar. O papel só saía se alguém estivesse olhando a tela
      -- da Cozinha e clicasse. Todos os itens do pedido levam o MESMO
      -- instante: é um lançamento só, e é isso que faz o eco do realtime
      -- render um papel, não três.
      'launched_at', v_agora
    );
  END LOOP;

  IF v_subtotal < COALESCE(v_cfg.pedido_minimo, 0) THEN
    RAISE EXCEPTION 'Pedido abaixo do mínimo de R$ %.', v_cfg.pedido_minimo;
  END IF;

  IF NOT v_retirada THEN
    IF jsonb_typeof(p_payload -> 'entrega' -> 'lat') = 'number'
       AND jsonb_typeof(p_payload -> 'entrega' -> 'lng') = 'number' THEN
      v_lat := (p_payload -> 'entrega' ->> 'lat')::numeric;
      v_lng := (p_payload -> 'entrega' ->> 'lng')::numeric;
    END IF;

    IF v_lat = 0 AND v_lng = 0 THEN
      v_lat := NULL;
      v_lng := NULL;
    END IF;

    -- O CEP entra como está: vazio, `calcular_taxa_entrega` simplesmente
    -- não casa nenhuma faixa de CEP e resolve pelo bairro — que é o que
    -- a maioria dos estabelecimentos cadastra.
    v_taxa_res := public.calcular_taxa_entrega(
      p_slug,
      p_payload -> 'entrega' ->> 'cep',
      p_payload -> 'entrega' ->> 'bairro',
      v_lat,
      v_lng
    );
    IF NOT COALESCE((v_taxa_res->>'ok')::boolean, false) THEN
      v_motivo := v_taxa_res->>'motivo';
      IF v_motivo IN ('sem_coordenada', 'origem_indefinida') THEN
        RAISE EXCEPTION 'Não conseguimos calcular a entrega para este endereço agora. Confira a rua e o número, ou fale com o estabelecimento.';
      END IF;
      IF v_motivo = 'sem_area' THEN
        RAISE EXCEPTION 'Este estabelecimento ainda não configurou as áreas de entrega.';
      END IF;
      RAISE EXCEPTION 'Endereço fora da área de entrega.';
    END IF;
    v_taxa := (v_taxa_res->>'taxa')::numeric;
  END IF;

  v_pending_id := 'dlv_' || replace(gen_random_uuid()::text, '-', '');

  v_dia := to_char(timezone(v_fuso, now()), 'YYMMDD');

  FOR v_try IN 1..8 LOOP
    SELECT COALESCE(max(split_part(numero, '-', 2)::int), 0) + v_try
      INTO v_seq
    FROM public.delivery_pedidos
    WHERE tenant_id = v_tenant
      AND numero ~ ('^' || v_dia || '-[0-9]+$');

    v_numero := v_dia || '-' ||
                lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');

    BEGIN
      INSERT INTO public.delivery_pedidos (
        tenant_id, numero, cliente_nome, cliente_telefone,
        cep, bairro, cidade, endereco, complemento_endereco,
        subtotal, taxa_entrega, total,
        forma_pagamento, troco_para, levar_maquininha, status, pending_id,
        tipo_entrega, dispositivo_id
      ) VALUES (
        v_tenant,
        v_numero,
        COALESCE(NULLIF(btrim(p_payload -> 'cliente' ->> 'nome'), ''), 'Cliente'),
        v_telefone,
        CASE WHEN v_retirada THEN NULL ELSE NULLIF(btrim(COALESCE(p_payload -> 'entrega' ->> 'cep', '')), '') END,
        CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'bairro' END,
        CASE WHEN v_retirada THEN NULL ELSE NULLIF(btrim(COALESCE(p_payload -> 'entrega' ->> 'cidade', '')), '') END,
        v_endereco,
        CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'complemento' END,
        v_subtotal, v_taxa, v_subtotal + v_taxa,
        v_forma,
        NULLIF(p_payload -> 'pagamento' ->> 'troco_para', '')::numeric,
        COALESCE((p_payload -> 'pagamento' ->> 'levar_maquininha')::boolean, false),
        -- ACEITE AUTOMÁTICO: com a chave ligada o pedido já nasce
        -- aceito, sem passar por 'recebido'. Nasce assim em vez de ser
        -- movido logo depois porque isto é UMA transação: não existe
        -- janela em que o pedido esteja 'recebido' e ninguém o tenha
        -- aceitado, nem corrida entre dois painéis abertos.
        CASE WHEN COALESCE(v_cfg.aceite_automatico, false)
               THEN 'em_preparo' ELSE 'recebido' END,
        v_pending_id,
        CASE WHEN v_retirada THEN 'retirada' ELSE 'entrega' END,
        v_dispositivo
      ) RETURNING * INTO v_pedido;

      -- ── Cadastro do cliente ───────────────────────────────────────
      -- Nasce aqui, e não no navegador: a vitrine é anônima e a RLS de
      -- `clientes` não deixa (nem deve deixar) o anon escrever. Como esta
      -- função é SECURITY DEFINER, o tenant_id vai EXPLÍCITO — o DEFAULT
      -- tenant_atual_id() é NULL para quem não está logado.
      --
      -- Casa pelo TELEFONE, que é o que identifica a pessoa no delivery.
      -- Já existindo, o cadastro NÃO é sobrescrito: nome e endereço que o
      -- dono ajustou no PDV valem mais do que o que foi digitado às pressas
      -- num pedido. A data de nascimento só entra quando ainda está vazia —
      -- é o "pergunta uma vez" da tela, garantido também no servidor.
      IF v_telefone IS NOT NULL AND v_telefone <> '' THEN
        UPDATE public.clientes
           SET data_nascimento = v_nascimento,
               updated_at = now()
         WHERE tenant_id = v_tenant
           AND telefone = v_telefone
           AND data_nascimento IS NULL
           AND v_nascimento IS NOT NULL;

        IF NOT EXISTS (
          SELECT 1 FROM public.clientes
           WHERE tenant_id = v_tenant AND telefone = v_telefone
        ) THEN
          INSERT INTO public.clientes (tenant_id, nome, telefone, data_nascimento, endereco, criado_por)
          VALUES (
            v_tenant,
            COALESCE(NULLIF(btrim(p_payload -> 'cliente' ->> 'nome'), ''), 'Cliente'),
            v_telefone,
            v_nascimento,
            CASE WHEN v_retirada THEN NULL ELSE v_endereco END,
            'delivery'
          );
        END IF;
      END IF;

      EXIT;
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

  INSERT INTO public.pending (
    id, tenant_id, comanda, items, status, note, total, created_by, apelido
  ) VALUES (
    v_pending_id,
    v_tenant,
    CASE WHEN v_retirada THEN 'Retirada ' ELSE 'Delivery ' END || v_numero,
    v_pending_items,
    'open',
    concat_ws(' · ',
      CASE WHEN v_retirada THEN 'RETIRADA NO LOCAL' ELSE 'DELIVERY' END,
      CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'endereco' END,
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
    'total',  v_subtotal + v_taxa,
    'tipo',   CASE WHEN v_retirada THEN 'retirada' ELSE 'entrega' END,
    'endereco_retirada', CASE WHEN v_retirada THEN v_endereco ELSE NULL END
  );
END;
$$;

-- ── Confere o que acabou de ser criado ─────────────────────────────
DO $conf$
DECLARE
  v_tenant uuid;
  v_pizza  bigint;
  v_cala   bigint;
  v_port   bigint;
  v_grupo  uuid;
  v_icala  uuid;
  v_iport  uuid;
  v_lanche bigint;
  v_gcomp  uuid;
  v_bacon  uuid;
  v_res    jsonb;
  v_total  numeric;
  v_obs    text;
BEGIN
  -- A conta pura primeiro: repetir o preço é o que carrega a quantidade.
  IF public.qtd_da_opcao('{"a": 2}'::jsonb, 'a') <> 2 THEN
    RAISE EXCEPTION 'Quantidade: o mapa não foi lido.';
  END IF;
  IF public.qtd_da_opcao('{"a": 2}'::jsonb, 'b') <> 1 THEN
    RAISE EXCEPTION 'Quantidade: opção fora do mapa tinha de valer 1.';
  END IF;
  IF public.qtd_da_opcao(NULL, 'a') <> 1 THEN
    RAISE EXCEPTION 'Quantidade: sem mapa tinha de valer 1.';
  END IF;
  IF public.preco_grupo_escolha_delivery(ARRAY[40, 40, 60]::numeric[], 'maior') <> 60 THEN
    RAISE EXCEPTION 'Quantidade: repetir a fatia não podia mudar "a mais cara".';
  END IF;
  IF public.preco_grupo_escolha_delivery(ARRAY[4, 4]::numeric[], 'soma') <> 8 THEN
    RAISE EXCEPTION 'Quantidade: duas porções de 4 tinham de somar 8.';
  END IF;

  INSERT INTO public.tenants (nome, slug)
  VALUES ('Conferência 20261013', 'conf-20261013') RETURNING id INTO v_tenant;

  INSERT INTO public.config_delivery (tenant_id, aberto, permite_retirada, endereco_origem)
  VALUES (v_tenant, true, true, 'Rua da Loja, 1');

  -- ── Grupo de escolha do cadastro do produto (modelo do PDV) ──────
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Pizza Grande', 40, 'Pizzas', true) RETURNING id INTO v_pizza;
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Calabresa', 40, 'Pizzas', true) RETURNING id INTO v_cala;
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Portuguesa', 60, 'Pizzas', true) RETURNING id INTO v_port;
  INSERT INTO public.produto_delivery (tenant_id, produto_id, disponivel)
  VALUES (v_tenant, v_pizza, true);

  INSERT INTO public.grupos_escolha
    (tenant_id, produto_id, nome, minimo, maximo, origem, regra_preco)
  VALUES (v_tenant, v_pizza, 'Sabores', 3, 3, 'lista', 'maior')
  RETURNING id INTO v_grupo;
  INSERT INTO public.grupo_escolha_itens (tenant_id, grupo_id, produto_id, ordem)
  VALUES (v_tenant, v_grupo, v_cala, 0) RETURNING id INTO v_icala;
  INSERT INTO public.grupo_escolha_itens (tenant_id, grupo_id, produto_id, ordem)
  VALUES (v_tenant, v_grupo, v_port, 1) RETURNING id INTO v_iport;

  -- Duas fatias de calabresa e uma de portuguesa: o mínimo de 3 está
  -- cumprido com DUAS opções, e a pizza continua custando uma pizza.
  v_res := public.criar_pedido_delivery('conf-20261013', jsonb_build_object(
    'cliente',   jsonb_build_object('nome', 'Ana', 'telefone', '51986557795'),
    'entrega',   jsonb_build_object('tipo', 'retirada'),
    'pagamento', jsonb_build_object('forma', 'pix'),
    'itens',     jsonb_build_array(jsonb_build_object(
      'produto_id', v_pizza,
      'qtd', 1,
      'complementos', jsonb_build_array(
        jsonb_build_object('id', v_icala, 'qtd', 2),
        jsonb_build_object('id', v_iport, 'qtd', 1))))));

  SELECT total INTO v_total FROM public.delivery_pedidos
  WHERE tenant_id = v_tenant AND numero = v_res->>'numero';
  IF v_total <> 100 THEN
    RAISE EXCEPTION 'Quantidade: pizza de 40 com sabor de 60 tinha de dar 100, deu %.', v_total;
  END IF;

  -- E o nome sai com a quantidade, que é o que a cozinha lê.
  SELECT string_agg(i.complementos::text, ' ') INTO v_obs
  FROM public.delivery_pedido_itens i
  JOIN public.delivery_pedidos p ON p.id = i.pedido_id
  WHERE p.tenant_id = v_tenant AND p.numero = v_res->>'numero';
  IF v_obs IS NULL THEN
    RAISE EXCEPTION 'Quantidade: o item do pedido não foi gravado.';
  END IF;

  -- Menos que o mínimo em PORÇÕES é recusado, mesmo com duas opções.
  BEGIN
    PERFORM public.criar_pedido_delivery('conf-20261013', jsonb_build_object(
      'cliente',   jsonb_build_object('nome', 'Ana', 'telefone', '51986557795'),
      'entrega',   jsonb_build_object('tipo', 'retirada'),
      'pagamento', jsonb_build_object('forma', 'pix'),
      'itens',     jsonb_build_array(jsonb_build_object(
        'produto_id', v_pizza,
        'qtd', 1,
        'complementos', jsonb_build_array(v_icala::text, v_iport::text)))));
    RAISE EXCEPTION 'Quantidade: duas porções não podiam passar num mínimo de três.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Quantidade:%' THEN RAISE; END IF;
  END;

  -- Passar do máximo em porções também é recusado.
  BEGIN
    PERFORM public.criar_pedido_delivery('conf-20261013', jsonb_build_object(
      'cliente',   jsonb_build_object('nome', 'Ana', 'telefone', '51986557795'),
      'entrega',   jsonb_build_object('tipo', 'retirada'),
      'pagamento', jsonb_build_object('forma', 'pix'),
      'itens',     jsonb_build_array(jsonb_build_object(
        'produto_id', v_pizza,
        'qtd', 1,
        'complementos', jsonb_build_array(
          jsonb_build_object('id', v_icala, 'qtd', 4))))));
    RAISE EXCEPTION 'Quantidade: quatro porções não podiam passar num máximo de três.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Quantidade:%' THEN RAISE; END IF;
  END;

  -- ── Complemento do delivery (o outro modelo) ─────────────────────
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'X-Burguer', 25, 'Lanches', true) RETURNING id INTO v_lanche;
  INSERT INTO public.produto_delivery (tenant_id, produto_id, disponivel)
  VALUES (v_tenant, v_lanche, true);

  INSERT INTO public.grupos_complemento (tenant_id, nome, min_escolhas, max_escolhas)
  VALUES (v_tenant, 'Extras', 0, 3) RETURNING id INTO v_gcomp;
  INSERT INTO public.produto_grupos (tenant_id, produto_id, grupo_id)
  VALUES (v_tenant, v_lanche, v_gcomp);
  INSERT INTO public.complementos (tenant_id, grupo_id, nome, preco, disponivel)
  VALUES (v_tenant, v_gcomp, 'Bacon', 4, true) RETURNING id INTO v_bacon;

  v_res := public.criar_pedido_delivery('conf-20261013', jsonb_build_object(
    'cliente',   jsonb_build_object('nome', 'Ana', 'telefone', '51986557795'),
    'entrega',   jsonb_build_object('tipo', 'retirada'),
    'pagamento', jsonb_build_object('forma', 'pix'),
    'itens',     jsonb_build_array(jsonb_build_object(
      'produto_id', v_lanche,
      'qtd', 1,
      'complementos', jsonb_build_array(
        jsonb_build_object('id', v_bacon, 'qtd', 2))))));

  SELECT total INTO v_total FROM public.delivery_pedidos
  WHERE tenant_id = v_tenant AND numero = v_res->>'numero';
  IF v_total <> 33 THEN
    RAISE EXCEPTION 'Quantidade: lanche de 25 com dois bacons de 4 tinha de dar 33, deu %.', v_total;
  END IF;

  -- O espelho em `pending` é a comanda que a cozinha lê e que a via de
  -- produção imprime: é ali que o nome do complemento aparece.
  SELECT p.items::text INTO v_obs
  FROM public.pending p
  WHERE p.tenant_id = v_tenant AND p.comanda LIKE '%' || (v_res->>'numero');
  IF v_obs IS NULL OR v_obs NOT LIKE '%2x Bacon%' THEN
    RAISE EXCEPTION 'Quantidade: a cozinha tinha de ler "2x Bacon", leu %.', v_obs;
  END IF;

  -- O formato de sempre continua valendo: id solto é uma porção.
  v_res := public.criar_pedido_delivery('conf-20261013', jsonb_build_object(
    'cliente',   jsonb_build_object('nome', 'Ana', 'telefone', '51986557795'),
    'entrega',   jsonb_build_object('tipo', 'retirada'),
    'pagamento', jsonb_build_object('forma', 'pix'),
    'itens',     jsonb_build_array(jsonb_build_object(
      'produto_id', v_lanche,
      'qtd', 1,
      'complementos', jsonb_build_array(v_bacon::text)))));

  SELECT total INTO v_total FROM public.delivery_pedidos
  WHERE tenant_id = v_tenant AND numero = v_res->>'numero';
  IF v_total <> 29 THEN
    RAISE EXCEPTION 'Quantidade: o pedido no formato antigo tinha de dar 29, deu %.', v_total;
  END IF;

  RAISE NOTICE 'Quantidade por opção conferida: o grupo conta porções, "a mais cara" não multiplica, o nome sai com o número e a lista de ids de antes continua valendo.';

  DELETE FROM public.delivery_pedido_itens WHERE tenant_id = v_tenant;
  DELETE FROM public.delivery_pedidos WHERE tenant_id = v_tenant;
  DELETE FROM public.pending WHERE tenant_id = v_tenant;
  -- Apagar de `pending` deixa cópia em comandas_arquivadas (o gatilho da
  -- 20261009), e a cópia é justamente o que não some por acidente: a
  -- limpeza da conferência tem de tirá-la de propósito.
  DELETE FROM public.comandas_arquivadas WHERE tenant_id = v_tenant;
  DELETE FROM public.clientes WHERE tenant_id = v_tenant;
  DELETE FROM public.complementos WHERE tenant_id = v_tenant;
  DELETE FROM public.produto_grupos WHERE tenant_id = v_tenant;
  DELETE FROM public.grupos_complemento WHERE tenant_id = v_tenant;
  DELETE FROM public.grupo_escolha_itens WHERE tenant_id = v_tenant;
  DELETE FROM public.grupos_escolha WHERE tenant_id = v_tenant;
  DELETE FROM public.produto_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.config_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.products WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants WHERE id = v_tenant;
END $conf$;
