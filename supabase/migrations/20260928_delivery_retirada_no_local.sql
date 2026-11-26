-- ══════════════════════════════════════════════════════════════════
-- Retirada no local na vitrine pública + "ainda não tem área de
-- entrega" deixa de se passar por "seu endereço é fora da área".
--
-- ┌─ O buraco 1: só existia entrega ────────────────────────────────┐
-- │ A vitrine tinha um caminho só: CEP → taxa → pagamento. Quem quer │
-- │ buscar no balcão precisava inventar um endereço para conseguir   │
-- │ passar da tela de entrega, e ainda pagava taxa por uma entrega   │
-- │ que ninguém ia fazer. Na prática, retirada não existia — nem no  │
-- │ cardápio, nem no pedido, nem no painel de quem recebe.           │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ O buraco 2: o CEP "não funcionava" ────────────────────────────┐
-- │ `calcular_taxa_entrega` devolve motivo 'fora_area' quando não    │
-- │ acha faixa que cubra o endereço. Só que ela devolve EXATAMENTE   │
-- │ o mesmo quando o estabelecimento não cadastrou faixa nenhuma —   │
-- │ e aí TODO CEP do Brasil é "fora da área". Quem abre a loja pela  │
-- │ primeira vez digita o CEP, lê "esse endereço está fora da nossa  │
-- │ área de entrega", confere o CEP (que está certo), digita outro,  │
-- │ lê a mesma frase, e conclui que o campo de CEP está quebrado.    │
-- │ Não está: falta configurar as faixas — coisa que a mensagem      │
-- │ jamais diz, porque o servidor não distingue os dois casos.       │
-- │                                                                   │
-- │ Motivo novo: 'sem_area'. A tela passa a dizer a verdade e, com   │
-- │ a retirada ligada, oferece o caminho que funciona.               │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Endereço da retirada: é o `endereco_origem` que já existe em
-- config_delivery (o mesmo da taxa por km). Um campo novo seria mais
-- uma coisa para o dono preencher antes de a retirada funcionar, e o
-- endereço da loja é o mesmo nos dois casos.
--
-- Fail-closed nas duas pontas, como o resto do delivery: a vitrine só
-- oferece retirada quando `permite_retirada` está ligado, e
-- `criar_pedido_delivery` recusa pedido de retirada de quem não
-- habilitou — quem monta o payload na mão não fura a regra.
--
-- RLS: nenhuma tabela nova, nenhuma policy nova. As duas colunas
-- entram em tabelas que já têm RLS e políticas por tenant.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Colunas ─────────────────────────────────────────────────────
ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS permite_retirada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.permite_retirada IS
  'O estabelecimento aceita que o cliente busque no balcão? Ligado no painel de Delivery. Desligado, a vitrine nem oferece a opção.';

ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega';

DO $constraint$
BEGIN
  -- Só os dois valores que o produto conhece. Sem a trava, um payload
  -- adulterado gravaria 'grátis' no lugar de 'entrega' e o painel
  -- mostraria um pedido de tipo desconhecido para quem vai despachar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_pedidos_tipo_entrega_check'
  ) THEN
    ALTER TABLE public.delivery_pedidos
      ADD CONSTRAINT delivery_pedidos_tipo_entrega_check
      CHECK (tipo_entrega IN ('entrega', 'retirada'));
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.delivery_pedidos.tipo_entrega IS
  'entrega (leva no endereço do cliente) ou retirada (cliente busca no balcão). Pedido antigo é entrega — era o único caminho que existia.';

-- ── 2. calcular_taxa_entrega: "sem área cadastrada" ≠ "fora da área" ──
-- Cópia literal de 20260810, com um bloco a mais logo depois de ler as
-- faixas. Nada mais do corpo mudou.
CREATE OR REPLACE FUNCTION public.calcular_taxa_entrega(
  p_slug   text,
  p_cep    text,
  p_bairro text DEFAULT NULL,
  p_lat    numeric DEFAULT NULL,
  p_lng    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tenant   uuid := public.delivery_tenant_por_slug(p_slug);
  v_cep      text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_bairro   text := lower(btrim(coalesce(p_bairro, '')));
  v_cfg      public.config_delivery;
  v_faixas   jsonb;
  v_faixa    jsonb;
  v_taxa     numeric;
  v_tem_km   boolean := false;
  v_dist     numeric;
  v_melhor_km numeric;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tenant_invalido');
  END IF;

  SELECT * INTO v_cfg FROM public.config_delivery WHERE tenant_id = v_tenant;
  v_faixas := v_cfg.faixas_taxa;

  -- A distinção que faltava. Sem NENHUMA faixa cadastrada não existe
  -- endereço atendido: a resposta é sobre o CADASTRO da loja, não sobre
  -- o endereço do cliente, e mandá-lo "conferir o CEP" é mandá-lo
  -- corrigir o que já está certo.
  IF v_faixas IS NULL
     OR jsonb_typeof(v_faixas) <> 'array'
     OR jsonb_array_length(v_faixas) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_area');
  END IF;

  -- Este estabelecimento cobra por distância?
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_faixas) f
    WHERE f->>'tipo' = 'km'
  ) INTO v_tem_km;

  -- ── Modo por distância (km) ────────────────────────────────────────
  IF v_tem_km THEN
    -- Precisa da origem cadastrada e da coordenada do cliente.
    IF v_cfg.origem_lat IS NULL OR v_cfg.origem_lng IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'origem_indefinida');
    END IF;
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_coordenada');
    END IF;

    v_dist := public.delivery_distancia_km(
      v_cfg.origem_lat, v_cfg.origem_lng, p_lat, p_lng
    );
    IF v_dist IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_coordenada');
    END IF;

    -- Menor anel (km_ate) que cobre a distância.
    SELECT (f->>'taxa')::numeric, (f->>'km_ate')::numeric
      INTO v_taxa, v_melhor_km
    FROM jsonb_array_elements(v_faixas) f
    WHERE f->>'tipo' = 'km'
      AND (f->>'km_ate')::numeric >= v_dist
    ORDER BY (f->>'km_ate')::numeric ASC
    LIMIT 1;

    IF v_taxa IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false, 'motivo', 'fora_area',
        'km', round(v_dist, 2)
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true, 'taxa', v_taxa,
      'km', round(v_dist, 2), 'km_ate', v_melhor_km
    );
  END IF;

  -- ── Modo por CEP / bairro (comportamento original) ─────────────────
  FOR v_faixa IN SELECT * FROM jsonb_array_elements(v_faixas)
  LOOP
    IF v_faixa->>'tipo' = 'cep'
       AND length(v_cep) = 8
       AND v_cep >= regexp_replace(coalesce(v_faixa->>'cep_ini',''), '\D', '', 'g')
       AND v_cep <= regexp_replace(coalesce(v_faixa->>'cep_fim',''), '\D', '', 'g') THEN
      v_taxa := (v_faixa->>'taxa')::numeric;
      EXIT;
    ELSIF v_faixa->>'tipo' = 'bairro'
       AND v_bairro <> ''
       AND lower(btrim(v_faixa->>'bairro')) = v_bairro THEN
      v_taxa := (v_faixa->>'taxa')::numeric;
      EXIT;
    END IF;
  END LOOP;

  IF v_taxa IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fora_area');
  END IF;

  RETURN jsonb_build_object('ok', true, 'taxa', v_taxa);
END;
$$;

-- ── 3. cardapio_publico: a vitrine precisa saber que há retirada ───
-- Cópia literal de 20260918, com duas chaves a mais no objeto.
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
    -- Retirada: só é oferecida quando ligada E com endereço para ir
    -- buscar. Ligada sem endereço, a tela mandaria o cliente "retirar no
    -- local" sem dizer onde é o local.
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
          -- DL34: matéria-prima e etapa interna não são cardápio, e item
          -- sem preço não se vende.
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

-- ── 4. criar_pedido_delivery: aceita retirada ──────────────────────
-- Cópia literal de 20260918, com o ramo de retirada nas guardas de
-- endereço/taxa e as duas colunas novas na gravação.
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
  v_retirada   boolean;
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

  -- Fail-closed: fechado → não aceita pedido.
  IF NOT COALESCE(public.delivery_aberto_agora(v_cfg.horario, v_cfg.aberto, v_fuso), false) THEN
    RAISE EXCEPTION 'Estabelecimento fechado para pedidos no momento.';
  END IF;

  -- Forma de pagamento válida (pagamento é na entrega/retirada).
  v_forma := p_payload -> 'pagamento' ->> 'forma';
  IF NOT COALESCE(v_forma IN ('dinheiro', 'pix', 'cartao'), false) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  -- ── Entrega ou retirada? ─────────────────────────────────────────
  v_retirada := COALESCE(p_payload -> 'entrega' ->> 'tipo', 'entrega') = 'retirada';

  IF v_retirada THEN
    -- Fail-closed: quem não habilitou retirada não recebe pedido de
    -- retirada, mesmo com o payload montado na mão.
    IF NOT COALESCE(v_cfg.permite_retirada, false) THEN
      RAISE EXCEPTION 'Este estabelecimento não aceita retirada no local.';
    END IF;
    -- O "endereço" do pedido de retirada é o balcão. A coluna é NOT NULL
    -- e é o que o painel mostra para quem despacha — deixar em branco
    -- faria o pedido aparecer sem lugar nenhum.
    v_endereco := COALESCE(
      NULLIF(btrim(COALESCE(v_cfg.endereco_origem, '')), ''),
      'Retirada no local'
    );
    v_taxa := 0;
  ELSE
    -- Endereço de entrega é obrigatório (guarda antes de qualquer INSERT).
    v_endereco := NULLIF(btrim(p_payload -> 'entrega' ->> 'endereco'), '');
    IF v_endereco IS NULL THEN
      RAISE EXCEPTION 'Endereço de entrega é obrigatório.';
    END IF;
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
    v_comp_ids := NULL;

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

      IF jsonb_typeof(v_item -> 'complementos') = 'array' THEN
        SELECT array_agg(DISTINCT (e)::uuid) INTO v_comp_ids
        FROM jsonb_array_elements_text(v_item -> 'complementos') e;
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
        IF v_grp.max_escolhas IS NOT NULL AND v_grp_qtd > v_grp.max_escolhas THEN
          RAISE EXCEPTION 'No máximo % opção(ões) em "%".',
            v_grp.max_escolhas, v_grp.nome;
        END IF;
      END LOOP;
    END IF;

    v_preco_unit := v_preco_base + COALESCE(v_comp_soma, 0);
    v_subtotal := v_subtotal + v_preco_unit * v_qtd;

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
  -- Na retirada não há taxa a calcular: ninguém sai para entregar. Passar
  -- pelo cálculo cobraria do cliente uma corrida que não existe — e, pior,
  -- recusaria o pedido de quem mora fora da área mas está indo buscar.
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
      -- Recado honesto: sem faixa nenhuma cadastrada o problema é do
      -- cadastro da loja, e mandar o cliente conferir o CEP dele é mandar
      -- corrigir o que já está certo.
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
        cep, bairro, endereco, complemento_endereco,
        subtotal, taxa_entrega, total,
        forma_pagamento, troco_para, levar_maquininha, status, pending_id,
        tipo_entrega
      ) VALUES (
        v_tenant,
        v_numero,
        COALESCE(NULLIF(btrim(p_payload -> 'cliente' ->> 'nome'), ''), 'Cliente'),
        p_payload -> 'cliente' ->> 'telefone',
        -- Na retirada o CEP/bairro/complemento do cliente não são dados do
        -- pedido: ninguém vai até lá. Guardá-los seria guardar endereço de
        -- cliente sem necessidade nenhuma.
        CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'cep' END,
        CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'bairro' END,
        v_endereco,
        CASE WHEN v_retirada THEN NULL ELSE p_payload -> 'entrega' ->> 'complemento' END,
        v_subtotal, v_taxa, v_subtotal + v_taxa,
        v_forma,
        NULLIF(p_payload -> 'pagamento' ->> 'troco_para', '')::numeric,
        COALESCE((p_payload -> 'pagamento' ->> 'levar_maquininha')::boolean, false),
        'recebido',
        v_pending_id,
        CASE WHEN v_retirada THEN 'retirada' ELSE 'entrega' END
      ) RETURNING * INTO v_pedido;
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

  -- ── Espelha em `pending` (Realtime → Cozinha / mini-painel) ──────
  -- A primeira palavra da nota é o que a cozinha lê com pressa: "RETIRADA"
  -- em vez de "DELIVERY" evita o pedido sair na mochila de um entregador
  -- quando o cliente está vindo buscar.
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

-- ══════════════════════════════════════════════════════════════════
-- 5. Conferência ao vivo — só o banco sabe se a migração pegou.
--    Aborta a transação se faltar ponta. Não escreve dado nenhum.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
  n     integer;
BEGIN
  -- ── As colunas existem, com o default certo ──────────────────────
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'config_delivery'
     AND column_name = 'permite_retirada';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Retirada: config_delivery.permite_retirada não foi criada.';
  END IF;

  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'delivery_pedidos'
     AND column_name = 'tipo_entrega' AND column_default LIKE '%entrega%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Retirada: delivery_pedidos.tipo_entrega não foi criada com o padrão "entrega" — pedido antigo ficaria sem tipo.';
  END IF;

  -- Pedido que já existia continua sendo entrega: era o único caminho.
  SELECT count(*) INTO n
    FROM public.delivery_pedidos
   WHERE tipo_entrega NOT IN ('entrega', 'retirada');
  IF n > 0 THEN
    RAISE EXCEPTION 'Retirada: % pedido(s) com tipo_entrega fora dos dois valores conhecidos.', n;
  END IF;

  -- ── A trava de valor está no ar ──────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_pedidos_tipo_entrega_check'
  ) THEN
    RAISE EXCEPTION 'Retirada: falta o CHECK de tipo_entrega — payload adulterado gravaria qualquer texto.';
  END IF;

  -- ── O motivo novo é o ponto da correção do "CEP quebrado" ────────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'calcular_taxa_entrega';
  IF v_def IS NULL OR position('sem_area' in v_def) = 0 THEN
    RAISE EXCEPTION 'Retirada: calcular_taxa_entrega sem o motivo sem_area — loja sem faixa seguiria dizendo que o CEP do cliente é fora da área.';
  END IF;

  -- ── A vitrine sabe da retirada ───────────────────────────────────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'cardapio_publico';
  IF v_def IS NULL OR position('permite_retirada' in v_def) = 0 THEN
    RAISE EXCEPTION 'Retirada: cardapio_publico não publica permite_retirada — a vitrine nunca ofereceria a opção.';
  END IF;

  -- ── E o envio do pedido respeita o interruptor ───────────────────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'criar_pedido_delivery';
  IF v_def IS NULL OR position('não aceita retirada no local' in v_def) = 0 THEN
    RAISE EXCEPTION 'Retirada: criar_pedido_delivery sem a guarda de permite_retirada — payload na mão furaria o interruptor.';
  END IF;

  RAISE NOTICE 'Retirada no local: colunas, trava, taxa e as duas RPCs no ar.';
END;
$conf$;
