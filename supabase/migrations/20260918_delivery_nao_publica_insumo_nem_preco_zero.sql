-- ══════════════════════════════════════════════════════════════════
-- DL34 — insumo da ficha técnica estava à venda, a R$ 0,00, na vitrine
--        pública, sem login nenhum.
--
-- Achado 5 do relatório de testes de 10/08/2026 (crítico). Em
-- /cardapio?loja=<slug>, aberto por qualquer pessoa da internet, havia
-- uma categoria "Insumo" com "Farinha de trigo", "CROISSANT",
-- "PRESUNTO", "QUEIJO MUSSARELA" e "QUEIJO" — todos "Disponível", todos
-- R$ 0,00, todos com botão de adicionar à sacola. Dava para fechar um
-- pedido de delivery de dez quilos de queijo por zero real, e a cozinha
-- receberia o pedido como qualquer outro.
--
-- De onde vieram: `importarProdutosDelivery` (deliveryAdmin.js) publica
-- de uma vez TODO produto ativo do PDV que ainda não tem linha em
-- produto_delivery. Insumo e Produção são produtos em `products` como
-- qualquer outro — é assim que a ficha técnica desconta estoque —, então
-- o botão "importar cardápio do PDV" leva a matéria-prima junto.
--
-- ┌─ A REGRA, e por que ela é exatamente esta ───────────────────────┐
-- │ Um produto NÃO vai para a vitrine pública quando:                 │
-- │   • a categoria dele é de sistema (Insumo / Produção). Elas não   │
-- │     são categorias de cardápio: são a matéria-prima e as etapas   │
-- │     internas (src/lib/categoriasProduto.js, CATS_FIXAS). O dono   │
-- │     nem consegue criá-las pelo cadastro comum — só pelos botões   │
-- │     "+ Novo Insumo" / "+ Item de Produção".                        │
-- │   • o preço é zero ou negativo. Item vendável tem preço; preço    │
-- │     zerado no delivery é sempre cadastro pela metade, e o         │
-- │     prejuízo de publicá-lo é ilimitado (o cliente leva de graça). │
-- │     Vale para produto E para combo — combo sai de `combos`, não   │
-- │     de `products`, e passaria pela guarda de categoria.            │
-- │                                                                    │
-- │ A comparação de categoria ignora acento e caixa ("produção",      │
-- │ "PRODUCAO", " Produção ") porque o dado é texto livre digitado —  │
-- │ é a mesma tolerância de `chaveCategoria` no front, e uma guarda   │
-- │ que só pega a grafia exata não é guarda.                           │
-- └────────────────────────────────────────────────────────────────────┘
--
-- Como em DL33, a régua vale nas DUAS pontas: `cardapio_publico` não
-- publica, e `criar_pedido_delivery` recusa — quem está com a aba aberta
-- desde antes, ou quem monta o payload na mão, esbarra no servidor.
--
-- Limpeza do que já está no ar (o item (i) do achado):
--   • insumo/produção publicado → a linha de produto_delivery é APAGADA.
--     Ela só carrega foto/descrição/ordem do delivery; não existe dado do
--     negócio ali, e esses produtos nunca deveriam ter tido uma. O
--     produto em `products` não é tocado — a ficha técnica continua
--     inteira.
--   • preço zero em produto de cardápio de verdade → `disponivel = false`,
--     não apaga. Aqui é provável cadastro pela metade: o dono põe o preço
--     e volta a publicar com um clique, sem refazer foto e descrição.
--
-- As duas RPCs são cópia literal da 20260907 (a última a definir cada
-- uma), com um único trecho a mais em cada.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova. A função
-- nova é IMMUTABLE e pura (não lê tabela), então não precisa de
-- SECURITY DEFINER; segue o padrão do projeto e não recebe EXECUTE para
-- PUBLIC — ela roda DENTRO das RPCs, o anon não a alcança.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. O predicado de categoria de sistema ─────────────────────────
CREATE OR REPLACE FUNCTION public.categoria_interna(p_categoria text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Espelha chaveCategoria (src/lib/categoriasProduto.js): sem espaço
  -- sobrando, minúsculas, sem acento. `translate` em vez de `unaccent`
  -- porque a extensão não é garantida em todo projeto Supabase, e uma
  -- migração que falha por extensão ausente deixa o furo aberto.
  SELECT translate(
           lower(btrim(COALESCE(p_categoria, ''))),
           'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
           'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
         ) IN ('insumo', 'producao');
$$;

COMMENT ON FUNCTION public.categoria_interna(text) IS
  'DL34 — a categoria é de sistema (Insumo/Produção), logo não é cardápio? Tolerante a acento e caixa. Helper interno das RPCs públicas; não exposto ao anon.';

REVOKE EXECUTE ON FUNCTION public.categoria_interna(text) FROM PUBLIC;

-- ── 2. Limpeza do que já está publicado ────────────────────────────
DO $limpeza$
DECLARE
  n_insumo integer;
  n_zero   integer;
BEGIN
  WITH apagados AS (
    DELETE FROM public.produto_delivery pd
    USING public.products p
    WHERE p.id = pd.produto_id
      AND p.tenant_id = pd.tenant_id
      AND public.categoria_interna(p.category)
    RETURNING 1
  )
  SELECT count(*) INTO n_insumo FROM apagados;

  WITH escondidos AS (
    UPDATE public.produto_delivery pd
       SET disponivel = false
      FROM public.products p
     WHERE p.id = pd.produto_id
       AND p.tenant_id = pd.tenant_id
       AND COALESCE(p.price, 0) <= 0
       AND pd.disponivel
    RETURNING 1
  )
  SELECT count(*) INTO n_zero FROM escondidos;

  RAISE NOTICE 'DL34: % item(ns) de categoria de sistema removido(s) do delivery; % item(ns) de preço zerado marcado(s) como indisponível.',
    n_insumo, n_zero;
END;
$limpeza$;

-- ── 3. cardapio_publico: a régua entra na vitrine ──────────────────
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
          -- DL34: matéria-prima e etapa interna não são cardápio, e item
          -- sem preço não se vende. Vale mesmo que alguém tenha
          -- publicado a linha em produto_delivery.
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
        -- DL33: combo com componente fora do ar não vai para a vitrine.
        AND NOT public.combo_indisponivel(cb.id, v_tenant)
        -- DL34: combo sem preço também não.
        AND COALESCE(cb.preco_total, 0) > 0
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 4. criar_pedido_delivery: e a régua vale no envio do pedido ────
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
  v_seq        integer;
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
      -- DL33: mesma régua do produto solto, agora no envio. A vitrine já
      -- não publica o combo com componente fora do ar, mas quem tem a
      -- tela aberta desde antes segue com ele na sacola — e o payload é
      -- do cliente. Sem esta linha a cozinha recebe combo que não tem
      -- como montar.
      IF public.combo_indisponivel(v_combo.id, v_tenant) THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      -- DL34: combo sem preço não se vende (nem por aba aberta desde
      -- antes da correção, nem por payload montado na mão).
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
      -- exige que o produto esteja publicado no delivery e disponível
      IF NOT EXISTS (
        SELECT 1 FROM public.produto_delivery pd
        WHERE pd.produto_id = v_prod.id AND pd.tenant_id = v_tenant AND pd.disponivel
      ) THEN
        RAISE EXCEPTION 'Item indisponível.';
      END IF;
      -- DL34: matéria-prima/etapa interna e item sem preço não se vendem
      -- pela internet, mesmo que a linha de produto_delivery exista.
      IF public.categoria_interna(v_prod.category) OR COALESCE(v_prod.price, 0) <= 0 THEN
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
  -- Formatação do sufixo: nenhuma das duas opções óbvias serve sozinha.
  -- `lpad(n::text, 3, '0')` TRUNCA acima de três dígitos — o pedido 1000
  -- viraria 100 e colidiria com o de número 100. E `to_char(n,'FM000')`
  -- não expande o gabarito: o que não cabe vira '###'. O '###' seria pior
  -- que a colisão, porque não casa com o filtro `-[0-9]+$` logo abaixo —
  -- o MAX passaria a ignorar essa linha, todo pedido seguinte do dia
  -- recalcularia o mesmo número, e a loja pararia de aceitar pedidos
  -- depois de esgotar as 8 tentativas. `greatest(3, length(...))` mantém
  -- os três dígitos de sempre e deixa o número crescer quando precisa.
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
-- 5. Conferência ao vivo — o teste do CI lê o texto desta migração;
--    só o banco sabe se ela pegou. Aborta a transação se faltar ponta.
--    Não escreve dado nenhum.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def  text;
  v_conf text[];
  v_rpc  text;
  n      integer;
BEGIN
  -- ── O predicado existe e responde o que se espera dele ───────────
  SELECT pg_get_functiondef(p.oid), p.proconfig
    INTO v_def, v_conf
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'categoria_interna';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DL34: public.categoria_interna não foi criada.';
  END IF;
  IF v_conf IS NULL OR NOT (v_conf @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'DL34: categoria_interna sem search_path fixo — ela decide o que um anônimo vê.';
  END IF;
  IF has_function_privilege('public', 'public.categoria_interna(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DL34: categoria_interna não devia ter EXECUTE para PUBLIC.';
  END IF;

  -- A tolerância a acento/caixa é o ponto do predicado: sem ela, a
  -- guarda passa a valer só para quem digitou "Insumo" com I maiúsculo.
  IF NOT (public.categoria_interna('Insumo')
          AND public.categoria_interna('  PRODUÇÃO ')
          AND public.categoria_interna('producao')) THEN
    RAISE EXCEPTION 'DL34: categoria_interna não está reconhecendo as categorias de sistema.';
  END IF;
  IF public.categoria_interna('Lanches')
     OR public.categoria_interna(NULL)
     OR public.categoria_interna('') THEN
    RAISE EXCEPTION 'DL34: categoria_interna está barrando categoria de cardápio de verdade.';
  END IF;

  -- ── As duas portas aplicam a régua ───────────────────────────────
  FOREACH v_rpc IN ARRAY ARRAY['cardapio_publico', 'criar_pedido_delivery']
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p
      JOIN pg_namespace n2 ON n2.oid = p.pronamespace
     WHERE n2.nspname = 'public' AND p.proname = v_rpc;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'DL34: public.% sumiu.', v_rpc;
    END IF;
    IF position('categoria_interna' in v_def) = 0 THEN
      RAISE EXCEPTION 'DL34: public.% não consulta categoria_interna — insumo volta a ser vendido pela internet.', v_rpc;
    END IF;
  END LOOP;

  -- ── Nada de insumo/preço zero sobrando na vitrine ────────────────
  SELECT count(*) INTO n
    FROM public.produto_delivery pd
    JOIN public.products p
      ON p.id = pd.produto_id AND p.tenant_id = pd.tenant_id
   WHERE pd.disponivel
     AND (public.categoria_interna(p.category) OR COALESCE(p.price, 0) <= 0);

  IF n > 0 THEN
    RAISE EXCEPTION 'DL34: % item(ns) de insumo/preço zerado continuam marcados como disponíveis no delivery.', n;
  END IF;

  RAISE NOTICE 'DL34: conferência OK. Insumo, item de produção e item sem preço não chegam mais à vitrine pública.';
END;
$conf$;
