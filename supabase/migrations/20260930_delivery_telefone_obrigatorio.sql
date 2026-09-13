-- ══════════════════════════════════════════════════════════════════
-- Telefone obrigatório no pedido do delivery.
--
-- ┌─ Por que ─────────────────────────────────────────────────────────┐
-- │ O telefone era opcional na vitrine e é o ÚNICO caminho do         │
-- │ estabelecimento até o cliente depois que o pedido entra: o        │
-- │ entregador não acha o endereço, um item acabou, a campainha não   │
-- │ toca, o cliente não desce. Sem ele o pedido vira um bilhete sem   │
-- │ remetente — e o botão de WhatsApp no painel de quem despacha      │
-- │ (DeliveryView) fica inerte, porque não há número para abrir.      │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Regra que só existe na tela não é regra: o payload é do cliente, e
-- quem monta a chamada na mão passaria sem telefone como sempre passou.
-- Por isso a guarda entra na RPC, antes de qualquer INSERT.
--
-- A validação é a MESMA de `src/lib/telefone.js` (DDD 11..99 + 8 dígitos
-- de fixo, que não começa em 0 ou 1, ou 9 dígitos de celular começando em
-- 9), agora escrita em SQL para o servidor não ter uma régua mais frouxa
-- que a tela. Duas contas para a mesma coisa é como o front e o banco
-- passam a discordar sem ninguém perceber.
--
-- A coluna NÃO vira NOT NULL: os pedidos que já existem foram feitos
-- quando o campo era opcional, e uma migração que falha por causa do
-- passado não entra no ar. A regra vale para pedido NOVO, que é onde ela
-- muda alguma coisa.
--
-- O telefone passa a ser gravado só com os dígitos, como o cadastro de
-- clientes já faz: a mesma pessoa digitando com e sem máscara viraria
-- dois contatos diferentes.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A régua, igual à do front ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.telefone_br_valido(p_tel text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d text := regexp_replace(COALESCE(p_tel, ''), '\D', '', 'g');
BEGIN
  IF length(d) NOT IN (10, 11) THEN RETURN false; END IF;
  IF substring(d, 1, 2)::int < 11 THEN RETURN false; END IF;
  -- Celular tem 9 dígitos e o primeiro é sempre 9.
  IF length(d) = 11 AND substring(d, 3, 1) <> '9' THEN RETURN false; END IF;
  -- Fixo nunca começa em 0 ou 1.
  IF length(d) = 10 AND substring(d, 3, 1) IN ('0', '1') THEN RETURN false; END IF;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.telefone_br_valido(text) IS
  'Telefone brasileiro válido? Espelha src/lib/telefone.js — a tela e o servidor precisam usar a MESMA régua. Helper interno das RPCs; não exposto ao anon.';

REVOKE EXECUTE ON FUNCTION public.telefone_br_valido(text) FROM PUBLIC;

-- ── 2. criar_pedido_delivery: a guarda antes de qualquer INSERT ────
-- Cópia literal de 20260929, com a guarda do telefone e a gravação só
-- dos dígitos. Nada mais do corpo mudou.
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
  v_telefone   text;
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

-- ══════════════════════════════════════════════════════════════════
-- 3. Conferência ao vivo — a régua é EXECUTADA contra casos conhecidos
--    e a migração aborta se algum divergir. Não escreve dado nenhum.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
BEGIN
  -- ── A régua existe, é interna e responde o que se espera ─────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'telefone_br_valido'
  ) THEN
    RAISE EXCEPTION 'Telefone: public.telefone_br_valido não foi criada.';
  END IF;
  IF has_function_privilege('public', 'public.telefone_br_valido(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Telefone: telefone_br_valido não devia ter EXECUTE para PUBLIC — ela roda dentro das RPCs.';
  END IF;

  -- Os casos são os mesmos de src/lib/telefone.js. Se alguém afrouxar um
  -- lado, é aqui que os dois deixam de bater.
  IF NOT (public.telefone_br_valido('11912345678')          -- celular
          AND public.telefone_br_valido('(11) 91234-5678')  -- com máscara
          AND public.telefone_br_valido('1132145678')) THEN -- fixo
    RAISE EXCEPTION 'Telefone: a régua está recusando número válido — o cliente não conseguiria pedir.';
  END IF;

  IF public.telefone_br_valido('')                    -- vazio
     OR public.telefone_br_valido(NULL)
     OR public.telefone_br_valido('123')              -- curto demais
     OR public.telefone_br_valido('0912345678')       -- DDD inexistente
     OR public.telefone_br_valido('11812345678')      -- celular sem o 9
     OR public.telefone_br_valido('1102145678') THEN  -- fixo começando em 0
    RAISE EXCEPTION 'Telefone: a régua está aceitando número quebrado — é ele que ninguém consegue ligar depois.';
  END IF;

  -- ── E a RPC realmente usa a régua, antes de gravar ───────────────
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_delivery';
  IF v_def IS NULL OR position('telefone_br_valido' in v_def) = 0 THEN
    RAISE EXCEPTION 'Telefone: criar_pedido_delivery sem a guarda — payload montado na mão passaria sem telefone.';
  END IF;
  -- A guarda tem que vir ANTES do INSERT, senão o pedido é gravado e só
  -- depois recusado (a transação desfaz, mas o número do dia é queimado).
  IF position('telefone_br_valido' in v_def) > position('INSERT INTO public.delivery_pedidos' in v_def) THEN
    RAISE EXCEPTION 'Telefone: a guarda está depois do INSERT.';
  END IF;

  RAISE NOTICE 'Telefone obrigatório no pedido do delivery: no ar.';
END;
$conf$;
