-- ──────────────────────────────────────────────────────────────────
-- Run 6, leva 1 — a taxa por DISTÂNCIA recusava 100% dos pedidos.
--
-- `criar_pedido_delivery` recalculava a taxa chamando
-- `calcular_taxa_entrega(slug, cep, bairro)` — sem coordenada nenhuma.
-- No modo por km essa função devolve, por projeto,
-- `{ ok:false, motivo:'sem_coordenada' }` quando lat/lng são NULL, e o
-- RAISE seguinte traduzia isso como "Endereço fora da área de entrega".
--
-- Resultado no restaurante que cobra por km: o cliente digita o
-- endereço, a TELA mostra a taxa certa (o navegador geocodifica e chama
-- a função com as coordenadas), ele escolhe o pagamento, aperta
-- "Confirmar pedido" — e o pedido é recusado. Sempre. Nenhuma venda por
-- distância nunca entrou.
--
-- Correção: repassar as coordenadas que o payload já carrega. Três
-- cuidados:
--   1. Só entram se vierem como NÚMERO no JSON — payload adulterado com
--      texto não pode derrubar a função num erro de cast.
--   2. O par exatamente (0,0) é tratado como AUSENTE. Versões do app em
--      cache (PWA) ainda mandam `lat:0, lng:0` no lugar de omitir, e 0,0
--      fica no meio do Atlântico: a distância viraria milhares de km e o
--      pedido seria recusado por um endereço inventado.
--   3. Quando a taxa falha por falta de coordenada (ou por origem do
--      estabelecimento não configurada), a mensagem passa a dizer isso —
--      não adianta mandar o cliente "escolher outro endereço" quando o
--      problema não é o endereço dele.
--
-- Confiança nas coordenadas: elas vêm do cliente, como já vinham na
-- chamada direta de `calcular_taxa_entrega` que pinta a taxa na tela.
-- Geocodificar no servidor exigiria provedor pago; fica como está.
--
-- Nada além do bloco da taxa mudou em relação a 20260822.
-- RLS: nenhuma tabela nova — nada a configurar no painel.
-- ──────────────────────────────────────────────────────────────────

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
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado.';
  END IF;

  SELECT * INTO v_cfg FROM public.config_delivery WHERE tenant_id = v_tenant;

  -- Fail-closed: fechado → não aceita pedido.
  IF NOT COALESCE(v_cfg.aberto, false) THEN
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
  FOR v_try IN 1..8 LOOP
    SELECT to_char(now(), 'YYMMDD') || '-' ||
           lpad((count(*) + 1)::text, 3, '0')
      INTO v_numero
    FROM public.delivery_pedidos
    WHERE tenant_id = v_tenant AND created_at::date = now()::date;

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
