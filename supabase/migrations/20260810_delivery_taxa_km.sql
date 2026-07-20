-- ══════════════════════════════════════════════════════════════════
-- 20260810_delivery_taxa_km — Taxa de entrega POR DISTÂNCIA (km)
-- ══════════════════════════════════════════════════════════════════
-- Adiciona o modo "por distância" à taxa de entrega, ao lado do modo já
-- existente (por bairro / por CEP). O estabelecimento marca um ponto de
-- origem (origem_lat/origem_lng) e cadastra anéis concêntricos com preços
-- diferentes (faixa jsonb { tipo:'km', km_ate, taxa }). O cliente digita o
-- endereço; o NAVEGADOR geocodifica (Nominatim/OSM, grátis) e manda só a
-- coordenada. O SERVIDOR calcula a distância em linha reta (haversine) e
-- escolhe o menor anel que cobre — preço NUNCA vem do cliente.
--
-- Compatibilidade: quando não há anéis por km, o cálculo cai no fluxo
-- CEP/bairro de sempre. A assinatura antiga calcular_taxa_entrega(text,
-- text, text) é substituída por uma com dois parâmetros extras opcionais
-- (p_lat/p_lng DEFAULT NULL), então chamadas de 3 argumentos continuam
-- resolvendo.
--
-- ⚠️  RODAR MANUALMENTE no painel do Supabase (SQL editor). Não requer
--     mudança de RLS: as tabelas seguem fechadas ao anon; o acesso é só
--     pelas 3 RPCs SECURITY DEFINER (re-GRANT no fim deste arquivo).
--
-- ⚠️  Segurança conhecida (aceita): o servidor confia na coordenada
--     enviada pelo cliente (um cliente malicioso poderia forjar a posição
--     para pagar menos). Mitigado porque o endereço aparece no pedido — o
--     dono confere/ajusta/cancela. O preço por anel continua no servidor.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Colunas de origem (estabelecimento) e da coordenada do pedido ──
ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS origem_lat numeric,
  ADD COLUMN IF NOT EXISTS origem_lng numeric;

ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS entrega_lat numeric,
  ADD COLUMN IF NOT EXISTS entrega_lng numeric;

-- ── 2. Helper: distância haversine em km (linha reta, grátis) ─────────
-- Retorna NULL quando qualquer coordenada falta. Imutável (só matemática).
CREATE OR REPLACE FUNCTION public.delivery_distancia_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  END;
$$;

-- ── 3. calcular_taxa_entrega — agora com modo km ─────────────────────
-- A assinatura antiga (text,text,text) é trocada por uma com p_lat/p_lng
-- opcionais. DROP é seguro: corpos plpgsql não criam dependência dura.
DROP FUNCTION IF EXISTS public.calcular_taxa_entrega(text, text, text);

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
  IF v_faixas IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fora_area');
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

  RETURN jsonb_build_object('ok', true, 'taxa', v_taxa, 'bairro', p_bairro);
END;
$$;

-- ── 4. criar_pedido_delivery — passa/grava a coordenada do cliente ───
-- Idêntica à versão anterior, exceto: lê entrega.lat/lng do payload, passa
-- pra calcular_taxa_entrega (modo km) e grava em entrega_lat/entrega_lng.
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
  v_subtotal   numeric := 0;
  v_taxa_res   jsonb;
  v_taxa       numeric;
  v_forma      text;
  v_endereco   text;
  v_lat        numeric;
  v_lng        numeric;
  v_pending_items jsonb := '[]'::jsonb;
  v_pedido     public.delivery_pedidos;
  v_numero     text;
  v_pending_id text;
  v_obs_txt    text;
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

  -- Coordenada do cliente (só existe no modo por km; senão NULL).
  v_lat := NULLIF(p_payload -> 'entrega' ->> 'lat', '')::numeric;
  v_lng := NULLIF(p_payload -> 'entrega' ->> 'lng', '')::numeric;

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

      -- Complementos: recalcula preço a partir da tabela (só os
      -- disponíveis, do tenant, que pertençam a grupos DESTE produto).
      IF jsonb_typeof(v_item -> 'complementos') = 'array' THEN
        SELECT array_agg((e)::uuid) INTO v_comp_ids
        FROM jsonb_array_elements_text(v_item -> 'complementos') e;

        IF v_comp_ids IS NOT NULL THEN
          SELECT COALESCE(sum(c.preco), 0), string_agg(c.nome, ', ')
          INTO v_comp_soma, v_comp_nomes
          FROM public.complementos c
          JOIN public.grupos_complemento g ON g.id = c.grupo_id
          WHERE c.id = ANY(v_comp_ids)
            AND c.tenant_id = v_tenant
            AND c.disponivel
            AND g.produto_id = v_prod.id;
        END IF;
      END IF;
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

  -- ── Taxa recalculada no servidor (passa a coordenada p/ modo km) ──
  v_taxa_res := public.calcular_taxa_entrega(
    p_slug,
    p_payload -> 'entrega' ->> 'cep',
    p_payload -> 'entrega' ->> 'bairro',
    v_lat,
    v_lng
  );
  IF NOT COALESCE((v_taxa_res->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Endereço fora da área de entrega.';
  END IF;
  v_taxa := (v_taxa_res->>'taxa')::numeric;

  -- ── Número do pedido (humano, por tenant/dia) ────────────────────
  SELECT to_char(now(), 'YYMMDD') || '-' ||
         lpad((count(*) + 1)::text, 3, '0')
    INTO v_numero
  FROM public.delivery_pedidos
  WHERE tenant_id = v_tenant AND created_at::date = now()::date;

  v_pending_id := 'dlv_' || replace(gen_random_uuid()::text, '-', '');

  -- ── Grava o pedido ───────────────────────────────────────────────
  INSERT INTO public.delivery_pedidos (
    tenant_id, numero, cliente_nome, cliente_telefone,
    cep, bairro, endereco, complemento_endereco,
    entrega_lat, entrega_lng,
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
    v_lat, v_lng,
    v_subtotal, v_taxa, v_subtotal + v_taxa,
    v_forma,
    NULLIF(p_payload -> 'pagamento' ->> 'troco_para', '')::numeric,
    COALESCE((p_payload -> 'pagamento' ->> 'levar_maquininha')::boolean, false),
    'recebido',
    v_pending_id
  ) RETURNING * INTO v_pedido;

  -- Itens do pedido (histórico próprio). v_pending_items foi montado no
  -- loop de recálculo NA MESMA ORDEM de p_payload->'itens'; casamos os
  -- dois arrays por ORDINALITY (posição 1:1) e usamos o preço/nome já
  -- recalculado (pi) + os campos originais do payload (orig).
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

-- ── 5. GRANTS (re-aplica; a nova assinatura precisa de GRANT próprio) ─
REVOKE EXECUTE ON FUNCTION public.calcular_taxa_entrega(text, text, text, numeric, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_taxa_entrega(text, text, text, numeric, numeric) TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.criar_pedido_delivery(text, jsonb)                        TO anon, authenticated;
