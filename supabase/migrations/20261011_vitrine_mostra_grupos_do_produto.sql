-- ══════════════════════════════════════════════════════════════════
-- A vitrine passa a mostrar os grupos de escolha do PRODUTO.
--
-- ┌─ O buraco ────────────────────────────────────────────────────────┐
-- │ Existem DOIS modelos de "opções" no sistema, e eles nunca se       │
-- │ falaram:                                                           │
-- │                                                                    │
-- │   • `grupos_escolha` + `grupo_escolha_itens` — o que a aba         │
-- │     Produtos cadastra. É o modelo do PDV, e é onde mora a regra    │
-- │     de cobrança do grupo (somar / a mais cara / média).            │
-- │                                                                    │
-- │   • `grupos_complemento` + `complementos` + `produto_grupos` — o   │
-- │     que a aba Delivery cadastra, e o ÚNICO que `cardapio_publico`  │
-- │     lia.                                                           │
-- │                                                                    │
-- │ Resultado: o dono configurava os extras do produto em Produtos,    │
-- │ abria a vitrine, e o modal do produto saía vazio. Nenhum erro,     │
-- │ nenhum aviso — a tela simplesmente não mostrava nada, e não havia  │
-- │ como descobrir que era preciso recadastrar tudo numa segunda aba.  │
-- └────────────────────────────────────────────────────────────────────┘
--
-- O QUE MUDA
--
-- 1. `montar_grupo_escolha_delivery` — monta um `grupos_escolha` no MESMO
--    formato jsonb que a vitrine já consome, com um campo a mais: a
--    `regra` de cobrança. Resolve `origem='categoria'` pelos produtos
--    ativos da categoria, igual ao PDV.
--
-- 2. `cardapio_publico` — o array `grupos` do produto passa a trazer os
--    dois modelos: primeiro os grupos de complemento (que já apareciam),
--    depois os grupos de escolha do cadastro. Nada sai de lugar nenhum.
--
-- 3. `criar_pedido_delivery` — aceita as opções dos grupos de escolha e
--    cobra pela REGRA do grupo. Sem isto, uma pizzaria vendendo pela
--    vitrine somaria os 4 sabores: quatro pizzas de R$ 40 viram R$ 160
--    numa pizza que custa R$ 40.
--
-- NADA É DUPLICADO. Não há cópia de um modelo para o outro: a vitrine
-- passou a LER os dois. Quem cadastra em Produtos vê na vitrine, quem
-- cadastra em Delivery continua exatamente como estava.
--
-- COMPATIBILIDADE: produto sem `grupos_escolha` devolve o mesmo jsonb de
-- antes, byte por byte. Grupo de complemento não tem `regra` e o preço
-- dele continua sendo somado.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Um grupo de escolha no formato da vitrine ───────────────────
--
-- O preço de cada opção segue a MESMA regra do PDV (precoDaOpcao em
-- src/lib/gruposEscolha.js):
--   • preço próprio > 0            → é ele
--   • senão, e a regra é 'soma'    → 0 (extra que não cobra)
--   • senão                        → o preço do produto no cadastro
--
-- É esse último caso que faz "categoria inteira de Pizzas + cobrar a
-- mais cara" funcionar sem digitar preço nenhum.
CREATE OR REPLACE FUNCTION public.montar_grupo_escolha_delivery(
  p_grupo_id uuid,
  p_tenant   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo  public.grupos_escolha;
  v_regra  text;
  v_itens  jsonb;
BEGIN
  SELECT * INTO v_grupo
  FROM public.grupos_escolha
  WHERE id = p_grupo_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_regra := COALESCE(NULLIF(v_grupo.regra_preco, ''), 'soma');
  IF v_regra NOT IN ('soma', 'maior', 'media') THEN
    v_regra := 'soma';
  END IF;

  IF v_grupo.origem = 'categoria' THEN
    -- A categoria inteira, resolvida na hora: produto novo na categoria
    -- entra sozinho, que é a razão de esse modo existir.
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'id',    'cat:' || pr.id::text,
               'nome',  pr.name,
               'preco', CASE WHEN v_regra = 'soma' THEN 0
                             ELSE COALESCE(pr.price, 0) END
             ) ORDER BY pr.name
           ), '[]'::jsonb)
    INTO v_itens
    FROM public.products pr
    WHERE pr.tenant_id = p_tenant
      AND pr.active
      AND pr.category = v_grupo.categoria
      AND NOT public.categoria_interna(pr.category);
  ELSE
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'id',    gei.id,
               'nome',  pr.name,
               'preco', CASE
                          WHEN COALESCE(gei.preco_customizado, 0) > 0
                            THEN gei.preco_customizado
                          WHEN v_regra = 'soma' THEN 0
                          ELSE COALESCE(pr.price, 0)
                        END
             ) ORDER BY gei.ordem, pr.name
           ), '[]'::jsonb)
    INTO v_itens
    FROM public.grupo_escolha_itens gei
    JOIN public.products pr
      ON pr.id = gei.produto_id AND pr.tenant_id = p_tenant
    WHERE gei.grupo_id = v_grupo.id
      AND gei.tenant_id = p_tenant
      -- Opção desligada continua cadastrada; só não é oferecida. É o
      -- "acabou hoje" sem perder a configuração.
      AND COALESCE(gei.ativo, true)
      AND pr.active;
  END IF;

  -- Grupo sem nenhuma opção não vai para a vitrine: ele só ocuparia
  -- espaço, e se fosse obrigatório travaria o produto num pedido
  -- impossível de completar.
  IF v_itens IS NULL OR jsonb_array_length(v_itens) = 0 THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',    v_grupo.id,
    'nome',  v_grupo.nome,
    'min',   v_grupo.minimo,
    'max',   v_grupo.maximo,
    -- O campo novo. A vitrine usa para cobrar certo e para escrever
    -- "R$ 60" em vez de "+ R$ 60" num grupo de sabores.
    'regra', v_regra,
    'itens', v_itens,
    'subgrupos', '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.montar_grupo_escolha_delivery(uuid, uuid) IS
  'Um grupos_escolha no formato jsonb da vitrine, com a regra de cobrança.';

-- ── 2. cardapio_publico passa a ler os dois modelos ────────────────
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
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'aberto',            public.delivery_aberto_agora(
                           v_cfg.horario, v_cfg.aberto, v_cfg.fuso),
    'pedido_minimo',     COALESCE(v_cfg.pedido_minimo, 0),
    'tempo_preparo_min', COALESCE(v_cfg.tempo_preparo_min, 30),
    'permite_retirada',  COALESCE(v_cfg.permite_retirada, false)
                           AND NULLIF(btrim(COALESCE(v_cfg.endereco_origem, '')), '') IS NOT NULL,
    'endereco_retirada', NULLIF(btrim(COALESCE(v_cfg.endereco_origem, '')), ''),
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
          -- Os DOIS modelos, na mesma lista. Complementos primeiro (é a
          -- ordem que a vitrine sempre teve), grupos de escolha depois.
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
          || COALESCE((
            SELECT jsonb_agg(g_json ORDER BY g_ordem)
            FROM (
              SELECT public.montar_grupo_escolha_delivery(ge.id, v_tenant) AS g_json,
                     ge.ordem AS g_ordem
              FROM public.grupos_escolha ge
              WHERE ge.produto_id = p.id AND ge.tenant_id = v_tenant
            ) ge2
            WHERE g_json IS NOT NULL
          ), '[]'::jsonb)
        ) AS prod
        FROM public.products p
        JOIN public.produto_delivery pd
          ON pd.produto_id = p.id AND pd.tenant_id = v_tenant
        WHERE p.tenant_id = v_tenant
          AND p.active
          AND pd.disponivel
          AND NOT public.categoria_interna(p.category)
          AND COALESCE(p.price, 0) > 0
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
        AND NOT public.combo_indisponivel(cb.id, v_tenant)
        AND COALESCE(cb.preco_total, 0) > 0
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 3. O preço de um grupo de escolha, pela regra dele ─────────────
--
-- Mesma conta de precoDoGrupo (src/lib/combos.js), em SQL:
--   soma  — cada opção soma o próprio valor
--   maior — o grupo cobra só a mais cara entre as escolhidas
--   media — a média das escolhidas
--
-- A vitrine não manda quantidade por opção (é marcar/desmarcar), então
-- 'media' aqui é a média simples — que é o mesmo que a ponderada com
-- todas as frações valendo 1.
CREATE OR REPLACE FUNCTION public.preco_grupo_escolha_delivery(
  p_precos numeric[],
  p_regra  text
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_precos IS NULL OR array_length(p_precos, 1) IS NULL THEN 0
    WHEN p_regra = 'maior' THEN (SELECT max(v) FROM unnest(p_precos) v)
    WHEN p_regra = 'media' THEN (SELECT avg(v) FROM unnest(p_precos) v)
    ELSE (SELECT sum(v) FROM unnest(p_precos) v)
  END;
$$;

COMMENT ON FUNCTION public.preco_grupo_escolha_delivery(numeric[], text) IS
  'Quanto um grupo de escolha cobra: somar, a mais cara, ou a média.';

-- ── 4. criar_pedido_delivery aceita e cobra os grupos de escolha ───
--
-- A função vem LITERALMENTE da 20261006, com três trechos acrescentados:
-- a separação dos ids por modelo, a validação das opções de escolha, e a
-- cobrança pela regra de cada grupo. Todo o resto — numeração do pedido,
-- taxa, espelho em `pending`, cadastro do cliente — é o mesmo texto.

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

      -- As opções chegam todas no mesmo array `complementos`. Aqui elas
      -- se separam por ONDE o id existe: complemento do delivery, item de
      -- grupo de escolha, ou 'cat:<produto_id>' de um grupo por categoria.
      IF jsonb_typeof(v_item -> 'complementos') = 'array' THEN
        SELECT array_agg(DISTINCT substring(e from 5)::bigint) INTO v_cat_ids
        FROM jsonb_array_elements_text(v_item -> 'complementos') e
        WHERE e LIKE 'cat:%' AND substring(e from 5) ~ '^[0-9]+$';

        SELECT array_agg(DISTINCT (e)::uuid) INTO v_comp_ids
        FROM jsonb_array_elements_text(v_item -> 'complementos') e
        WHERE e NOT LIKE 'cat:%';
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

        SELECT COALESCE(sum(c.preco), 0), string_agg(c.nome, ', ' ORDER BY c.nome)
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
          SELECT array_agg(CASE WHEN v_ge.regra = 'soma' THEN 0
                                ELSE COALESCE(pr.price, 0) END),
                 count(*),
                 string_agg(pr.name, ', ' ORDER BY pr.name)
          INTO v_ge_precos, v_ge_qtd, v_esc_nomes
          FROM public.products pr
          WHERE pr.tenant_id = v_tenant
            AND pr.active
            AND pr.category = v_ge.categoria
            AND pr.id = ANY(COALESCE(v_cat_ids, ARRAY[]::bigint[]));
        ELSE
          -- Mesma regra de preço do PDV (precoDaOpcao): preço próprio
          -- manda; sem ele, 'soma' não cobra e as outras usam o preço do
          -- produto no cadastro.
          SELECT array_agg(CASE
                             WHEN COALESCE(gei.preco_customizado, 0) > 0
                               THEN gei.preco_customizado
                             WHEN v_ge.regra = 'soma' THEN 0
                             ELSE COALESCE(pr.price, 0)
                           END),
                 count(*),
                 string_agg(pr.name, ', ' ORDER BY pr.name)
          INTO v_ge_precos, v_ge_qtd, v_esc_nomes
          FROM public.grupo_escolha_itens gei
          JOIN public.products pr
            ON pr.id = gei.produto_id AND pr.tenant_id = v_tenant
          WHERE gei.grupo_id = v_ge.id
            AND gei.tenant_id = v_tenant
            AND gei.id = ANY(COALESCE(v_esc_ids, ARRAY[]::uuid[]));
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
        'recebido',
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

-- ── 5. Confere o que acabou de ser criado ──────────────────────────
DO $conf$
DECLARE
  v_tenant  uuid;
  v_pizza   bigint;
  v_cala    bigint;
  v_port    bigint;
  v_grupo   uuid;
  v_i1      uuid;
  v_i2      uuid;
  v_json    jsonb;
  v_grupos  jsonb;
BEGIN
  INSERT INTO public.tenants (nome, slug)
  VALUES ('Conferência 20261011', 'conf-20261011')
  RETURNING id INTO v_tenant;

  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Pizza Grande', 40, 'Pizzas', true) RETURNING id INTO v_pizza;
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Calabresa', 40, 'Pizzas', true) RETURNING id INTO v_cala;
  INSERT INTO public.products (tenant_id, name, price, category, active)
  VALUES (v_tenant, 'Portuguesa', 60, 'Pizzas', true) RETURNING id INTO v_port;

  -- Grupo de sabores: escolha 2, cobra a mais cara.
  INSERT INTO public.grupos_escolha
    (tenant_id, produto_id, nome, minimo, maximo, origem, regra_preco)
  VALUES (v_tenant, v_pizza, 'Sabores', 2, 2, 'lista', 'maior')
  RETURNING id INTO v_grupo;

  INSERT INTO public.grupo_escolha_itens (tenant_id, grupo_id, produto_id, ordem)
  VALUES (v_tenant, v_grupo, v_cala, 0) RETURNING id INTO v_i1;
  INSERT INTO public.grupo_escolha_itens (tenant_id, grupo_id, produto_id, ordem)
  VALUES (v_tenant, v_grupo, v_port, 1) RETURNING id INTO v_i2;

  -- O grupo sai no formato da vitrine, com a regra e com os PREÇOS dos
  -- sabores (não zero — a regra não é 'soma').
  v_json := public.montar_grupo_escolha_delivery(v_grupo, v_tenant);
  IF v_json IS NULL THEN
    RAISE EXCEPTION 'Vitrine: o grupo de escolha não foi montado.';
  END IF;
  IF v_json->>'regra' <> 'maior' THEN
    RAISE EXCEPTION 'Vitrine: a regra do grupo não viajou (veio %).', v_json->>'regra';
  END IF;
  IF jsonb_array_length(v_json->'itens') <> 2 THEN
    RAISE EXCEPTION 'Vitrine: esperava 2 sabores, vieram %.',
      jsonb_array_length(v_json->'itens');
  END IF;
  IF (v_json->'itens'->1->>'preco')::numeric <> 60 THEN
    RAISE EXCEPTION 'Vitrine: em "maior" o sabor sai pelo preço do cadastro, veio %.',
      v_json->'itens'->1->>'preco';
  END IF;

  -- A conta do grupo: duas pizzas de 40 e 60 pela regra "maior" é 60.
  IF public.preco_grupo_escolha_delivery(ARRAY[40, 60]::numeric[], 'maior') <> 60 THEN
    RAISE EXCEPTION 'Vitrine: "a mais cara" não cobrou a mais cara.';
  END IF;
  IF public.preco_grupo_escolha_delivery(ARRAY[40, 60]::numeric[], 'media') <> 50 THEN
    RAISE EXCEPTION 'Vitrine: "média" não tirou a média.';
  END IF;
  IF public.preco_grupo_escolha_delivery(ARRAY[4, 3]::numeric[], 'soma') <> 7 THEN
    RAISE EXCEPTION 'Vitrine: "somar" não somou.';
  END IF;
  IF public.preco_grupo_escolha_delivery(NULL, 'soma') <> 0 THEN
    RAISE EXCEPTION 'Vitrine: grupo sem escolha tinha de custar 0.';
  END IF;

  -- Grupo sem opção nenhuma não vai para a vitrine: se fosse obrigatório,
  -- travaria o produto num pedido impossível de completar.
  UPDATE public.grupo_escolha_itens SET ativo = false WHERE grupo_id = v_grupo;
  IF public.montar_grupo_escolha_delivery(v_grupo, v_tenant) IS NOT NULL THEN
    RAISE EXCEPTION 'Vitrine: grupo sem opção disponível não podia ir para a tela.';
  END IF;
  UPDATE public.grupo_escolha_itens SET ativo = true WHERE grupo_id = v_grupo;

  -- E o cardápio público entrega o grupo junto do produto. Precisa de
  -- config_delivery e produto_delivery para o produto ser publicável.
  INSERT INTO public.config_delivery (tenant_id, aberto, permite_retirada)
  VALUES (v_tenant, true, false);
  INSERT INTO public.produto_delivery (tenant_id, produto_id, disponivel)
  VALUES (v_tenant, v_pizza, true);

  SELECT prod->'grupos' INTO v_grupos
  FROM jsonb_array_elements(
         public.cardapio_publico('conf-20261011') -> 'produtos'
       ) prod
  WHERE (prod->>'produto_id')::bigint = v_pizza;

  IF v_grupos IS NULL OR jsonb_array_length(v_grupos) <> 1 THEN
    RAISE EXCEPTION 'Vitrine: o cardápio não trouxe o grupo do produto (veio %).', v_grupos;
  END IF;
  IF v_grupos->0->>'nome' <> 'Sabores' THEN
    RAISE EXCEPTION 'Vitrine: veio o grupo errado (%).', v_grupos->0->>'nome';
  END IF;

  RAISE NOTICE 'Vitrine conferida: o grupo de escolha do produto chega ao cardápio com a regra, e as três contas batem.';

  DELETE FROM public.produto_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.config_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.grupo_escolha_itens WHERE tenant_id = v_tenant;
  DELETE FROM public.grupos_escolha WHERE tenant_id = v_tenant;
  DELETE FROM public.products WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants WHERE id = v_tenant;
END $conf$;
