-- ══════════════════════════════════════════════════════════════════
-- Pedir sem saber o CEP, e acompanhar o pedido sem criar conta.
--
-- ┌─ 1. O CEP era obrigatório e não devia ser ──────────────────────┐
-- │ A vitrine só liberava o avanço com 8 dígitos de CEP, e a taxa   │
-- │ só era calculada depois deles. Só que a faixa por BAIRRO — que  │
-- │ é a que a maioria dos estabelecimentos cadastra — nunca precisou│
-- │ de CEP nenhum: `calcular_taxa_entrega` já casava pelo nome do   │
-- │ bairro. Quem não sabia o próprio CEP (e é muita gente) não      │
-- │ conseguia pedir, mesmo com o bairro atendido.                    │
-- │                                                                   │
-- │ Agora o CEP é opcional dos dois lados. A cidade passa a ser dado │
-- │ do pedido: sem ela, "Centro" na comanda não diz de qual cidade. │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ 2. Acompanhar o pedido sem conta ──────────────────────────────┐
-- │ Depois de "Pedido enviado!" o cliente não tinha mais nada: nem  │
-- │ status, nem histórico, nem o número do pedido se fechasse a aba.│
-- │ Criar conta para isso é barreira — e conta por SMS custa por    │
-- │ mensagem, o que não cabe na fase de bootstrap.                   │
-- │                                                                   │
-- │ Solução sem custo: o navegador guarda uma identidade anônima    │
-- │ (`dispositivo_id`, um UUID que nunca sai do aparelho a não ser  │
-- │ junto do pedido). O pedido carimba essa identidade e a RPC      │
-- │ `meus_pedidos_delivery` devolve os pedidos DAQUELE aparelho.    │
-- │ Sem cadastro, sem senha, sem custo.                              │
-- │                                                                   │
-- │ O que isso é, para não haver ilusão: um portador de segredo.    │
-- │ Quem tiver o UUID vê aqueles pedidos. Por isso ele é gerado com │
-- │ `crypto.randomUUID` (122 bits de aleatoriedade — não se adivinha│
-- │ e não se enumera), a RPC exige o formato de UUID, devolve no    │
-- │ máximo os 20 últimos pedidos e NÃO devolve telefone nem         │
-- │ complemento do endereço. É o que basta para acompanhar o pedido,│
-- │ e nada além disso. Quando existir conta de verdade, os pedidos  │
-- │ do aparelho podem ser reivindicados por ela sem migração nova.  │
-- └──────────────────────────────────────────────────────────────────┘
--
-- RLS: nenhuma tabela nova. A RPC nova é SECURITY DEFINER e filtra por
-- tenant + dispositivo — mesmo padrão das outras RPCs públicas, que são
-- a única porta do anon.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Colunas ─────────────────────────────────────────────────────
ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS cidade text;

COMMENT ON COLUMN public.delivery_pedidos.cidade IS
  'Cidade da entrega. Vem do ViaCEP ou digitada quando o cliente não sabe o CEP — sem ela, um bairro de nome comum não diz de qual cidade é.';

ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS dispositivo_id uuid;

COMMENT ON COLUMN public.delivery_pedidos.dispositivo_id IS
  'Identidade anônima do navegador que fez o pedido (UUID gerado no aparelho). É o que deixa a pessoa acompanhar o pedido e ver o histórico sem criar conta. Portador de segredo: quem tem o UUID vê os pedidos dele.';

-- Índice do caminho que a RPC percorre: os pedidos de UM aparelho, do
-- mais novo para o mais velho. Sem ele a consulta varre a tabela inteira
-- do tenant a cada vez que alguém abre "Meus pedidos".
CREATE INDEX IF NOT EXISTS delivery_pedidos_dispositivo_idx
  ON public.delivery_pedidos (tenant_id, dispositivo_id, created_at DESC)
  WHERE dispositivo_id IS NOT NULL;

-- ── 2. criar_pedido_delivery: CEP opcional, cidade e dispositivo ───
-- Cópia literal de 20260928, com três mudanças: a cidade e o dispositivo
-- entram na gravação, e o endereço passa a poder ser resolvido só por
-- bairro. Nada mais do corpo mudou.
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
  v_dispositivo uuid;
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
        p_payload -> 'cliente' ->> 'telefone',
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

-- ── 3. meus_pedidos_delivery — acompanhar sem conta ────────────────
CREATE OR REPLACE FUNCTION public.meus_pedidos_delivery(
  p_slug        text,
  p_dispositivo uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tenant uuid := public.delivery_tenant_por_slug(p_slug);
  v_result jsonb;
BEGIN
  -- Sem tenant ou sem identidade: lista vazia, não erro. Quem abre a
  -- vitrine pela primeira vez cai exatamente aqui, e não tem nada de
  -- errado com isso.
  IF v_tenant IS NULL OR p_dispositivo IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(p ORDER BY p->>'created_at' DESC), '[]'::jsonb)
    INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'numero',       d.numero,
      'status',       d.status,
      'total',        d.total,
      'taxa_entrega', d.taxa_entrega,
      'tipo_entrega', d.tipo_entrega,
      -- O endereço da ENTREGA (ou o balcão da retirada) é o que a pessoa
      -- confere. Telefone e complemento ficam de fora de propósito: quem
      -- acompanha o pedido não precisa deles, e o que não sai daqui não
      -- vaza se o UUID do aparelho vazar.
      'endereco',     d.endereco,
      'created_at',   d.created_at,
      'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('nome', i.nome, 'qtd', i.qtd) ORDER BY i.nome)
        FROM public.delivery_pedido_itens i
        WHERE i.pedido_id = d.id AND i.tenant_id = v_tenant
      ), '[]'::jsonb)
    ) AS p
    FROM public.delivery_pedidos d
    WHERE d.tenant_id = v_tenant
      AND d.dispositivo_id = p_dispositivo
    ORDER BY d.created_at DESC
    -- Teto: histórico é para acompanhar e repetir o último pedido, não
    -- para baixar a vida inteira do cliente numa chamada.
    LIMIT 20
  ) sub;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.meus_pedidos_delivery(text, uuid) IS
  'Pedidos de UM aparelho na vitrine pública (acompanhamento sem conta). O dispositivo_id é portador de segredo: quem tem o UUID vê estes pedidos. Devolve no máximo 20, sem telefone e sem complemento do endereço.';

GRANT EXECUTE ON FUNCTION public.meus_pedidos_delivery(text, uuid) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 4. Conferência ao vivo — aborta a transação se faltar ponta.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
  n     integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'delivery_pedidos'
     AND column_name IN ('cidade', 'dispositivo_id');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Sem CEP / meus pedidos: faltam colunas em delivery_pedidos (cidade, dispositivo_id).';
  END IF;

  -- O CEP não pode ter virado obrigatório por acidente: é justamente o
  -- que esta migração está tirando do caminho.
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'delivery_pedidos'
     AND column_name = 'cep' AND is_nullable = 'YES';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Sem CEP: delivery_pedidos.cep precisa aceitar NULL — quem não sabe o CEP tem que conseguir pedir.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'delivery_pedidos_dispositivo_idx'
  ) THEN
    RAISE EXCEPTION 'Meus pedidos: falta o índice por dispositivo — a consulta varreria a tabela inteira a cada abertura.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'meus_pedidos_delivery';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Meus pedidos: a RPC não foi criada.';
  END IF;
  -- Telefone no retorno seria dado a mais no caminho de um segredo que
  -- mora no navegador de alguém.
  IF position('cliente_telefone' in v_def) > 0 THEN
    RAISE EXCEPTION 'Meus pedidos: a RPC não deve devolver telefone do cliente.';
  END IF;
  IF position('LIMIT 20' in v_def) = 0 THEN
    RAISE EXCEPTION 'Meus pedidos: a RPC precisa do teto de 20 pedidos.';
  END IF;

  IF NOT has_function_privilege('anon', 'public.meus_pedidos_delivery(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Meus pedidos: o anon precisa executar a RPC — a vitrine não tem login.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'criar_pedido_delivery';
  IF v_def IS NULL OR position('dispositivo_id' in v_def) = 0 THEN
    RAISE EXCEPTION 'Meus pedidos: criar_pedido_delivery não carimba o aparelho — o histórico nasceria sempre vazio.';
  END IF;
  IF position('invalid_text_representation' in v_def) = 0 THEN
    RAISE EXCEPTION 'Meus pedidos: sem a guarda de cast, um dispositivo_id inválido derrubaria o pedido inteiro.';
  END IF;

  RAISE NOTICE 'CEP opcional, cidade no pedido e histórico por aparelho: no ar.';
END;
$conf$;
