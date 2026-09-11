-- ══════════════════════════════════════════════════════════════════════
-- GASTROMUNDI — as 25 migrações pendentes, na ordem certa.
--
-- Gerado a partir de supabase/migrations/, de 20260918_delivery_nao_publica_insumo_nem_preco_zero.sql
-- até 20261003_delivery_whatsapp_no_aceite.sql.
--
-- COMO USAR
--   1. Abra o SQL Editor do seu projeto no Supabase.
--   2. Cole este arquivo INTEIRO e execute.
--   3. Leia o painel de mensagens: cada bloco avisa o que fez.
--
-- É TUDO OU NADA. O arquivo abre com BEGIN e fecha com COMMIT, então um
-- erro no meio desfaz tudo e o banco fica exatamente como estava. Não
-- existe estado "meio aplicado" para você ter que desembaraçar depois.
--
-- DÁ PARA RODAR DE NOVO SEM MEDO. Toda coluna entra com
-- ADD COLUMN IF NOT EXISTS, todo índice com CREATE INDEX IF NOT EXISTS e
-- toda função com CREATE OR REPLACE. Se você já aplicou alguma destas, ela
-- simplesmente não faz nada na segunda vez. Nenhuma apaga dado seu.
--
-- CADA UMA SE CONFERE SOZINHA. As migrações terminam num bloco DO que
-- executa o que acabou de criar contra casos conhecidos e ABORTA a
-- transação se algum resultado divergir. Se o arquivo rodar até o fim, as
-- pontas estão no lugar — não é promessa, é conferência no banco de
-- verdade.
--
-- SE DER ERRO: a última mensagem "▶ APLICANDO" diz em qual migração parou,
-- e o texto do erro diz o que faltou. Me mande os dois.
--
-- RLS: nenhuma tabela nova precisa de policy manual — as que entram aqui
-- herdam a RLS por tenant que já existe. As funções públicas novas são
-- SECURITY DEFINER e filtram por tenant dentro delas.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;


-- ══════════════════════════════════════════════════════════════════════
-- [01/25]  20260918_delivery_nao_publica_insumo_nem_preco_zero.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [01/25] 20260918_delivery_nao_publica_insumo_nem_preco_zero.sql'; END $aplicando$;

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


-- ══════════════════════════════════════════════════════════════════════
-- [02/25]  20260918_grupos_escolha.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [02/25] 20260918_grupos_escolha.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Grupos de escolha — produtos com seleção e combos flexíveis
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Duas necessidades convergem numa mesma abstração:                │
-- │                                                                  │
-- │  1. PRODUTO COM SELEÇÃO — um "Refrigerante" no cardápio que na   │
-- │     hora da venda pede qual (Coca, Fanta, Guaraná). Cada opção   │
-- │     é um PRODUTO REAL do catálogo, então estoque e preço saem    │
-- │     do item escolhido.                                           │
-- │                                                                  │
-- │  2. COMBO FLEXÍVEL — "Hambúrguer + Refri" onde o cliente escolhe │
-- │     qualquer hambúrguer e qualquer refri, em vez de um combo com │
-- │     produto principal fixo. O combo passa a ser nome + preço +   │
-- │     grupos de escolha, sem item_principal_id obrigatório.        │
-- │                                                                  │
-- │ Os dois casos são o MESMO conceito: um "grupo de escolha" com N  │
-- │ opções, mínimo e máximo de seleção. O grupo pertence OU a um     │
-- │ produto (produto_id) OU a um combo (combo_id) — nunca aos dois.  │
-- │                                                                  │
-- │ origem='lista'     → as opções são os grupo_escolha_itens.       │
-- │ origem='categoria' → as opções são todos os produtos ativos da   │
-- │                      categoria (campo categoria), resolvido no    │
-- │                      front; grupo_escolha_itens fica vazio.       │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: cria duas tabelas e apenas RELAXA combos.item_principal_id
-- (NOT NULL → nullable) para combos flexíveis nascerem sem principal.
-- Nada é removido. As tabelas subprodutos/combo_subprodutos/
-- estoque_subprodutos e a coluna combos.modo continuam existindo (o
-- front deixa de usá-las, mas o sistema de delivery ainda depende de
-- item_principal_id + combo_produtos — remoção fica para depois).
--
-- ┌─ PRÉ-REQUISITO ─────────────────────────────────────────────────┐
-- │ Roda depois de 20260724_multitenant_fase2_isolamento.sql. Igual  │
-- │ a 20260726_combo_produtos, o bloco de tenant é CONDICIONAL ao    │
-- │ helper public.tenant_atual_id() já existir.                      │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS antes de
-- CREATE, ADD COLUMN IF NOT EXISTS, guardas WHERE no backfill.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. combos.item_principal_id passa a aceitar NULL ───────────────
-- Combo flexível não tem produto principal; é definido só por seus
-- grupos de escolha. DROP NOT NULL é idempotente (reexecutar é no-op).
ALTER TABLE combos ALTER COLUMN item_principal_id DROP NOT NULL;

-- ── 2. grupos_escolha ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grupos_escolha (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id BIGINT  REFERENCES products(id) ON DELETE CASCADE,
  combo_id   UUID    REFERENCES combos(id)   ON DELETE CASCADE,
  nome       TEXT    NOT NULL,
  minimo     INTEGER NOT NULL DEFAULT 1 CHECK (minimo >= 0),
  maximo     INTEGER NOT NULL DEFAULT 1 CHECK (maximo >= 1),
  origem     TEXT    NOT NULL DEFAULT 'lista' CHECK (origem IN ('lista', 'categoria')),
  categoria  TEXT,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- dono exclusivo: OU produto OU combo, nunca os dois nem nenhum
  CONSTRAINT grupos_escolha_dono_unico CHECK (
    (produto_id IS NOT NULL AND combo_id IS NULL)
    OR (produto_id IS NULL AND combo_id IS NOT NULL)
  ),
  CONSTRAINT grupos_escolha_maximo_valido CHECK (maximo >= minimo)
);

CREATE INDEX IF NOT EXISTS idx_grupos_escolha_produto ON grupos_escolha(produto_id);
CREATE INDEX IF NOT EXISTS idx_grupos_escolha_combo   ON grupos_escolha(combo_id);

-- ── 3. grupo_escolha_itens — opções de um grupo origem='lista' ─────
CREATE TABLE IF NOT EXISTS grupo_escolha_itens (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          UUID          NOT NULL REFERENCES grupos_escolha(id) ON DELETE CASCADE,
  produto_id        BIGINT        NOT NULL REFERENCES products(id)       ON DELETE CASCADE,
  preco_customizado NUMERIC(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  ordem             INTEGER       NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_grupo_escolha_itens_grupo   ON grupo_escolha_itens(grupo_id);
CREATE INDEX IF NOT EXISTS idx_grupo_escolha_itens_produto ON grupo_escolha_itens(produto_id);

ALTER TABLE grupos_escolha      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grupo_escolha_itens ENABLE ROW LEVEL SECURITY;

-- Policies permissivas base (mesmo padrão de combo_produtos). O
-- isolamento REAL por tenant é a RESTRICTIVE do bloco condicional abaixo.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grupos_escolha' AND policyname = 'allow_all_grupos_escolha'
  ) THEN
    CREATE POLICY "allow_all_grupos_escolha" ON grupos_escolha FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'grupo_escolha_itens' AND policyname = 'allow_all_grupo_escolha_itens'
  ) THEN
    CREATE POLICY "allow_all_grupo_escolha_itens" ON grupo_escolha_itens FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 4. Isolamento multi-tenant (condicional à Leva 1/2 já aplicada) ─
-- Replica para as duas tabelas exatamente o que 20260726 fez em
-- combo_produtos: coluna tenant_id (DEFAULT dinâmico via JWT + NOT NULL)
-- e policy RESTRICTIVE por tenant.
DO $$ BEGIN
  IF to_regprocedure('public.tenant_atual_id()') IS NOT NULL THEN
    -- grupos_escolha
    ALTER TABLE grupos_escolha ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
    UPDATE grupos_escolha
       SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
     WHERE tenant_id IS NULL;
    ALTER TABLE grupos_escolha ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
    ALTER TABLE grupos_escolha ALTER COLUMN tenant_id SET NOT NULL;
    DROP POLICY IF EXISTS grupos_escolha_tenant_isolation ON grupos_escolha;
    CREATE POLICY grupos_escolha_tenant_isolation ON grupos_escolha AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id())
      WITH CHECK (tenant_id = public.tenant_atual_id());
    CREATE INDEX IF NOT EXISTS grupos_escolha_tenant_id_idx ON grupos_escolha (tenant_id);

    -- grupo_escolha_itens
    ALTER TABLE grupo_escolha_itens ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
    UPDATE grupo_escolha_itens
       SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
     WHERE tenant_id IS NULL;
    ALTER TABLE grupo_escolha_itens ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
    ALTER TABLE grupo_escolha_itens ALTER COLUMN tenant_id SET NOT NULL;
    DROP POLICY IF EXISTS grupo_escolha_itens_tenant_isolation ON grupo_escolha_itens;
    CREATE POLICY grupo_escolha_itens_tenant_isolation ON grupo_escolha_itens AS RESTRICTIVE FOR ALL
      USING (tenant_id = public.tenant_atual_id())
      WITH CHECK (tenant_id = public.tenant_atual_id());
    CREATE INDEX IF NOT EXISTS grupo_escolha_itens_tenant_id_idx ON grupo_escolha_itens (tenant_id);
  ELSE
    RAISE NOTICE 'public.tenant_atual_id() ausente — grupos_escolha/grupo_escolha_itens criadas sem tenant_id. Ao aplicar a Leva multitenant, adicionar tenant_id + policy de isolamento a ambas.';
  END IF;
END $$;

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabelas novas com RLS já habilitado e policies criadas aqui. Nenhuma
-- ação no painel é necessária além de conferir que RLS está ligada.


-- ══════════════════════════════════════════════════════════════════════
-- [03/25]  20260919_baixa_estoque_cria_linha.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [03/25] 20260919_baixa_estoque_cria_linha.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Baixa no caixa SEMPRE vira baixa no estoque
--
-- ┌─ O FURO ─────────────────────────────────────────────────────────┐
-- │ `baixar_estoque` é um UPDATE: `WHERE produto_id = ...`. Produto   │
-- │ sem linha em `estoque` → 0 linhas afetadas, nenhum erro. A venda  │
-- │ fecha e o estoque não mexe.                                       │
-- │                                                                   │
-- │ E produto sem linha é o caso COMUM, não a exceção: `addProduct`   │
-- │ nunca criou a linha. Todo produto cadastrado pelo app nasce fora  │
-- │ do controle de estoque e é vendido para sempre sem descontar —    │
-- │ enquanto a tela de Estoque o lista com saldo "0", igualzinho a um │
-- │ produto controlado que acabou. Não dá para distinguir na tela o   │
-- │ que acabou do que nunca foi contado.                              │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CORREÇÃO ─────────────────────────────────────────────────────┐
-- │ A RPC cria a linha (saldo 0, mínimo padrão) antes de descontar.   │
-- │ A partir daí o UPDATE sempre acha o que atualizar: o desconto     │
-- │ acontece, o `GREATEST(0, ...)` segura o saldo em zero e o app     │
-- │ recebe a linha de volta — que é como o Jarvas enxerga a venda sem │
-- │ estoque (oversell) e o cruzamento do mínimo.                      │
-- │                                                                   │
-- │ O INSERT vem ANTES da checagem de idempotência de propósito: uma  │
-- │ baixa reenviada da fila offline também precisa devolver a linha,  │
-- │ senão o app lê "nenhuma linha" e acusa falha numa baixa que já    │
-- │ tinha sido aplicada.                                              │
-- │                                                                   │
-- │ Só a tabela `estoque` (produtos) muda. `estoque_subprodutos` não: │
-- │ lá a linha nasce junto com o `controla_estoque` do cadastro de    │
-- │ subprodutos, então linha faltando é inconsistência de dados — o   │
-- │ app passa a acusar em vez de criar por conta própria.             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Efeito colateral declarado: produto que ninguém quer controlar (couvert,
-- taxa de serviço) passa a ter linha e a gerar alerta de venda sem estoque.
-- Hoje não existe como desligar o controle por produto — a saída é dar
-- entrada do saldo. Um `controla_estoque` em `products` resolveria, e está
-- anotado no backlog como decisão de produto.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT re-aplicáveis.
-- RLS: nenhuma policy nova. A função é SECURITY DEFINER e continua sendo a
-- única a escrever aqui em nome do operador; o INSERT carrega
-- `tenant_atual_id()` explícito, então a linha nasce no tenant certo.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.baixar_estoque(
  p_produto_id bigint,
  p_qtd        numeric,
  p_op_id      uuid DEFAULT NULL
)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fail-closed: claim ausente/NULL (anon, token adulterado) → RAISE.
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  -- Garante a linha do produto no tenant de quem está vendendo. `DO NOTHING`
  -- porque o caso normal é a linha já existir; e se ela existir em OUTRO
  -- tenant, o conflito não a rouba — o UPDATE abaixo não vai achá-la e o app
  -- acusa a baixa não aplicada, que é o certo.
  -- quantidade e minimo ficam com os defaults da tabela (0 e 10).
  INSERT INTO public.estoque (produto_id, tenant_id)
  VALUES (p_produto_id, public.tenant_atual_id())
  ON CONFLICT (produto_id) DO NOTHING;

  IF p_op_id IS NOT NULL THEN
    INSERT INTO public.estoque_baixas_aplicadas (op_id, tenant_id, produto_id, qtd)
    VALUES (p_op_id, public.tenant_atual_id(), p_produto_id, p_qtd)
    ON CONFLICT (op_id) DO NOTHING;

    -- Nada inserido = esta baixa já foi aplicada antes. Devolve o saldo
    -- de agora (o app precisa dele para o alerta de mínimo) sem repetir
    -- o desconto.
    IF NOT FOUND THEN
      RETURN QUERY
      SELECT e.quantidade, e.minimo
        FROM public.estoque e
       WHERE e.produto_id = p_produto_id
         AND e.tenant_id  = public.tenant_atual_id();
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.estoque e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.produto_id = p_produto_id
     AND e.tenant_id  = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) TO authenticated;

-- ── Backfill: produtos que já existem sem linha de estoque ─────────
-- Sem isto, a linha só nasceria na primeira venda de cada produto — e até
-- lá a tela de Estoque continuaria mostrando saldo "0" que não é saldo
-- nenhum. Cria com saldo 0 e mínimo padrão, no tenant do próprio produto.
INSERT INTO public.estoque (produto_id, tenant_id)
SELECT p.id, p.tenant_id
  FROM public.products p
 WHERE NOT EXISTS (SELECT 1 FROM public.estoque e WHERE e.produto_id = p.id)
ON CONFLICT (produto_id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════
-- [04/25]  20260919_delivery_entregadores.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [04/25] 20260919_delivery_entregadores.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Delivery — entregadores (motoboys) + atribuição ao pedido
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O painel de delivery precisa saber QUEM leva cada pedido para:   │
-- │   • acompanhar quantas entregas cada entregador tem em rota;      │
-- │   • fechar o dia por entregador (quanto pagar a cada um).         │
-- │                                                                  │
-- │ Modelo simples e de custo zero (fase de bootstrap): cada         │
-- │ entregador tem um `valor_por_entrega` (R$ fixo por corrida). Ao  │
-- │ atribuir um entregador ao pedido, esse valor é FOTOGRAFADO em    │
-- │ delivery_pedidos.valor_entregador — assim o fechamento histórico │
-- │ não muda se o dono reajustar o valor do entregador depois. O     │
-- │ snapshot também é editável por pedido (corrida mais longa vale   │
-- │ mais), sem afetar os outros pedidos.                             │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: cria uma tabela e adiciona duas colunas em delivery_pedidos.
-- Nada é removido. Segue o padrão da fundação (20260804): tenant_id com
-- DEFAULT public.tenant_atual_id() + RLS RESTRICTIVE por tenant, para o
-- admin inserir/editar DIRETO pelo client sem passar tenant_id.
--
-- Idempotente: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS antes de CREATE, CREATE INDEX IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. delivery_entregadores — cadastro de motoboys/entregadores ───
CREATE TABLE IF NOT EXISTS public.delivery_entregadores (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome              text        NOT NULL,
  telefone          text,
  ativo             boolean     NOT NULL DEFAULT true,
  valor_por_entrega numeric     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_entregadores_tenant_idx
  ON public.delivery_entregadores (tenant_id);

-- ── 2. delivery_pedidos ganha o entregador atribuído + snapshot R$ ──
-- entregador_id: ON DELETE SET NULL — apagar um entregador não apaga o
-- histórico de pedidos, só desvincula. valor_entregador: fotografia do
-- valor no momento da atribuição (editável por pedido).
ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS entregador_id   uuid REFERENCES public.delivery_entregadores(id) ON DELETE SET NULL;
ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS valor_entregador numeric;

CREATE INDEX IF NOT EXISTS delivery_pedidos_entregador_idx
  ON public.delivery_pedidos (tenant_id, entregador_id);

-- ── 3. RLS ──────────────────────────────────────────────────────────
-- Duas camadas, do mesmo jeito que o cardápio do Delivery (20260804 +
-- CORREÇÃO 20260807):
--   • PERMISSIVE de papel — LIBERA o acesso. No PostgreSQL uma policy
--     RESTRICTIVE só RESTRINGE (AND) linhas já liberadas por ALGUMA
--     permissive; sem NENHUMA permissive o resultado é "nega tudo" e o
--     INSERT/SELECT volta 403. (Foi exatamente o bug que a 20260807
--     corrigiu nas tabelas de Delivery que nasceram sem essa base.)
--   • RESTRICTIVE de tenant — ISOLA: cada papel só enxerga/escreve
--     dentro do próprio tenant (soma via AND com a permissive).
-- Espelha o padrão de gestão do cardápio: leitura para qualquer
-- autenticado (o painel mostra o nome do entregador no card do pedido
-- para o caixa também); escrita só para gerente/admin (== isAdmin no
-- app). Papel lido de app_metadata.gastro_role (NÃO da raiz `role` do
-- JWT, que o PostgREST reserva para authenticated/anon/service_role).
ALTER TABLE public.delivery_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_entregadores FORCE  ROW LEVEL SECURITY;

-- PERMISSIVE: leitura para autenticado.
DROP POLICY IF EXISTS delivery_entregadores_select_auth ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_select_auth
  ON public.delivery_entregadores FOR SELECT
  USING (auth.role() = 'authenticated');

-- PERMISSIVE: escrita (INSERT/UPDATE/DELETE) só para gerente/admin.
DROP POLICY IF EXISTS delivery_entregadores_write_gerente_admin ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_write_gerente_admin
  ON public.delivery_entregadores FOR ALL
  USING      ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- RESTRICTIVE: isolamento por tenant (soma via AND com as permissive acima).
DROP POLICY IF EXISTS delivery_entregadores_tenant_isolamento ON public.delivery_entregadores;
CREATE POLICY delivery_entregadores_tenant_isolamento
  ON public.delivery_entregadores AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Tabela nova com RLS já habilitado e policies (permissive de papel +
-- restrictive de tenant) criadas aqui. Nenhuma ação no painel é
-- necessária além de conferir que RLS está ligada em
-- public.delivery_entregadores. As colunas novas em delivery_pedidos
-- (entregador_id/valor_entregador) reaproveitam as policies dessa tabela
-- (20260807: escrita caixa/gerente/admin) — atribuir entregador é UPDATE.


-- ══════════════════════════════════════════════════════════════════════
-- [05/25]  20260919_pautas.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [05/25] 20260919_pautas.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Pautas da Kora — pautas_pessoas + pautas
-- docs/03_REGRAS_DE_NEGOCIO/PAUTAS.md · ADR-011 · decisão 034
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O dono precisa estipular o que os sócios vão programar. Hoje    │
-- │ isso vive em conversa de WhatsApp: some, ninguém sabe o que já  │
-- │ foi feito e todo mundo pergunta "isso é pra quê mesmo?".        │
-- │                                                                  │
-- │ Uma pauta guarda as três coisas que a conversa perde: o que é   │
-- │ (título), PARA QUE serve (intuito), o que já se sabe            │
-- │ (contexto) — mais quem está envolvido e em que pé está.         │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ⚠️ ISTO NÃO É DADO DE ESTABELECIMENTO. É a ferramenta INTERNA da Kora,
-- servida no host dedicado pautas.<dominio> (mesmo desenho de host do
-- Console, ADR-008 §7). Por isso NÃO tem tenant_id e NÃO entra no
-- isolamento por tenant: nenhum estabelecimento lê ou escreve aqui.
--
-- Quem entra: só quem autentica no namespace de e-mail `@pautas.local`.
-- O login monta o e-mail como `${usuario}@${slug}.local` (tenantSlug.js)
-- e, neste host, o slug é "pautas". Credencial de tenant não autentica
-- aqui, e a credencial de sócio não autentica em nenhum estabelecimento.
-- A fronteira REAL é esta RLS — a separação de host é só UX.
--
-- Os sócios NÃO nascem no código: nascem nesta tabela. Um quarto sócio é
-- uma linha em pautas_pessoas + um usuário no Auth, não um deploy
-- (white-label, decisão 017).
--
-- PRÉ-REQUISITO: criar os 3 usuários no Supabase Auth com e-mail
-- `<slug>@pautas.local` (Authentication → Users → Add user, "Auto
-- Confirm User" ligado). O `slug` da pessoa aqui tem que ser IGUAL à
-- parte antes do @ — é por ele que a tela sabe quem está logado.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- seed com ON CONFLICT DO NOTHING.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: as policies abaixo restringem tudo ao namespace @pautas.local —
--    confira no painel (Authentication → Policies) que RLS ficou
--    habilitada nas duas tabelas.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Quem é sócio ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pautas_pessoas (
  -- slug = parte do e-mail antes do @ (matheus, guilherme, bonato)
  slug       text        PRIMARY KEY,
  -- nome como aparece na tela — é o que o dono pediu ver na pauta
  nome       text        NOT NULL,
  -- sócio que saiu vira ativo=false: some dos formulários, mas as pautas
  -- antigas continuam mostrando o nome de quem participou
  ativo      boolean     NOT NULL DEFAULT true,
  -- ordem fixa na tela; sem ela a lista muda de posição a cada carga
  ordem      smallint    NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pautas_pessoas (slug, nome, ordem) VALUES
  ('matheus',   'Matheus',   1),
  ('guilherme', 'Guilherme', 2),
  ('bonato',    'Bonato',    3)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. A pauta ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pautas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- o que é, em uma linha
  titulo         text        NOT NULL,
  -- PARA QUE serve — o campo que a conversa de WhatsApp sempre perde
  intuito        text        NOT NULL,
  -- o que já se sabe: links, decisões anteriores, restrições
  contexto       text        NOT NULL DEFAULT '',
  -- slugs de pautas_pessoas. Array porque uma pauta pode ser de dois ou
  -- dos três — a decisão foi "vários envolvidos por pauta".
  envolvidos     text[]      NOT NULL DEFAULT '{}',
  -- 'pendente' | 'em_progresso' | 'finalizado'
  status         text        NOT NULL DEFAULT 'pendente',
  -- slug de quem criou e de quem mexeu por último (o "quem mudou isso?")
  criada_por     text,
  atualizada_por text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- carimbo do fim; volta a NULL se a pauta reabrir
  finalizada_em  timestamptz
);

-- status restrito ao conjunto conhecido: os três botões da tela são a
-- regra inteira, e escrita torta aqui vira card sem estado na lista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_status_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_status_check
      CHECK (status IN ('pendente', 'em_progresso', 'finalizado'));
  END IF;
END $$;

-- título vazio deixaria um card anônimo na lista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_titulo_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_titulo_check
      CHECK (length(btrim(titulo)) > 0);
  END IF;
END $$;

-- pauta sem intuito é exatamente o que este sistema existe para evitar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_intuito_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_intuito_check
      CHECK (length(btrim(intuito)) > 0);
  END IF;
END $$;

-- A tela abre na lista inteira, mais nova primeiro.
CREATE INDEX IF NOT EXISTS pautas_recentes_idx
  ON public.pautas (created_at DESC);

-- Filtro "só as minhas" (contém o slug da pessoa).
CREATE INDEX IF NOT EXISTS pautas_envolvidos_idx
  ON public.pautas USING GIN (envolvidos);

-- updated_at nunca fica velho, mesmo que a tela esqueça de mandar.
CREATE OR REPLACE FUNCTION public.pautas_marcar_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pautas_updated_at ON public.pautas;
CREATE TRIGGER pautas_updated_at
  BEFORE UPDATE ON public.pautas
  FOR EACH ROW EXECUTE FUNCTION public.pautas_marcar_atualizacao();

-- ── 3. Quem é sócio, do ponto de vista do banco ────────────────────
-- A sessão veio do namespace @pautas.local? É a única credencial que
-- existe neste host. STABLE + SQL puro: roda dentro de cada policy.
CREATE OR REPLACE FUNCTION public.eh_socio_pautas()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.role() = 'authenticated'
     AND coalesce(auth.jwt() ->> 'email', '') LIKE '%@pautas.local';
$$;

-- ── 4. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.pautas_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pautas         ENABLE ROW LEVEL SECURITY;

-- Os sócios LEEM a lista de sócios (é o que preenche os nomes na tela).
-- Sem policy de escrita: entrar/sair da sociedade é ato manual no painel,
-- não botão na tela.
DROP POLICY IF EXISTS pautas_pessoas_select_socio ON public.pautas_pessoas;
CREATE POLICY pautas_pessoas_select_socio
  ON public.pautas_pessoas FOR SELECT
  USING (public.eh_socio_pautas());

-- Pauta é combinada entre os três: todos leem tudo. Esconder pauta de
-- sócio seria o oposto do propósito.
DROP POLICY IF EXISTS pautas_select_socio ON public.pautas;
CREATE POLICY pautas_select_socio
  ON public.pautas FOR SELECT
  USING (public.eh_socio_pautas());

DROP POLICY IF EXISTS pautas_insert_socio ON public.pautas;
CREATE POLICY pautas_insert_socio
  ON public.pautas FOR INSERT
  WITH CHECK (public.eh_socio_pautas());

-- Qualquer sócio move o status: quem está fazendo é quem sabe que
-- começou ou terminou — pedir permissão ao dono travaria o fluxo.
DROP POLICY IF EXISTS pautas_update_socio ON public.pautas;
CREATE POLICY pautas_update_socio
  ON public.pautas FOR UPDATE
  USING      (public.eh_socio_pautas())
  WITH CHECK (public.eh_socio_pautas());

-- Nenhuma policy de DELETE: com RLS habilitada e sem policy, o banco
-- NEGA. Pauta encerrada vira 'finalizado' e continua no histórico —
-- apagar levaria junto o motivo pelo qual se decidiu algo.


-- ══════════════════════════════════════════════════════════════════════
-- [06/25]  20260920_delivery_pagamento_entregador.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [06/25] 20260920_delivery_pagamento_entregador.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Delivery — pagamento do entregador vira SAÍDA DE CAIXA (sangria).
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Até aqui o fechamento do delivery só MOSTRAVA quanto pagar a cada │
-- │ entregador — o dinheiro saía da gaveta sem registro nenhum, e o   │
-- │ caixa fechava com "falta" do valor pago aos motoboys (era um dos  │
-- │ exemplos legítimos de sangria citados em caixaMovimentos.js).     │
-- │                                                                  │
-- │ Agora, ao registrar o pagamento de um entregador no fechamento,  │
-- │ o app grava uma SANGRIA em caixa_movimentos (dinheiro sai da      │
-- │ gaveta, com motivo e autor) e MARCA as corridas pagas para não   │
-- │ pagar a mesma entrega duas vezes.                                 │
-- │                                                                  │
-- │ entregador_pago_em: carimbo do momento do pagamento. NULL = ainda │
-- │ a pagar; preenchido = já saiu da gaveta. O fechamento separa      │
-- │ "a pagar" de "já pago" por este campo.                            │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ADITIVA: só adiciona uma coluna em delivery_pedidos. Nada é removido.
-- A coluna reaproveita a RLS de delivery_pedidos (20260807: escrita para
-- caixa/gerente/admin) — marcar como pago é um UPDATE do operador.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Rodar MANUALMENTE no SQL Editor do Supabase (o projeto não aplica
-- migrations automaticamente).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.delivery_pedidos
  ADD COLUMN IF NOT EXISTS entregador_pago_em timestamptz;

-- Consulta do fechamento filtra por entregador + status + pago/não pago.
CREATE INDEX IF NOT EXISTS delivery_pedidos_entregador_pago_idx
  ON public.delivery_pedidos (tenant_id, entregador_id, entregador_pago_em);

-- ── Lembrete de RLS (painel Supabase) ──────────────────────────────
-- Nenhuma policy nova: a coluna nova de delivery_pedidos usa as policies
-- já existentes da tabela (20260807 — escrita caixa/gerente/admin,
-- RESTRICTIVE de tenant). Basta conferir que RLS segue ligada em
-- public.delivery_pedidos.


-- ══════════════════════════════════════════════════════════════════════
-- [07/25]  20260920_rls_habilitada_tabelas_base.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [07/25] 20260920_rls_habilitada_tabelas_base.sql'; END $aplicando$;

-- ════════════════════════════════════════════════════════════════════
-- 20260920 — LIGAR a RLS nas seis tabelas em que ela nunca foi ligada
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (simulação de ataque, achado nº 1 — o mais grave)
--   No Postgres, `CREATE POLICY` sozinho não protege nada. Enquanto a
--   tabela não tem `ENABLE ROW LEVEL SECURITY`, o planejador ignora
--   TODAS as policies dela: as permissivas e também as RESTRICTIVE.
--   A policy fica escrita, aparece em `pg_policies`, passa em revisão
--   de código — e não vale nada em tempo de execução.
--
--   Seis tabelas estão exatamente nesse estado desde 20240108:
--
--     config        3 policies inertes
--     fechamentos   1 policy  inerte
--     pending       1 policy  inerte
--     products      2 policies inertes
--     sales         1 policy  inerte
--     users         9 policies inertes
--
--   O que isso significa na prática, hoje, em produção:
--
--     • Papel não vale. `sales_all_caixa_up` e `fechamentos_all_caixa_up`
--       existem para deixar só caixa/gerente/admin no faturamento; sem
--       RLS ligada, um GARÇOM lê e escreve venda e fechamento de caixa.
--       `products_write_gerente_admin` idem: garçom reescreve preço.
--     • Tenant não vale. O isolamento multi-tenant da fase 2
--       (20260724, RESTRICTIVE `<t>_tenant_isolamento`) cobre `sales`,
--       `pending`, `products`, `config` e `fechamentos` — inerte junto.
--       Com a chave anon, que é pública por definição, qualquer pessoa
--       logada em QUALQUER estabelecimento lê o cardápio, o caixa e as
--       comandas de TODOS os outros. É o furo mais caro de um SaaS
--       multi-estabelecimento (decisão 017).
--     • Assinatura não vale. O bloqueio por inadimplência (20260720,
--       RESTRICTIVE sobre `public.assinatura_atual_ativa()`) também
--       cobre essas cinco — quem não paga continua operando.
--     • `users` é o pior caso: as nove policies incluem
--       `users_select_self` (cada um vê só a própria linha) e as quatro
--       de admin com clamp de tenant (20260739). Nenhuma valendo, um
--       garçom lista nome, usuário, papel e `auth_id` de todo mundo, de
--       todos os estabelecimentos — a lista de alvos pronta.
--
--   E ninguém percebeu porque o código todo ACREDITA que a RLS está
--   ligada. Dois exemplos de comentário escrito de boa-fé:
--     • 20260744: "o papel `caixa` era barrado pela RLS silenciosamente"
--     • src/context/AppContext.jsx (gravarConfig): "a RLS de config
--       exige gerente/admin — o papel caixa falhava em silêncio"
--   Nenhum dos dois podia ser verdade com a RLS desligada. A migration
--   20260744 foi escrita para consertar um bloqueio que não existia.
--
-- POR QUE LIGAR AGORA É SEGURO (não derruba ninguém)
--   Ligar RLS numa tabela sem policy nenhuma nega tudo. Não é o caso:
--   cada uma das seis tem pelo menos uma policy PERMISSIVE que cobre o
--   uso real do app, e o app já roda assim em produção nas tabelas
--   irmãs. `vendas`, `venda_itens`, `venda_pagamentos`, `lancamentos`,
--   `estoque`, `clientes` e `mesas` carregam a MESMA pilha de policies
--   (permissiva por papel + RESTRICTIVE de tenant + RESTRICTIVE de
--   assinatura), já estão com RLS ligada e funcionam.
--
--   O caminho público do delivery não passa por aqui: o cardápio, a
--   taxa e o pedido do cliente entram por RPC SECURITY DEFINER
--   (`cardapio_publico`, `calcular_taxa_entrega`, `criar_pedido_delivery`),
--   que roda por cima da RLS. Ligar `products` não apaga o cardápio
--   público.
--
--   O que MUDA de comportamento, de propósito, é o papel `garcom`:
--   ele para de enxergar `sales`, `fechamentos` e a lista de usuários.
--   Nenhuma tela dele usa isso — faturamento e fechamento só aparecem
--   em Relatório (permissão `relatorio`, gerência) e no Jarvas
--   (regraDivergenciaCaixa, gerência); a lista de usuários só é lida em
--   Configurações (tela de admin). `pending` continua liberado para
--   todo logado (`pending_all_auth`), então a comanda do garçom não
--   muda em nada.
--
-- CORREÇÃO EXTRA NA MESMA LEVA (senão a Ponte quebra)
--   Com a RLS de `config` valendo de verdade pela primeira vez, o
--   caixa passa a ser barrado nas chaves que não são dele. Uma delas o
--   PDV grava sozinho: `ponte_endereco`. O desktop descobre o endereço
--   da Ponte na rede local e persiste (src/hooks/usePonteLocal.js, no
--   ciclo — "Endereço mudou (IP/token novo)? Grava em config"). Se o
--   caixa não puder gravar, o endereço congela no valor antigo e o
--   Palm do garçom perde a Ponte no dia em que o IP da casa mudar.
--   Então a chave entra na lista do caixa.
--
--   Ela NÃO é liberada para todo logado de propósito: `ponte_endereco`
--   é para onde o celular do garçom aponta quando cai a internet.
--   Quem escreve nela redireciona o Palm da casa inteira. Caixa para
--   cima, como o resto do balcão.
--
-- ⚠️  RLS NO PAINEL: esta migration é o passo que faltava. Depois de
--     rodar, confira em Supabase → Database → Tables que as seis
--     aparecem com "RLS enabled" (o SELECT do fim já responde isso).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Liga a RLS ────────────────────────────────────────────────────
-- ENABLE é idempotente no Postgres (rodar de novo em tabela já ligada
-- não dá erro), então a leva inteira pode ser repetida à vontade.
ALTER TABLE public.config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;

-- ── 2. Caixa também grava o endereço da Ponte ────────────────────────
-- Substitui a policy de 20260744 acrescentando `ponte_endereco`. As
-- chaves de gestão (meios_pagamento, taxa_servico, metodos_custom,
-- metodos_tef, dias_alerta_validade, limite_sangria, categorias_extra,
-- config_impressao, ponte_local_ativa) seguem só com gerente/admin.
DROP POLICY IF EXISTS "config_write_caixa_sessao" ON public.config;
CREATE POLICY "config_write_caixa_sessao" ON public.config FOR ALL
  USING  (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em', 'ponte_endereco')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em', 'ponte_endereco')
  );

-- ── 3. Conferência ───────────────────────────────────────────────────
-- `rls_ligada` tem que sair `true` nas seis linhas. Se sair `false` em
-- alguma, a RLS daquela tabela continua sendo enfeite.
SELECT
  c.relname                                  AS tabela,
  c.relrowsecurity                           AS rls_ligada,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname)           AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('config','fechamentos','pending','products','sales','users')
ORDER BY c.relname;


-- ══════════════════════════════════════════════════════════════════════
-- [08/25]  20260921_delivery_rate_limit_sem_telefone.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [08/25] 20260921_delivery_rate_limit_sem_telefone.sql'; END $aplicando$;

-- ════════════════════════════════════════════════════════════════════
-- 20260921 — rate-limit do delivery público: fechar o desvio do
--            "pedido sem telefone"
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (simulação de ataque, achado nº 2)
--   `criar_pedido_delivery` é chamada com a chave anon: qualquer pessoa
--   na internet cria pedido. O freio que existe é o trigger
--   `delivery_pedidos_rate_limit` (20260814, endurecido em 20260905):
--   no máximo 3 pedidos do MESMO telefone, no mesmo estabelecimento,
--   em 2 minutos.
--
--   Só que o telefone é o que o cliente digitou. A primeira linha do
--   trigger é:
--
--       IF v_tel IS NULL THEN RETURN NEW;   -- sem dígito, passa
--
--   Ou seja: mandar o pedido com o telefone em branco (ou só com
--   pontuação, "()-") pula o freio inteiro. Um script cria centenas de
--   pedidos seguidos, e cada um deles chega na Cozinha e no mini-painel
--   do estabelecimento. Não vaza dado nenhum — o estrago é operacional:
--   a tela de produção fica inutilizável no meio do serviço.
--
--   O desvio nem exige má-fé para aparecer: a tela pede
--   "Telefone (opcional)" (src/pages/delivery/CheckoutEntrega.jsx) e a
--   RPC nunca valida esse campo. O pedido sem telefone é um pedido
--   legítimo do produto.
--
-- POR QUE NÃO É SÓ "EXIGIR TELEFONE"
--   Passar a recusar pedido sem telefone fecharia o furo e quebraria um
--   fluxo que o produto oferece hoje na cara do cliente. Trocar um
--   problema de operação por um problema de venda é pior — e violaria o
--   Princípio nº 1: o cliente preencheria tudo, clicaria em "Finalizar"
--   e levaria um erro de um campo que a própria tela chamou de opcional.
--
--   Correlacionar por endereço também não resolve: mudar o número da
--   casa a cada requisição é tão barato quanto apagar o telefone.
--
-- CORREÇÃO
--   O balde sem telefone deixa de ser infinito e passa a ter teto
--   PRÓPRIO, por estabelecimento: 5 pedidos anônimos em 2 minutos.
--   A regra por telefone (3 em 2 minutos) continua igual para quem
--   preencheu.
--
--   O teto é do balde anônimo inteiro, não de um cliente — é a única
--   coisa que dá para contar quando não há identificador. 5 em 2
--   minutos é folgado para casa cheia (o pico real de uma casa média
--   fica bem abaixo disso, e quem digita telefone nem passa por essa
--   contagem) e curto o bastante para o script parar na quinta
--   requisição em vez de na quingentésima.
--
--   A mensagem de recusa é o único ponto em que o cliente honesto
--   encosta nisso, então ela não diz "limite excedido": diz o que
--   fazer para sair do balde compartilhado — digitar o telefone. Isso
--   também melhora o pedido (a casa passa a ter como avisar que saiu
--   para entrega).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (CREATE OR REPLACE — o trigger de 20260814 continua o mesmo e segue
-- apontando para esta função).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delivery_rate_limit_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel   text := NULLIF(regexp_replace(COALESCE(NEW.cliente_telefone, ''), '\D', '', 'g'), '');
  v_count integer;
BEGIN
  -- ── Sem telefone: teto do balde anônimo do estabelecimento ────────
  -- Não dá para separar um cliente do outro aqui, então o limite é do
  -- conjunto. Era exatamente por este caminho que o freio passava
  -- batido: antes, `v_tel IS NULL` devolvia NEW sem contar nada.
  IF v_tel IS NULL THEN
    SELECT count(*) INTO v_count
    FROM public.delivery_pedidos
    WHERE tenant_id = NEW.tenant_id
      AND created_at > now() - interval '2 minutes'
      AND NULLIF(regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g'), '') IS NULL;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Muitos pedidos sem telefone neste momento. Informe seu telefone para concluir o pedido agora.'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- ── Com telefone: 3 do mesmo número em 2 minutos ──────────────────
  -- Compara DÍGITOS dos dois lados. Antes o lado esquerdo era a coluna
  -- crua, então bastava mudar a máscara para ganhar um contador novo.
  SELECT count(*) INTO v_count
  FROM public.delivery_pedidos
  WHERE tenant_id = NEW.tenant_id
    AND created_at > now() - interval '2 minutes'
    AND regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g') = v_tel;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde um instante e tente de novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Conferência ──────────────────────────────────────────────────────
-- O trigger continua sendo o de 20260814; o que muda é o corpo da
-- função. Se o trigger tiver sumido, o freio não está no caminho.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'delivery_pedidos_rate_limit' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger delivery_pedidos_rate_limit ausente — rode 20260814 antes desta.';
  END IF;

  RAISE NOTICE 'Rate-limit do delivery: 3 por telefone e 5 sem telefone, por tenant, em 2 minutos.';
END;
$$;


-- ══════════════════════════════════════════════════════════════════════
-- [09/25]  20260921_indices_tenant_id.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [09/25] 20260921_indices_tenant_id.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Índices de tenant_id que faltavam — leitura rápida com muitos
-- estabelecimentos no mesmo banco
-- decisão 002 (multi-tenant por RLS) · decisão 017 (SaaS multi-estabelecimento)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Com RLS ligada, TODA consulta destas tabelas ganha um           │
-- │ `tenant_id = tenant_atual_id()` invisível, colado pelo Postgres │
-- │ antes de rodar. Sem índice em tenant_id, esse filtro só pode    │
-- │ ser resolvido lendo a tabela inteira e jogando fora as linhas   │
-- │ dos outros estabelecimentos.                                    │
-- │                                                                  │
-- │ Hoje isso não dói: são poucos estabelecimentos e tabelas        │
-- │ pequenas. A conta muda de forma quando o produto vende em       │
-- │ escala — a mesma tela que abre em 30ms com 3 estabelecimentos   │
-- │ passa a ler as linhas de 300 para mostrar as de 1. O custo de   │
-- │ criar o índice agora é zero; depois é um incidente.             │
-- │                                                                  │
-- │ A leva 20260724, que ligou o multi-tenant, já criou índice de   │
-- │ tenant_id nas tabelas do caminho quente (vendas, venda_itens,   │
-- │ products, clientes, delivery...). Estas nove ficaram de fora.   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- COMO A LISTA FOI ESCOLHIDA: cada índice abaixo corresponde a uma
-- consulta que existe no código hoje, com a ordenação que ela usa.
-- Índice que ninguém usa não é neutro — ele custa em todo INSERT e
-- UPDATE da tabela e ainda ocupa disco. Por isso ficaram DE FORA:
--
--   • subprodutos, combo_subprodutos, locais_impressao — nenhuma
--     consulta no front-end (a tela de Subprodutos saiu do produto);
--   • estoque_subprodutos, estoque_baixas_aplicadas — lidas só de
--     dentro de RPC, sempre pela chave primária (subproduto_id, op_id);
--   • assinaturas, config_delivery, tenant_fiscal_config — tenant_id
--     JÁ é a chave primária, que é um índice.
--
-- CUSTO DE RODAR: são tabelas pequenas (estoque, combos, notas fiscais
-- e unidades de medida têm dezenas a centenas de linhas por
-- estabelecimento). Cada CREATE INDEX leva milissegundos. A maior é
-- `vendas`; se um dia ela crescer a ponto de o bloqueio de escrita
-- incomodar, o mesmo comando aceita CREATE INDEX CONCURRENTLY, que não
-- trava — mas aí precisa rodar fora de transação, um comando por vez.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS.
-- Pode rodar duas vezes sem efeito colateral.
--
-- NÃO cria tabela nem função nova: nenhuma política de RLS precisa ser
-- mexida no painel do Supabase por causa desta migration.
-- ══════════════════════════════════════════════════════════════════

-- ── Estoque ────────────────────────────────────────────────────────
-- AppContext carrega o estoque inteiro do estabelecimento na abertura
-- do PDV (`select produto_id, quantidade, minimo`). É a consulta que
-- mais se repete no dia.
CREATE INDEX IF NOT EXISTS estoque_tenant_id_idx
  ON public.estoque (tenant_id);

-- Histórico de entradas por nota fiscal: cresce sem parar e só é lido
-- por estabelecimento.
CREATE INDEX IF NOT EXISTS estoque_entradas_tenant_id_idx
  ON public.estoque_entradas (tenant_id);

-- ── Fechamentos de caixa ───────────────────────────────────────────
-- Sempre "os fechamentos deste estabelecimento, do mais novo para o
-- mais velho". Composto porque a ordenação entra no índice: o Postgres
-- lê as primeiras linhas já na ordem certa, sem ordenar nada.
CREATE INDEX IF NOT EXISTS fechamentos_tenant_created_idx
  ON public.fechamentos (tenant_id, created_at DESC);

-- ── Notas fiscais de entrada ───────────────────────────────────────
-- Mesma forma: lista da aba Notas Fiscais, mais nova primeiro.
CREATE INDEX IF NOT EXISTS notas_fiscais_tenant_created_idx
  ON public.notas_fiscais (tenant_id, created_at DESC);

-- Os itens são lidos por nota (`eq nota_fiscal_id`) dentro do
-- estabelecimento. O composto atende os dois filtros de uma vez —
-- e é o único índice que essa tabela tem para nota_fiscal_id, já que
-- chave estrangeira no Postgres NÃO cria índice sozinha.
CREATE INDEX IF NOT EXISTS notas_fiscais_itens_tenant_nota_idx
  ON public.notas_fiscais_itens (tenant_id, nota_fiscal_id);

-- ── Combos ─────────────────────────────────────────────────────────
-- Tela de Combos (mais novo primeiro) e carga do PDV.
CREATE INDEX IF NOT EXISTS combos_tenant_created_idx
  ON public.combos (tenant_id, created_at DESC);

-- ── Configuração fiscal por item ───────────────────────────────────
-- A tela de Impostos carrega a configuração de todos os itens do
-- estabelecimento de uma vez.
CREATE INDEX IF NOT EXISTS itens_fiscal_tenant_id_idx
  ON public.itens_fiscal (tenant_id);

-- ── Unidades de medida ─────────────────────────────────────────────
-- Tabela pequena, mas lida em sete lugares (cadastro de produto,
-- configurações, importação): é a consulta de apoio mais frequente.
CREATE INDEX IF NOT EXISTS unidades_medida_tenant_id_idx
  ON public.unidades_medida (tenant_id);

-- ── Vendas: trocar o índice simples pelo composto ──────────────────
-- `vendas` já tinha índice em tenant_id e outro em `at DESC`, mas
-- nenhum dos dois serve a consulta real, que é "as vendas DESTE
-- estabelecimento, da mais recente para a mais antiga". Com os dois
-- separados o banco filtra por um e ordena o resto na memória.
--
-- O composto (tenant_id, at DESC) resolve filtro e ordenação juntos e
-- torna `vendas_tenant_id_idx` redundante — um índice cujo prefixo é
-- outro índice só custa escrita. Por isso ele sai.
--
-- `vendas_at_idx` (só `at DESC`) FICA: o Console da plataforma soma
-- vendas de todos os estabelecimentos por período, e aí o filtro é só
-- a data (analytics_plataforma, 20260912).
CREATE INDEX IF NOT EXISTS vendas_tenant_at_idx
  ON public.vendas (tenant_id, at DESC);

DROP INDEX IF EXISTS public.vendas_tenant_id_idx;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_esperados text[] := ARRAY[
    'estoque_tenant_id_idx',
    'estoque_entradas_tenant_id_idx',
    'fechamentos_tenant_created_idx',
    'notas_fiscais_tenant_created_idx',
    'notas_fiscais_itens_tenant_nota_idx',
    'combos_tenant_created_idx',
    'itens_fiscal_tenant_id_idx',
    'unidades_medida_tenant_id_idx',
    'vendas_tenant_at_idx'
  ];
  v_nome    text;
  v_criados integer := 0;
BEGIN
  FOREACH v_nome IN ARRAY v_esperados LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = v_nome
    ) THEN
      RAISE EXCEPTION 'Índice % não foi criado.', v_nome;
    END IF;
    v_criados := v_criados + 1;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'vendas_tenant_id_idx'
  ) THEN
    RAISE EXCEPTION 'vendas_tenant_id_idx deveria ter sido removido (o composto vendas_tenant_at_idx o substitui).';
  END IF;

  RAISE NOTICE '% índices de tenant_id conferidos. Consulta por estabelecimento não lê mais a tabela inteira.', v_criados;
END $conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [10/25]  20260922_fiscal_config_leitura_por_papel.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [10/25] 20260922_fiscal_config_leitura_por_papel.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- NFC-e — leitura da configuração fiscal POR PAPEL (correção)
-- Fecha vazamento da identidade fiscal do estabelecimento para
-- qualquer conta autenticada do tenant (inclusive o garçom).
--
-- O QUE ESTAVA ABERTO
-- A policy de leitura criada em 20260731_tenant_fiscal_config.sql era:
--
--     USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin())
--
-- Isso isola o TENANT (ninguém lê a config fiscal de outro
-- estabelecimento — isso continua valendo), mas NÃO isola o PAPEL: no
-- próprio tenant, qualquer JWT autenticado lê a linha inteira. Um
-- garçom com o app aberto — ou qualquer um com a chave anon e uma
-- sessão de garçom — pega CNPJ, inscrição estadual, inscrição
-- municipal, razão social, nome fantasia, endereço completo do
-- emitente, regime tributário, série, ambiente e o csc_id.
--
-- Nada disso é o SEGREDO fiscal (o certificado A1 e o VALOR do CSC
-- nunca entraram nesta tabela — a fronteira de segredo de 20260731
-- continua correta e intacta). Mas é o dossiê fiscal do
-- estabelecimento em uma linha só, e o app não tem nenhuma tela que
-- mostre isso para o garçom: é vazamento puro, sem contrapartida de
-- uso. Em SaaS multi-estabelecimento (decisão 017), esse conjunto é
-- exatamente o que alguém precisa para se passar pelo emitente.
--
-- QUEM PRECISA MESMO LER (e por isso fica)
--   • admin    — configura o fiscal (PainelFiscal, permissão
--                `configuracoes`).
--   • gerente  — histórico de notas (HistoricoNfce, permissão
--                `relatorio`, que chama buscarEmitenteFiscal).
--   • caixa    — NÃO tem tela, mas EMITE: emitir-nfce e reenviar-nfce
--                leem esta tabela com o JWT DE QUEM CHAMOU.
--
-- ┌─ CORREÇÃO DE UMA NOTA ERRADA ────────────────────────────────────┐
-- │ O rodapé de 20260731 diz:                                        │
-- │   "a emissão em si (Leva 3) roda na Edge Function com            │
-- │    service_role, que ignora RLS — estas policies protegem a      │
-- │    TELA de configuração no app, não o caminho de emissão."       │
-- │                                                                  │
-- │ Isso é FALSO no código que existe hoje. As quatro funções        │
-- │ fiscais (emitir-nfce, reenviar-nfce, cancelar-nfce,              │
-- │ inutilizar-nfce) montam o cliente com SUPABASE_ANON_KEY +        │
-- │ o header Authorization do chamador, de propósito, para que a RLS │
-- │ resolva o tenant. Ou seja: esta policy É o caminho de emissão.   │
-- │ Apertar demais aqui QUEBRA a emissão no caixa — por isso `caixa` │
-- │ entra na lista, mesmo sem tela.                                  │
-- └──────────────────────────────────────────────────────────────────┘
--
-- POR QUE NÃO SÓ `admin`
-- Seria mais apertado e quebraria dois fluxos reais: o caixa pararia
-- de emitir cupom no meio da venda (412 "Estabelecimento sem
-- configuração fiscal", com o cliente esperando na frente) e o gerente
-- perderia o emitente no histórico de notas. Este é o menor conjunto
-- que mantém o produto funcionando.
--
-- ESCRITA: sem mudança. Continua só o admin do próprio tenant
-- (fiscal_config_write_admin, de 20260731) — este arquivo não toca nela.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- ── Leitura: papéis que realmente usam + super-admin (Console) ─────
DROP POLICY IF EXISTS "fiscal_config_select" ON public.tenant_fiscal_config;
CREATE POLICY "fiscal_config_select" ON public.tenant_fiscal_config
  FOR SELECT
  USING (
    (
      (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin')
      AND tenant_id = public.tenant_atual_id()
    )
    OR public.is_super_admin()
  );

-- ── Verificação ────────────────────────────────────────────────────
-- Esperado: fiscal_config_select com a lista de papéis no USING, e
-- fiscal_config_write_admin intacta.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tenant_fiscal_config'
ORDER BY policyname;


-- ══════════════════════════════════════════════════════════════════════
-- [11/25]  20260922_gravar_itens_comanda.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [11/25] 20260922_gravar_itens_comanda.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- TD013 — gravação atômica dos itens da comanda
-- docs/09_BACKLOG/tech-debt.md (TD013) · src/lib/comandaItens.js
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ `pending.items` é um jsonb gravado INTEIRO a cada lançamento.   │
-- │ Para não perder o item que outro aparelho lançou no meio do     │
-- │ caminho, o app hoje faz três passos separados:                  │
-- │                                                                  │
-- │   1. lê os itens que estão no banco                             │
-- │   2. mescla com a lista que ele quer gravar                     │
-- │   3. grava a lista mesclada                                     │
-- │                                                                  │
-- │ Entre o passo 1 e o passo 3 existe uma janela de rede — dezenas │
-- │ a centenas de milissegundos. Se o Palm do garçom gravar dentro  │
-- │ dessa janela, o PDV grava por cima com uma lista que já nasceu  │
-- │ velha, e a cerveja lançada some da conta. Não é hipótese de     │
-- │ laboratório: é exatamente o horário de pico, com duas pessoas   │
-- │ lançando na mesma mesa.                                         │
-- │                                                                  │
-- │ A correção é fazer os três passos DENTRO do banco, na mesma     │
-- │ transação, com a linha travada. Aí não existe mais "meio do     │
-- │ caminho": quem chegar em segundo espera e mescla em cima do     │
-- │ resultado de quem chegou em primeiro.                           │
-- └───────────────────────────────────────────────────────────────────┘
--
-- A REGRA DE MESCLA É A MESMA DO APP (src/lib/comandaItens.js), portada
-- para SQL sem mudança de comportamento:
--   • cada item carrega um `uid` estável, criado na primeira gravação;
--   • `conhecidos` = uids do snapshot de onde o chamador partiu (p_base_uids)
--     + uids da lista que ele quer gravar (p_items);
--   • item que está no banco com uid FORA de `conhecidos` foi lançado por
--     outro aparelho → é preservado no fim da lista;
--   • item sem uid (legado, gravado antes desta regra) não tem identidade
--     para ser reconhecido e segue a cargo do snapshot do chamador.
--
-- SECURITY INVOKER, DE PROPÓSITO — é a exceção ao padrão das outras RPCs
-- deste projeto, que são SECURITY DEFINER. Aqui a função não precisa de
-- privilégio nenhum além do que o próprio usuário já tem: ela mexe em
-- `pending`, cuja RLS (pending_all_auth + pending_tenant_isolation) já
-- isola por estabelecimento e por papel. Rodando como o chamador, esse
-- isolamento continua valendo palavra por palavra — se a comanda for de
-- outro estabelecimento, o SELECT abaixo simplesmente não a enxerga e a
-- função devolve NULL. Fosse SECURITY DEFINER, a RLS seria contornada e
-- eu teria de reescrever o isolamento aqui dentro, à mão, para ganhar
-- nada.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: esta migration NÃO cria tabela nem coluna. Ela cria UMA função
--    e, como toda função nova no Supabase, ela nasce executável por
--    PUBLIC (o que inclui a role `anon`, de visitante sem login). Os
--    REVOKE/GRANT do fim do arquivo corrigem isso — confira no painel
--    (Database → Functions) que só `authenticated` tem EXECUTE.
--
-- COMPATIBILIDADE: o app funciona com e sem esta migration. Enquanto ela
-- não roda, a chamada volta com "função não existe" (PGRST202/42883), o
-- app registra isso uma vez e passa a usar o caminho antigo (ler-mesclar-
-- gravar) pelo resto da sessão. Ou seja: dá para publicar o front-end
-- antes de rodar isto aqui, sem quebrar o PDV — só sem o ganho.
--
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT re-aplicáveis.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gravar_itens_comanda(
  p_id        text,
  p_items     jsonb,
  p_base_uids text[]  DEFAULT NULL,
  p_total     numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_banco      jsonb;
  v_conhecidos text[];
  v_remotos    jsonb := '[]'::jsonb;
  v_items      jsonb;
  v_total      numeric;
BEGIN
  -- Validação de entrada: id vazio faria a trava não pegar linha nenhuma
  -- e a gravação virar um no-op silencioso.
  IF p_id IS NULL OR btrim(p_id) = '' THEN
    RAISE EXCEPTION 'gravar_itens_comanda: id da comanda é obrigatório.'
      USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'gravar_itens_comanda: items precisa ser uma lista JSON.'
      USING ERRCODE = '22023';
  END IF;

  -- ── O coração da correção ────────────────────────────────────────
  -- FOR UPDATE trava ESTA linha até o fim da transação (que aqui é a
  -- própria chamada da função). Outra gravação na mesma comanda para
  -- nesta linha e espera; quando prosseguir, vai ler o resultado já
  -- gravado — não a versão velha. É isto que fecha a janela.
  SELECT p.items INTO v_banco
    FROM public.pending p
   WHERE p.id = p_id
     FOR UPDATE;

  -- Comanda que não existe (ou é de outro estabelecimento, pela RLS):
  -- devolve NULL e não grava nada. Mesmo desfecho do UPDATE de hoje,
  -- que simplesmente não acha linha para atualizar.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_base_uids IS NULL THEN
    -- Sem snapshot não há como distinguir "item de outro aparelho" de
    -- "item que este aparelho removeu de propósito". O chamador manda a
    -- lista fechada e ela vale — igual ao app quando não recebe baseItems.
    v_items := p_items;
  ELSE
    -- array_remove tira NULL: um NULL dentro do array faria `= ANY(...)`
    -- devolver NULL em vez de false e o item remoto seria descartado em
    -- silêncio — o oposto do que esta função existe para fazer.
    SELECT array_remove(p_base_uids, NULL)
           || COALESCE(array_agg(e->>'uid') FILTER (WHERE e->>'uid' IS NOT NULL), '{}'::text[])
      INTO v_conhecidos
      FROM jsonb_array_elements(p_items) AS e;

    SELECT COALESCE(jsonb_agg(t.e ORDER BY t.ord), '[]'::jsonb)
      INTO v_remotos
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_banco) = 'array' THEN v_banco ELSE '[]'::jsonb END
           ) WITH ORDINALITY AS t(e, ord)
     WHERE t.e->>'uid' IS NOT NULL
       AND NOT (t.e->>'uid' = ANY (v_conhecidos));

    v_items := CASE
                 WHEN jsonb_array_length(v_remotos) > 0 THEN p_items || v_remotos
                 ELSE p_items
               END;
  END IF;

  -- Total: quem chama já mandou o dele calculado. Ele só é refeito aqui
  -- quando a mescla trouxe item de volta — senão a conta fecharia sem o
  -- item que acabou de ser recuperado. Mesma regra de totalItensAtivos:
  -- soma preço × quantidade dos itens NÃO cancelados, com duas casas.
  IF p_total IS NULL THEN
    v_total := NULL;
  ELSIF jsonb_array_length(v_remotos) > 0 THEN
    SELECT round(COALESCE(sum(
             COALESCE(NULLIF(e->>'price', '')::numeric, 0)
             * COALESCE(NULLIF(e->>'qty', '')::numeric, 1)
           ), 0), 2)
      INTO v_total
      FROM jsonb_array_elements(v_items) AS e
     WHERE COALESCE((e->>'cancelado')::boolean, false) = false;
  ELSE
    v_total := p_total;
  END IF;

  UPDATE public.pending p
     SET items      = v_items,
         -- p_total ausente = "não mexa no total" (o chamador só mudou itens).
         total      = CASE WHEN p_total IS NULL THEN p.total ELSE v_total END,
         updated_at = now()
   WHERE p.id = p_id;

  -- Devolve o que ficou gravado para a tela do chamador refletir a mescla
  -- na hora, sem depender de o Realtime chegar.
  RETURN jsonb_build_object(
    'items',        v_items,
    'total',        CASE WHEN p_total IS NULL THEN NULL ELSE v_total END,
    'houve_mescla', jsonb_array_length(v_remotos) > 0
  );
END
$fn$;

-- REVOKE antes do GRANT: função nova nasce executável por PUBLIC, e PUBLIC
-- inclui `anon` (visitante sem login). Comanda é dado de operação.
REVOKE EXECUTE ON FUNCTION public.gravar_itens_comanda(text, jsonb, text[], numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gravar_itens_comanda(text, jsonb, text[], numeric)
  TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste — falha alto se a função não ficou como o app espera.
-- Roda a mescla de verdade numa comanda descartável e desfaz tudo.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_id       text := 'autoteste-td013-' || gen_random_uuid()::text;
  v_tenant   uuid;
  v_ret      jsonb;
  v_gravado  jsonb;
  v_total    numeric;
BEGIN
  -- 1. Existe, é INVOKER e não é alcançável por anon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gravar_itens_comanda'
  ) THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda não foi criada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'gravar_itens_comanda'
       AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda está SECURITY DEFINER — ela precisa rodar sob a RLS de quem chama.';
  END IF;

  IF has_function_privilege('anon', 'public.gravar_itens_comanda(text, jsonb, text[], numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: gravar_itens_comanda continua executável por anon.';
  END IF;

  -- Tenant da comanda descartável, escolhido À MÃO de propósito: o DEFAULT
  -- de pending.tenant_id é tenant_atual_id(), que lê o tenant do JWT de
  -- quem chama. No app existe usuário logado e ele resolve; aqui, rodando
  -- no SQL Editor, não há sessão nenhuma e ele volta NULL — a coluna é NOT
  -- NULL e o autoteste morria antes de testar coisa alguma.
  SELECT id INTO v_tenant FROM public.tenants ORDER BY created_at LIMIT 1;

  -- Banco ainda sem nenhum estabelecimento: as conferências de estrutura
  -- acima já passaram, e não há em que tenant pendurar a comanda de teste.
  -- Avisa e sai — melhor pular a parte de comportamento do que inventar um
  -- tenant só para o teste rodar.
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'gravar_itens_comanda criada e conferida na estrutura. A parte de comportamento foi pulada: não há nenhum tenant cadastrado para receber a comanda descartável.';
    RETURN;
  END IF;

  -- 2. Mescla de verdade. A comanda tem A e B; o chamador partiu de A e
  --    quer gravar só A — B foi lançado por outro aparelho e tem de voltar.
  INSERT INTO public.pending (id, tenant_id, comanda, items, total)
  VALUES (
    v_id, v_tenant, 'AUTOTESTE',
    '[{"uid":"a","name":"A","price":10,"qty":1},
      {"uid":"b","name":"B","price":5,"qty":2}]'::jsonb,
    20
  );

  v_ret := public.gravar_itens_comanda(
    v_id,
    '[{"uid":"a","name":"A","price":10,"qty":1}]'::jsonb,
    ARRAY['a'],
    10
  );

  SELECT p.items, p.total INTO v_gravado, v_total
    FROM public.pending p WHERE p.id = v_id;

  IF jsonb_array_length(v_gravado) <> 2 THEN
    RAISE EXCEPTION 'FALHA: o item lançado pelo outro aparelho foi perdido (ficaram % itens).',
      jsonb_array_length(v_gravado);
  END IF;
  IF v_gravado -> 1 ->> 'uid' <> 'b' THEN
    RAISE EXCEPTION 'FALHA: o item recuperado deveria ser o "b", veio %.', v_gravado -> 1 ->> 'uid';
  END IF;
  IF v_total <> 20 THEN
    RAISE EXCEPTION 'FALHA: total deveria ter sido refeito para 20 (10 + 5×2), veio %.', v_total;
  END IF;
  IF (v_ret ->> 'houve_mescla')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHA: a função não avisou o app de que houve mescla.';
  END IF;

  -- 3. Sem nada remoto, grava o que o chamador mandou e mantém o total dele.
  v_ret := public.gravar_itens_comanda(
    v_id,
    '[{"uid":"a","name":"A","price":10,"qty":1},{"uid":"b","name":"B","price":5,"qty":2}]'::jsonb,
    ARRAY['a', 'b'],
    99
  );
  SELECT p.total INTO v_total FROM public.pending p WHERE p.id = v_id;
  IF v_total <> 99 THEN
    RAISE EXCEPTION 'FALHA: sem mescla o total do chamador deveria ter sido respeitado (99), veio %.', v_total;
  END IF;
  IF (v_ret ->> 'houve_mescla')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHA: a função avisou mescla onde não houve.';
  END IF;

  -- 4. Comanda inexistente devolve NULL em vez de erro (mesmo desfecho do
  --    UPDATE de hoje, que não acha linha para atualizar).
  IF public.gravar_itens_comanda('nao-existe-' || v_id, '[]'::jsonb, ARRAY[]::text[], 0) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: comanda inexistente deveria devolver NULL.';
  END IF;

  DELETE FROM public.pending WHERE id = v_id;

  RAISE NOTICE 'gravar_itens_comanda conferida: item lançado por outro aparelho não se perde mais na janela entre ler e gravar.';
END $conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [12/25]  20260923_combo_produtos_isolamento_tenant.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [12/25] 20260923_combo_produtos_isolamento_tenant.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- combo_produtos — fecha a policy permissiva e firma o isolamento
--
-- Tira a última `allow_all_%` viva do schema e alinha combo_produtos
-- às suas duas irmãs (combos e combo_subprodutos), que já são
-- select_auth + write_gerente_admin desde 20240108.
--
-- COMO A BRECHA APARECEU (não foi descuido, foi ordem de arquivo)
-- 20240107_rls_por_role.sql abre com um laço que apaga toda policy
-- chamada `allow_all_%`:
--
--     FOR r IN SELECT policyname, tablename FROM pg_policies
--       WHERE schemaname = 'public' AND policyname LIKE 'allow_all_%'
--     LOOP EXECUTE format('DROP POLICY IF EXISTS ...') END LOOP;
--
-- Esse laço rodou UMA vez, em 2024, e limpou o que existia até ali —
-- inclusive allow_all_combos e allow_all_combo_subprodutos, que em
-- seguida ganharam policy por papel. combo_produtos nasceu depois, em
-- 20260726, recriando `allow_all_combo_produtos` (FOR ALL USING (true)
-- WITH CHECK (true)) porque copiou o padrão de 20240104 — o padrão
-- antigo, o que a 20240107 tinha acabado de aposentar. A limpeza já
-- tinha passado; a policy permissiva ficou.
--
-- O QUE ISSO PERMITE HOJE
-- Qualquer sessão autenticada — garçom, caixa — pode inserir, alterar
-- e apagar linhas de combo_produtos direto pela chave anon. Na prática:
-- montar ou desmontar a composição de um combo sem passar pela tela de
-- Cardápio (que é gerência), e portanto sem log de atividade nenhum. O
-- efeito é comercial e silencioso: o combo passa a sair com produto a
-- mais, ou sem o produto que justificava o preço, e o PDV obedece —
-- ProductGrid.jsx:169 e PDVView/index.jsx:156 leem essa junção para
-- montar o que vai para a comanda.
--
-- O tenant continuava isolado o tempo todo (a RESTRICTIVE
-- combo_produtos_tenant_isolation soma AND a qualquer permissiva), então
-- nunca houve vazamento entre estabelecimentos. O furo é DENTRO do
-- estabelecimento: papel, não tenant.
--
-- ┌─ POR QUE `select_auth` E NÃO ALGO MAIS APERTADO ─────────────────┐
-- │ O PDV inteiro lê combo_produtos para montar o combo na venda, e   │
-- │ quem opera o PDV é caixa e garçom. Leitura para qualquer          │
-- │ autenticado é o mesmo que combos e combo_subprodutos já fazem —   │
-- │ e é o que mantém o combo funcionando na tela do garçom.           │
-- │                                                                   │
-- │ O cardápio público do delivery NÃO depende disto: cardapio_publico│
-- │ e combo_indisponivel são SECURITY DEFINER (20260907) e passam por  │
-- │ cima da RLS. O anônimo continua vendo o combo normalmente.        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Escrita: gerente e admin, como em combos/combo_subprodutos. Ninguém
-- perde acesso de verdade — quem não é gerência já era barrado na
-- tabela `combos` no mesmo fluxo de CombosView.jsx.
--
-- O bloco de tenant abaixo era CONDICIONAL em 20260726 (`IF
-- to_regprocedure('public.tenant_atual_id()') IS NOT NULL`), porque
-- naquele momento não dava para garantir que a leva multitenant já
-- tivesse rodado. Hoje dá: o helper existe. Aqui ele vira
-- incondicional, e a migration falha alto se o helper sumir — melhor
-- quebrar na hora de rodar do que criar a tabela sem isolamento e
-- descobrir depois.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE, ADD COLUMN IF NOT EXISTS.
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Fora a permissiva ───────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_combo_produtos" ON public.combo_produtos;

-- ── 2. Policies por papel (espelho de combo_subprodutos) ───────────
DROP POLICY IF EXISTS "combo_produtos_select_auth" ON public.combo_produtos;
CREATE POLICY "combo_produtos_select_auth" ON public.combo_produtos
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "combo_produtos_write_gerente_admin" ON public.combo_produtos;
CREATE POLICY "combo_produtos_write_gerente_admin" ON public.combo_produtos
  FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- ── 3. Isolamento por tenant, agora sem condicional ────────────────
DO $$
BEGIN
  IF to_regprocedure('public.tenant_atual_id()') IS NULL THEN
    RAISE EXCEPTION 'public.tenant_atual_id() ausente — rode a leva multitenant (20260724) antes desta.';
  END IF;

  ALTER TABLE public.combo_produtos
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

  UPDATE public.combo_produtos
     SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
   WHERE tenant_id IS NULL;

  ALTER TABLE public.combo_produtos ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
  ALTER TABLE public.combo_produtos ALTER COLUMN tenant_id SET NOT NULL;
END $$;

DROP POLICY IF EXISTS combo_produtos_tenant_isolation ON public.combo_produtos;
CREATE POLICY combo_produtos_tenant_isolation ON public.combo_produtos
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

CREATE INDEX IF NOT EXISTS combo_produtos_tenant_id_idx ON public.combo_produtos (tenant_id);

-- ── Verificação ────────────────────────────────────────────────────
-- Esperado: allow_all_combo_produtos ausente; select_auth, write_gerente_admin
-- e tenant_isolation (RESTRICTIVE = permissive 'f') presentes.
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'combo_produtos'
ORDER BY policyname;


-- ══════════════════════════════════════════════════════════════════════
-- [13/25]  20260923_dinheiro_precisao.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [13/25] 20260923_dinheiro_precisao.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Dinheiro com precisão declarada — numeric(12,2) nas colunas de valor
-- A8 da revisão de 2026-08-23
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ `numeric` sem precisão no Postgres aceita QUALQUER número de    │
-- │ casas decimais. Uma conta que devolva 10.004999999 é gravada    │
-- │ inteira, e o banco passa a guardar um valor que não existe em   │
-- │ dinheiro. Ninguém vê: a tela mostra R$ 10,00 (o `toFixed(2)`    │
-- │ arredonda na hora de exibir) e o relatório soma o número        │
-- │ comprido. Aí o fechamento do dia fecha com um centavo de        │
-- │ diferença que não bate com nenhum lançamento — e a conferência  │
-- │ vira caça ao fantasma.                                          │
-- │                                                                  │
-- │ Hoje o front-end já arredonda antes de gravar (round2, em       │
-- │ src/lib/vendas.js). Isso resolve o caminho que passa pelo app.  │
-- │ Não resolve: importação de XML, RPC que soma dentro do banco,   │
-- │ correção feita à mão no painel, integração futura. A precisão   │
-- │ na coluna é a única garantia que vale para todos eles ao mesmo  │
-- │ tempo — o banco arredonda na gravação e acabou a conversa.      │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ O QUE **NÃO** MUDA, E POR QUÊ ─────────────────────────────────┐
-- │ Nem todo `numeric` é dinheiro. Forçar 2 casas nestes destruiria │
-- │ dado de verdade, então ficam como estão:                        │
-- │                                                                  │
-- │  • QUANTIDADES — estoque.quantidade, estoque.minimo,            │
-- │    estoque_subprodutos.*, estoque_baixas_aplicadas.qtd,         │
-- │    venda_itens.qtd, notas_fiscais_itens.quantidade e            │
-- │    quantidade_estoque, estoque_entradas.quantidade,             │
-- │    products.fator_consumo_estoque, notas_fiscais_itens          │
-- │    .fator_conversao. Meio quilo de queijo é 0.5; um fator de    │
-- │    conversão de grama para quilo é 0.001. Duas casas zeraria.   │
-- │                                                                  │
-- │  • ALÍQUOTAS de itens_fiscal (aliquota_icms, ipi, pis, cofins,  │
-- │    ibs, cbs, is, e reducao_base_icms) — são percentuais, e a    │
-- │    legislação usa quatro casas (ex.: 1.6500%).                  │
-- │                                                                  │
-- │  • COORDENADAS — config_delivery.origem_lat/origem_lng e        │
-- │    delivery_pedidos.entrega_lat/entrega_lng. Latitude com duas  │
-- │    casas erra a posição em mais de um quilômetro: -23.55 e      │
-- │    -23.5558 são bairros diferentes. Isso quebraria o cálculo    │
-- │    de distância da taxa de entrega.                             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ CUSTO UNITÁRIO É EXCEÇÃO: numeric(18,10) ──────────────────────┐
-- │ notas_fiscais_itens.preco_unitario e estoque_entradas           │
-- │ .preco_unitario NÃO são preço de venda, são custo por unidade   │
-- │ — e custo por unidade tem fração de centavo legítima:           │
-- │                                                                  │
-- │  • o XML da NF-e traz vUnCom com até 10 casas decimais;         │
-- │  • a entrada de estoque divide o preço pelo fator de conversão  │
-- │    (NotasFiscaisTab.jsx), então um saco de 1 kg a R$ 25,00 vira │
-- │    R$ 0,025 por grama. Arredondado para R$ 0,03, o custo do     │
-- │    insumo sobe 20% e o CMV sai errado.                          │
-- │                                                                  │
-- │ Estas duas ganham numeric(18,10): continua havendo um teto      │
-- │ declarado (nada de número com 40 casas vindo de importação      │
-- │ estranha), sem perder a fração que o custo precisa.             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- CUSTO DE RODAR: ALTER TYPE reescreve a tabela e segura um bloqueio
-- exclusivo enquanto reescreve. Nas tabelas grandes (vendas,
-- venda_itens, venda_pagamentos) isso são segundos com o volume de
-- hoje. Rode fora do horário de pico do salão mesmo assim — durante a
-- reescrita, gravar comanda e fechar venda ficam esperando.
--
-- IDEMPOTENTE: cada coluna só é alterada se ainda não estiver no tipo
-- alvo, então rodar de novo não reescreve nada.
--
-- SEM MUDANÇA DE COMPORTAMENTO NO APP: o cliente Supabase entrega
-- numeric como string/number igual antes; quem já gravava valor
-- arredondado continua gravando o mesmo valor.
-- ══════════════════════════════════════════════════════════════════

DO $ajuste$
DECLARE
  v_alvo    record;
  v_prec    integer;
  v_esc     integer;
  v_ruins   bigint;
  v_teto    numeric;
  v_piso    numeric;
  v_mudadas integer := 0;
BEGIN
  -- A lista mora numa temporária porque é lida três vezes aqui dentro
  -- (conferência antes, alteração, contagem). Some ao fim do bloco.
  CREATE TEMP TABLE _alvo_dinheiro (
    tabela    text,
    coluna    text,
    precisao  integer,
    escala    integer
  );

  INSERT INTO _alvo_dinheiro (tabela, coluna, precisao, escala) VALUES
    -- billing da plataforma
    ('assinaturas',            'valor_mensal',       12, 2),
    ('assinaturas_pagamentos', 'valor',              12, 2),
    -- catálogo e comanda
    ('products',               'price',              12, 2),
    ('pending',                'total',              12, 2),
    -- venda normalizada (TD009)
    ('vendas',                 'subtotal',           12, 2),
    ('vendas',                 'valor_taxa',         12, 2),
    ('vendas',                 'valor_ajuste',       12, 2),
    ('vendas',                 'total',              12, 2),
    ('venda_itens',            'preco',              12, 2),
    ('venda_pagamentos',       'valor',              12, 2),
    -- financeiro e caixa
    ('lancamentos',            'valor',              12, 2),
    ('caixa_movimentos',       'valor',              12, 2),
    -- notas fiscais de entrada
    ('notas_fiscais',          'valor_total',        12, 2),
    ('notas_fiscais_itens',    'preco_total',        12, 2),
    -- combos e subprodutos
    ('subprodutos',            'preco',              12, 2),
    ('combos',                 'preco_total',        12, 2),
    ('combo_subprodutos',      'preco_customizado',  12, 2),
    -- delivery
    ('config_delivery',        'pedido_minimo',      12, 2),
    ('delivery_entregadores',  'valor_por_entrega',  12, 2),
    ('delivery_pedidos',       'subtotal',           12, 2),
    ('delivery_pedidos',       'taxa_entrega',       12, 2),
    ('delivery_pedidos',       'total',              12, 2),
    ('delivery_pedidos',       'troco_para',         12, 2),
    ('delivery_pedidos',       'valor_entregador',   12, 2),
    ('delivery_pedido_itens',  'preco_unit',         12, 2),
    ('complementos',           'preco',              12, 2),
    -- custo por unidade: fração de centavo é legítima (ver cabeçalho)
    ('notas_fiscais_itens',    'preco_unitario',     18, 10),
    ('estoque_entradas',       'preco_unitario',     18, 10);

  -- ── 1. Conferência ANTES de alterar ────────────────────────────
  -- ALTER TYPE arredonda em silêncio. Em 99,9% dos casos é o que se
  -- quer (10.004999 vira 10.00). Dois casos NÃO são, e é melhor parar
  -- aqui com uma mensagem legível do que descobrir depois:
  --   • valor grande demais para a precisão → o Postgres aborta com
  --     "numeric field overflow", sem dizer qual coluna;
  --   • valor pequeno e não-zero que arredonda para zero → some, e em
  --     lancamentos.valor e caixa_movimentos.valor ainda esbarra no
  --     CHECK (valor > 0), abortando com erro de constraint.
  FOR v_alvo IN SELECT * FROM _alvo_dinheiro LOOP
    IF to_regclass('public.' || quote_ident(v_alvo.tabela)) IS NULL THEN
      RAISE EXCEPTION 'FALHA: a tabela public.% não existe neste banco. Rode as migrations anteriores antes desta.', v_alvo.tabela;
    END IF;

    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = v_alvo.tabela
       AND c.column_name  = v_alvo.coluna;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FALHA: a coluna public.%.% não existe neste banco. Rode as migrations anteriores antes desta.', v_alvo.tabela, v_alvo.coluna;
    END IF;

    v_teto := power(10::numeric, v_alvo.precisao - v_alvo.escala);
    v_piso := power(10::numeric, -v_alvo.escala) / 2;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND abs(%I) >= %L',
      v_alvo.tabela, v_alvo.coluna, v_alvo.coluna, v_teto
    ) INTO v_ruins;
    IF v_ruins > 0 THEN
      RAISE EXCEPTION 'FALHA: % linha(s) em public.%.% têm valor >= % e não cabem em numeric(%,%). Confira esses registros antes de rodar.',
        v_ruins, v_alvo.tabela, v_alvo.coluna, v_teto, v_alvo.precisao, v_alvo.escala;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE %I IS NOT NULL AND %I <> 0 AND abs(%I) < %L',
      v_alvo.tabela, v_alvo.coluna, v_alvo.coluna, v_alvo.coluna, v_piso
    ) INTO v_ruins;
    IF v_ruins > 0 THEN
      RAISE EXCEPTION 'FALHA: % linha(s) em public.%.% têm valor diferente de zero mas menor que % — virariam zero ao arredondar. Confira esses registros antes de rodar.',
        v_ruins, v_alvo.tabela, v_alvo.coluna, v_piso;
    END IF;
  END LOOP;

  -- ── 2. Alteração ───────────────────────────────────────────────
  FOR v_alvo IN SELECT * FROM _alvo_dinheiro LOOP
    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = v_alvo.tabela
       AND c.column_name  = v_alvo.coluna;

    IF v_prec IS DISTINCT FROM v_alvo.precisao OR v_esc IS DISTINCT FROM v_alvo.escala THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(%s,%s)',
        v_alvo.tabela, v_alvo.coluna, v_alvo.precisao, v_alvo.escala
      );
      v_mudadas := v_mudadas + 1;
      RAISE NOTICE 'public.%.% agora é numeric(%,%)', v_alvo.tabela, v_alvo.coluna, v_alvo.precisao, v_alvo.escala;
    END IF;
  END LOOP;

  RAISE NOTICE '% de % coluna(s) alterada(s); o resto já estava no tipo certo.',
    v_mudadas, (SELECT count(*) FROM _alvo_dinheiro);

  DROP TABLE _alvo_dinheiro;
END $ajuste$;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
--
-- Em vez de reconferir a mesma lista de cima (que só provaria que a
-- lista é igual a ela mesma), a busca aqui é pelo defeito: QUALQUER
-- coluna numérica com cara de dinheiro que ainda esteja sem precisão.
-- Isso pega também a coluna que alguém criar amanhã e esquecer.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_soltas text;
  v_prec   integer;
  v_esc    integer;
  v_nome   text;
BEGIN
  SELECT string_agg(format('%s.%s', c.table_name, c.column_name), ', ' ORDER BY c.table_name, c.column_name)
    INTO v_soltas
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public'
     AND c.data_type = 'numeric'
     AND c.numeric_scale IS NULL
     AND c.column_name ~ '^(price|preco|valor|subtotal|total|taxa_entrega|troco_para|pedido_minimo)';

  IF v_soltas IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) de dinheiro ainda sem precisão declarada: %', v_soltas;
  END IF;

  -- Custo por unidade tem de manter as 10 casas — se caiu para 2, o
  -- CMV de insumo vendido a fração de centavo passa a sair errado.
  FOREACH v_nome IN ARRAY ARRAY['notas_fiscais_itens', 'estoque_entradas'] LOOP
    SELECT c.numeric_precision, c.numeric_scale INTO v_prec, v_esc
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = v_nome AND c.column_name = 'preco_unitario';
    IF v_prec <> 18 OR v_esc <> 10 THEN
      RAISE EXCEPTION 'FALHA: public.%.preco_unitario deveria ser numeric(18,10), está numeric(%,%).', v_nome, v_prec, v_esc;
    END IF;
  END LOOP;

  -- E o que era para ficar de fora ficou mesmo de fora.
  -- `data_type = 'numeric'` é obrigatório nestas duas conferências: para
  -- uma coluna integer o information_schema devolve escala 0, não NULL,
  -- e `combo_subprodutos.quantidade` (integer) acusaria falha à toa.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.data_type = 'numeric'
       AND c.numeric_scale IS NOT NULL
       AND ((c.table_name = 'config_delivery'   AND c.column_name IN ('origem_lat', 'origem_lng'))
         OR (c.table_name = 'delivery_pedidos'  AND c.column_name IN ('entrega_lat', 'entrega_lng')))
  ) THEN
    RAISE EXCEPTION 'FALHA: coordenada de entrega ganhou precisão fixa — isso erra a posição em quilômetros e quebra a taxa por distância.';
  END IF;

  -- O que se procura aqui é PRECISÃO DE DINHEIRO (escala 2) numa coluna
  -- que não é dinheiro, e não "qualquer escala declarada": desde a
  -- 20240101 as colunas de nota fiscal são numeric(12,4) de propósito, e
  -- 4 casas é exatamente o que uma quantidade precisa. Reprovar escala 4
  -- reprovava o certo — foi o que aconteceu no primeiro banco em que esta
  -- migration rodou.
  --
  -- O corte é em 4 casas: abaixo disso, quantidade fracionada e alíquota
  -- perdem dígito significativo (0,125 kg vira 0,13; 1,65% vira 1,7%).
  -- Escala ausente (numeric livre) continua válida — é como a maioria
  -- destas colunas nasceu.
  SELECT string_agg(format('%s.%s (numeric(%s,%s))', c.table_name, c.column_name, c.numeric_precision, c.numeric_scale),
                    ', ' ORDER BY c.table_name, c.column_name)
    INTO v_soltas
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema = 'public'
     AND c.data_type = 'numeric'
     AND c.numeric_scale IS NOT NULL
     AND c.numeric_scale < 4
     AND (c.column_name LIKE 'aliquota%'
       OR c.column_name = 'reducao_base_icms'
       OR c.column_name IN ('quantidade', 'quantidade_estoque', 'qtd', 'minimo', 'fator_conversao', 'fator_consumo_estoque'));

  IF v_soltas IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: quantidade ou alíquota ficou com precisão de dinheiro: %. Meio quilo perderia casa e alíquota de 1,65%% viraria 1,7%%.', v_soltas;
  END IF;

  -- Prova de que a coluna agora arredonda de verdade, e não só no nome.
  IF (10.004::numeric(12,2)) <> 10.00 OR (10.005::numeric(12,2)) <> 10.01 THEN
    RAISE EXCEPTION 'FALHA: numeric(12,2) não arredondou como esperado neste servidor.';
  END IF;

  RAISE NOTICE 'Colunas de dinheiro conferidas: valor gravado no banco agora tem sempre duas casas.';
END $conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [14/25]  20260924_fechamentos_colunas.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [14/25] 20260924_fechamentos_colunas.sql'; END $aplicando$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  20260924_fechamentos_colunas.sql — A6                               ║
-- ║  Fechamento de caixa deixa de ser um JSONB opaco                     ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- POR QUE ESTA MIGRATION EXISTE
--   `fechamentos` guarda o fechamento inteiro num único `data jsonb`. O app
--   lê isso e mostra bonito na tela, mas o banco não enxerga nada: não dá
--   para perguntar "quais caixas fecharam com falta neste mês", não dá para
--   somar diferença por operador, não dá para criar índice e não dá para
--   montar relatório fora do app. Fechamento de caixa é registro financeiro
--   — precisa ser consultável.
--
-- COMO: COLUNA GERADA, NÃO SEGUNDA GRAVAÇÃO
--   A saída óbvia seria o app gravar as colunas junto com o JSON. Seriam
--   dois caminhos de escrita para o mesmo número, e um dia eles divergem —
--   aí o relatório e a tela mostram valores diferentes para o mesmo caixa e
--   ninguém sabe qual acreditar. Aqui as colunas são GENERATED ALWAYS AS
--   ... STORED: o Postgres as calcula a partir do próprio `data`, no insert.
--   Não há nada a manter em sincronia, e nenhuma linha de código do app
--   muda. `data` continua sendo o registro; as colunas são a projeção
--   consultável dele.
--
-- A CONTA DO ESPERADO É A MESMA DO APP
--   `esperadoEmCaixa()` em src/lib/caixa.js usa `totalEsperado` quando ele
--   existe e cai para `totalVendas + fundo` nos fechamentos antigos, que não
--   tinham o campo. A expressão abaixo repete exatamente essa regra — se as
--   duas discordarem, o relatório da tela e a consulta no banco passam a
--   contar histórias diferentes sobre o mesmo dia.
--
--   A expressão aparece duas vezes (em total_esperado e dentro de
--   diferenca) porque o Postgres não deixa uma coluna gerada referenciar
--   outra. Mudou uma, muda a outra.
--
-- POR QUE `jsonb_typeof` ANTES DE CADA CAST
--   `(data->>'fundo')::numeric` estoura se o JSON trouxer texto onde deveria
--   haver número, e coluna gerada é calculada no insert: um payload torto
--   deixaria de gravar o fechamento inteiro, com o caixa do salão parado.
--   Com o teste de tipo, campo ausente ou estranho vira NULL e o fechamento
--   grava do mesmo jeito.
--
-- POR QUE NÃO TEM COLUNA DE DATA
--   `created_at` já existe e é gravado pelo próprio banco. O `at` do JSON é
--   o relógio da máquina do operador; para consulta, o do banco é melhor.
--
-- CUSTO DE RODAR
--   ADD COLUMN com expressão gerada reescreve a tabela e pega lock
--   exclusivo. `fechamentos` tem uma linha por fechamento de caixa, então é
--   uma tabela pequena e isso passa em instantes — mas ainda assim é lock,
--   então rode fora do horário de pico.
--
-- IDEMPOTENTE
--   Pode rodar de novo: cada ADD COLUMN é IF NOT EXISTS e o índice também.

-- ── 1. as colunas ─────────────────────────────────────────────────────

-- Quem fechou. Serve para "diferença por operador", que é a pergunta que
-- se faz quando falta dinheiro mais de uma vez.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS usuario_nome text
    GENERATED ALWAYS AS (data ->> 'user') STORED;

ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS usuario_papel text
    GENERATED ALWAYS AS (data ->> 'role') STORED;

-- Troco que estava na gaveta na abertura.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS fundo numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
           THEN (data ->> 'fundo')::numeric END
    ) STORED;

-- Tudo que o sistema registrou como venda na sessão, em qualquer meio.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_vendas numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
           THEN (data ->> 'totalVendas')::numeric END
    ) STORED;

-- O que deveria estar conferido — só os meios que tinham linha na tela.
-- Espelha esperadoEmCaixa() de src/lib/caixa.js, inclusive o fallback dos
-- fechamentos antigos.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_esperado numeric(12,2)
    GENERATED ALWAYS AS (
      COALESCE(
        CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
             THEN (data ->> 'totalEsperado')::numeric END,
        CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
             THEN (data ->> 'totalVendas')::numeric ELSE 0 END
        + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
               THEN (data ->> 'fundo')::numeric ELSE 0 END
      )
    ) STORED;

-- O que o operador digitou ter contado.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS total_conferido numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
           THEN (data ->> 'totalConferido')::numeric END
    ) STORED;

-- Positivo é sobra, negativo é falta. Mesma conta de diferencaCaixa().
-- A expressão do esperado está repetida aqui de propósito: coluna gerada
-- não pode referenciar outra coluna gerada.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS diferenca numeric(12,2)
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
           THEN (data ->> 'totalConferido')::numeric ELSE 0 END
      - COALESCE(
          CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
               THEN (data ->> 'totalEsperado')::numeric END,
          CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
               THEN (data ->> 'totalVendas')::numeric ELSE 0 END
          + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
                 THEN (data ->> 'fundo')::numeric ELSE 0 END
        )
    ) STORED;

-- Contado meio a meio ({"dinheiro": 120.00, "pix": 340.50}). Fica jsonb
-- porque a lista de meios de pagamento é configurável por estabelecimento —
-- uma coluna por meio quebraria no primeiro cliente que criar o dele.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS conferido_por_metodo jsonb
    GENERATED ALWAYS AS (
      CASE WHEN jsonb_typeof(data -> 'conferidoPorMetodo') = 'object'
           THEN data -> 'conferidoPorMetodo' END
    ) STORED;

-- Justificativa que o operador escreveu ao fechar com diferença.
ALTER TABLE public.fechamentos
  ADD COLUMN IF NOT EXISTS observacao text
    GENERATED ALWAYS AS (data ->> 'observacao') STORED;

-- ── 2. índice ─────────────────────────────────────────────────────────
-- A consulta que motiva tudo isso é "os fechamentos com diferença deste
-- estabelecimento". Índice parcial: caixa que bateu certo é a maioria das
-- linhas e não precisa entrar.
CREATE INDEX IF NOT EXISTS fechamentos_tenant_diferenca_idx
  ON public.fechamentos (tenant_id, created_at DESC)
  WHERE diferenca <> 0;

-- ── 3. autoteste ──────────────────────────────────────────────────────
-- Coluna gerada com expressão errada não dá erro: grava número errado em
-- silêncio, que é o pior jeito de errar num registro financeiro.
DO $conf$
DECLARE
  v_faltando text;
  v_nao_gerada text;
  v_esperado numeric;
  v_diferenca numeric;
BEGIN
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_faltando
    FROM unnest(ARRAY[
      'usuario_nome', 'usuario_papel', 'fundo', 'total_vendas',
      'total_esperado', 'total_conferido', 'diferenca',
      'conferido_por_metodo', 'observacao'
    ]) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fechamentos'
        AND column_name = c
   );
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) não criada(s) em fechamentos: %', v_faltando;
  END IF;

  -- Se alguma delas for coluna comum, o app teria de gravá-la — e é
  -- exatamente a segunda fonte de verdade que esta migration evita.
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_nao_gerada
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'fechamentos'
     AND column_name IN (
       'usuario_nome', 'usuario_papel', 'fundo', 'total_vendas',
       'total_esperado', 'total_conferido', 'diferenca',
       'conferido_por_metodo', 'observacao'
     )
     AND is_generated <> 'ALWAYS';
  IF v_nao_gerada IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA: coluna(s) de fechamentos não estão geradas pelo banco: %', v_nao_gerada;
  END IF;

  -- Confere a conta com um fechamento de mentira, sem tocar na tabela:
  -- caixa antigo (sem totalEsperado) que contou R$ 90,00 tendo vendido
  -- R$ 80,00 com fundo de R$ 20,00 está R$ 10,00 em falta.
  WITH exemplo(data) AS (
    VALUES ('{"totalVendas": 80.00, "fundo": 20.00, "totalConferido": 90.00}'::jsonb)
  )
  SELECT
    COALESCE(
      CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
           THEN (data ->> 'totalEsperado')::numeric END,
      CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
           THEN (data ->> 'totalVendas')::numeric ELSE 0 END
      + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
             THEN (data ->> 'fundo')::numeric ELSE 0 END
    ),
    CASE WHEN jsonb_typeof(data -> 'totalConferido') = 'number'
         THEN (data ->> 'totalConferido')::numeric ELSE 0 END
    - COALESCE(
        CASE WHEN jsonb_typeof(data -> 'totalEsperado') = 'number'
             THEN (data ->> 'totalEsperado')::numeric END,
        CASE WHEN jsonb_typeof(data -> 'totalVendas') = 'number'
             THEN (data ->> 'totalVendas')::numeric ELSE 0 END
        + CASE WHEN jsonb_typeof(data -> 'fundo') = 'number'
               THEN (data ->> 'fundo')::numeric ELSE 0 END
      )
    INTO v_esperado, v_diferenca
    FROM exemplo;

  IF v_esperado <> 100.00 OR v_diferenca <> -10.00 THEN
    RAISE EXCEPTION 'FALHA: a conta do fechamento saiu errada (esperado=%, diferenca=%). Deveria ser 100.00 e -10.00.',
      v_esperado, v_diferenca;
  END IF;

  RAISE NOTICE 'fechamentos agora responde consulta: esperado, contado, diferença e conferido por método viraram coluna.';
END
$conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [15/25]  20260924_search_path_security_definer.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [15/25] 20260924_search_path_security_definer.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Hardening — search_path fixo em toda função SECURITY DEFINER
--
-- SECURITY DEFINER faz a função rodar com os privilégios de quem a
-- CRIOU (o dono do banco), não de quem a chama. É o que dá poder às
-- RPCs do projeto: `criar_pedido_delivery` grava pedido para um
-- anônimo, `tenant_atual_id` lê o JWT, `assinatura_ativa` consulta
-- billing por baixo da RLS. Sem `SET search_path`, essa função roda com
-- o search_path DE QUEM CHAMA.
--
-- O que isso abre: quem chama controla em que ordem os schemas são
-- procurados, e todo usuário pode criar objeto em `pg_temp` — que entra
-- no caminho de busca. Um nome não-qualificado dentro do corpo
-- (`tenants`, `now()`, um operador) pode então ser resolvido para um
-- objeto plantado pelo chamador, e esse objeto executa com privilégio
-- de dono do banco. É o vetor clássico de escalada em Postgres, e é o
-- mesmo alerta que o linter do próprio Supabase levanta como
-- `function_search_path_mutable`.
--
-- ┌─ HONESTIDADE SOBRE O RISCO REAL AQUI ────────────────────────────┐
-- │ Nas sete funções abaixo, TODA referência já está qualificada      │
-- │ (`public.assinaturas`, `public.tenant_atual_id()`, `auth.jwt()`), │
-- │ e `pg_catalog` vem sempre antes de `pg_temp` para `now()`. Então  │
-- │ não há hoje um caminho de exploração direto — isto é defesa em    │
-- │ profundidade, não fechamento de furo aberto.                      │
-- │                                                                   │
-- │ Vale mesmo assim por um motivo prático: a próxima pessoa que      │
-- │ editar o corpo de uma dessas funções e escrever `FROM tenants`    │
-- │ em vez de `FROM public.tenants` — coisa que passa em qualquer     │
-- │ review — transforma isso em furo de verdade. Com o search_path    │
-- │ fixo, esse deslize continua sendo só um deslize.                  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- POR QUE ALTER E NÃO CREATE OR REPLACE
-- `ALTER FUNCTION ... SET search_path` muda só a configuração, sem
-- tocar no corpo. Reescrever as sete com CREATE OR REPLACE só para
-- acrescentar uma linha significaria copiar corpo de sete funções —
-- sete chances de errar uma vírgula em código de billing e de estoque.
--
-- E O INVERSO TAMBÉM É ARMADILHA: `CREATE OR REPLACE FUNCTION` APAGA as
-- cláusulas `SET` que não forem repetidas no texto novo. Foi assim que
-- três destas aqui perderam o search_path que já tinham — a
-- 20260802_leva16_hardening_rpcs.sql recriou `limpar_reserva_mesa` e
-- `sincronizar_status_assinatura` sem repetir a linha. Quem for
-- reescrever qualquer função SECURITY DEFINER daqui pra frente precisa
-- levar `SET search_path = public` junto no texto.
--
-- Guard automatizado: src/lib/searchPathSqlGuard.test.js varre as
-- migrations e falha se a ÚLTIMA versão de qualquer função SECURITY
-- DEFINER estiver sem a cláusula.
--
-- Idempotente: rodar de novo não muda nada (o SET já estará lá).
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  assinatura text;
  alvos text[] := ARRAY[
    'public.assinatura_ativa(uuid)',
    'public.assinatura_atual_ativa()',
    'public.tenant_tem_modulo(uuid, text)',
    'public.tenant_atual_tem_modulo(text)',
    'public.tenant_atual_tem_addon(text)',
    'public.limpar_reserva_mesa(text)',
    'public.sincronizar_status_assinatura(uuid)'
  ];
BEGIN
  FOREACH assinatura IN ARRAY alvos LOOP
    IF to_regprocedure(assinatura) IS NULL THEN
      RAISE NOTICE 'Função % não existe neste banco — pulando.', assinatura;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', assinatura);
    RAISE NOTICE 'search_path fixado em %', assinatura;
  END LOOP;
END $$;

-- ── Varredura: sobrou alguma SECURITY DEFINER sem search_path? ─────
-- Avisa em vez de abortar: uma função de extensão instalada no schema
-- public apareceria aqui, e travar a migration por causa dela seria
-- pior que mostrar a lista para o dono decidir.
DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS assinatura
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY 1
  LOOP
    n := n + 1;
    RAISE WARNING 'SECURITY DEFINER sem search_path: %', r.assinatura;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE 'Todas as funções SECURITY DEFINER de public têm search_path fixo.';
  ELSE
    RAISE WARNING '% função(ões) SECURITY DEFINER ainda sem search_path — ver avisos acima.', n;
  END IF;
END $$;

-- ── Verificação ────────────────────────────────────────────────────
SELECT
  p.oid::regprocedure::text AS funcao,
  p.proconfig               AS config
FROM pg_proc p
JOIN pg_namespace ns ON ns.oid = p.pronamespace
WHERE ns.nspname = 'public'
  AND p.prosecdef
ORDER BY 1;


-- ══════════════════════════════════════════════════════════════════════
-- [16/25]  20260925_leads_apex.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [16/25] 20260925_leads_apex.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- 20260925 — leads do site institucional (apex kora.codes)
-- ══════════════════════════════════════════════════════════════════
--
-- O PROBLEMA
--   O construtor de plano do apex termina no botão "Agendar
--   demonstração", que abre um formulário pedindo nome, WhatsApp e
--   e-mail. O formulário valida tudo, mostra uma tela de sucesso e
--   JOGA O DADO FORA: não havia insert, nem e-mail, nem webhook
--   (src/pages/apex/ApexAgendamento.jsx dizia, no próprio código,
--   "TODO: gravar lead em `leads`"). Cada pessoa que preencheu ficou
--   esperando um contato que nunca ia chegar.
--
--   É o pior tipo de furo: silencioso dos dois lados. O visitante acha
--   que agendou; a plataforma não sabe que ele existiu.
--
-- POR QUE UMA RPC E NÃO INSERT DIRETO COM POLICY DE anon
--   A tela é pública e roda com a chave anon. Abrir um INSERT direto na
--   tabela para anon significa entregar o endpoint do PostgREST para
--   qualquer script: campos livres, sem teto, sem validação. O padrão
--   já estabelecido no projeto para escrita anônima é o do delivery
--   (20260804): a tabela fica FECHADA para anon e a única porta é uma
--   RPC SECURITY DEFINER que valida e limita. Esta migração segue o
--   mesmo desenho.
--
-- POR QUE NÃO TEM tenant_id
--   Um lead é alguém que AINDA NÃO é estabelecimento — é a plataforma
--   vendendo (decisão 017, SaaS multi-estabelecimento). Não existe
--   tenant a que ele pertença, e por isso a leitura é do super-admin da
--   plataforma (is_super_admin()), não de um tenant. Nenhuma policy
--   entrega esta tabela a um token de estabelecimento.
--
-- FREIO DE ABUSO
--   Formulário público sem freio vira lixeira em uma noite. Dois tetos,
--   na mesma lógica do balde do delivery (20260921):
--     • mesmo contato (e-mail OU WhatsApp): 3 envios em 10 minutos —
--       cobre quem clicou duas vezes ou corrigiu um dígito;
--     • balde geral: 30 envios em 10 minutos — o site inteiro. É folga
--       enorme para o volume real de uma landing em bootstrap e corta
--       o script na trigésima em vez de na trigésima milésima.
--   A recusa NÃO é erro de tela para o visitante honesto: ele nunca
--   encosta nesses números.
--
-- LGPD
--   Só o mínimo para retomar o contato (nome, WhatsApp, e-mail) mais o
--   plano que a pessoa montou, que é o assunto da conversa. Sem IP, sem
--   fingerprint, sem rastreamento. `origem` fica preparado para outras
--   portas de entrada além do apex.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — TABELA
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL,
  whatsapp    text        NOT NULL,   -- só dígitos (a RPC normaliza)
  email       text        NOT NULL,   -- minúsculo (a RPC normaliza)
  plano_total numeric(10,2),          -- total estimado que a pessoa montou
  plano_itens text[],                 -- módulos/complementos escolhidos
  origem      text        NOT NULL DEFAULT 'apex',
  criado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
  'Contatos capturados no site institucional (apex). Da PLATAFORMA, sem tenant_id: quem está aqui ainda não é estabelecimento.';

-- Índice do freio e da tela de leitura: as duas consultas cortam por
-- data recente, então a ordem descendente é a que serve às duas.
CREATE INDEX IF NOT EXISTS leads_criado_em_idx ON public.leads (criado_em DESC);

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS: fechada por padrão
-- ══════════════════════════════════════════════════════════════════
-- Sem policy de INSERT/UPDATE/DELETE de propósito: a única escrita é a
-- RPC abaixo, que roda como DEFINER e atravessa a RLS. Leitura só do
-- super-admin da plataforma.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_leitura_plataforma ON public.leads;
CREATE POLICY leads_leitura_plataforma ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Cinto e suspensório: mesmo com RLS, nenhum GRANT de tabela para anon.
REVOKE ALL ON TABLE public.leads FROM PUBLIC;
REVOKE ALL ON TABLE public.leads FROM anon;
GRANT SELECT ON TABLE public.leads TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — RPC pública (a única porta)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_lead_apex(
  p_nome     text,
  p_whatsapp text,
  p_email    text,
  p_total    numeric DEFAULT NULL,
  p_itens    text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome  text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_tel   text := NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_itens text[];
  v_count integer;
BEGIN
  -- ── Validação NO BANCO ────────────────────────────────────────────
  -- A tela valida igual, mas a tela não é a fronteira: o PostgREST
  -- aceita a chamada de qualquer lugar, com qualquer conteúdo.
  IF v_nome IS NULL OR length(v_nome) < 2 OR length(v_nome) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  END IF;

  IF v_tel IS NULL OR length(v_tel) < 10 OR length(v_tel) > 11 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'whatsapp_invalido');
  END IF;

  IF v_email IS NULL OR length(v_email) > 160
     OR v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'email_invalido');
  END IF;

  -- Total é referência comercial, não cobrança. Fora da faixa plausível
  -- vira NULL em vez de recusar: o lead vale mais que o número.
  IF p_total IS NOT NULL AND (p_total < 0 OR p_total > 100000) THEN
    p_total := NULL;
  END IF;

  -- Teto de itens: a lista tem 11 opções hoje; 30 cobre crescimento e
  -- impede alguém de usar o campo como depósito de texto.
  v_itens := (SELECT array_agg(left(btrim(i), 80))
              FROM unnest(COALESCE(p_itens, ARRAY[]::text[])) AS i
              WHERE btrim(i) <> '');
  IF v_itens IS NOT NULL AND array_length(v_itens, 1) > 30 THEN
    v_itens := v_itens[1:30];
  END IF;

  -- ── Freio 1: mesmo contato ────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE criado_em > now() - interval '10 minutes'
    AND (email = v_email OR whatsapp = v_tel);
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  -- ── Freio 2: balde geral do site ──────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE criado_em > now() - interval '10 minutes';
  IF v_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  INSERT INTO public.leads (nome, whatsapp, email, plano_total, plano_itens)
  VALUES (v_nome, v_tel, v_email, p_total, v_itens);

  -- Não devolve o id: quem chama é anônimo e não tem o que fazer com
  -- ele; devolver seria dar um identificador de registro a quem não
  -- pode ler a tabela.
  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) IS
  'Única porta de escrita em public.leads. Chamada com a chave anon pelo site institucional.';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 4 — GRANTS (REVOKE antes do GRANT, nessa ordem)
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) TO anon, authenticated;

-- ── Conferência: a tabela NÃO pode estar acessível ao anon ─────────
SELECT 'public.leads' AS tabela,
       CASE WHEN has_table_privilege('anon', 'public.leads', 'SELECT')
             OR has_table_privilege('anon', 'public.leads', 'INSERT')
            THEN '❌ anon alcança a tabela' ELSE '✅ fechada (só a RPC)' END AS anon_status,
       CASE WHEN has_function_privilege('anon', 'public.registrar_lead_apex(text,text,text,numeric,text[])', 'EXECUTE')
            THEN '✅ RPC liberada' ELSE '❌ RPC sem grant' END AS rpc_status;


-- ══════════════════════════════════════════════════════════════════════
-- [17/25]  20260925_ponte_download_bucket.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [17/25] 20260925_ponte_download_bucket.sql'; END $aplicando$;

-- ──────────────────────────────────────────────────────────────────
-- NÃO É MAIS USADA — leia antes de rodar.
--
--   Este bucket foi criado, mas o KoraPonte.zip acabou publicado no bucket
--   `branding`, que já existia. É de lá que o app baixa hoje:
--     {VITE_SUPABASE_URL}/storage/v1/object/public/branding/KoraPonte.zip
--   O passo a passo de publicação está em ponte/README.md e aponta para o
--   `branding`. Este arquivo fica como registro do que já foi aplicado no
--   banco (o bucket `ponte-download` existe lá, vazio) — rodar de novo não
--   quebra nada, só recria um bucket que ninguém usa. Para limpar, veja o
--   comando comentado no fim.
--
--   O resto do texto abaixo descreve o desenho original e continua valendo
--   como explicação de POR QUE o arquivo mora num bucket sem policy de
--   escrita — o `branding` também não tem nenhuma, que é o que segura o
--   executável no lugar.
-- ──────────────────────────────────────────────────────────────────
--
-- Ponte KORA — bucket público de DOWNLOAD do programa (KoraPonte.zip).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
--
-- Para que serve
--   As duas telas que pedem o programa da Ponte — Configurações → Impressão →
--   "Impressora e papel" (quando o dono escolhe a impressora térmica) e a
--   aba "Pedidos sem Internet" — mostram um botão de download. O endereço
--   do botão vem de VITE_PONTE_DOWNLOAD_URL; este bucket é onde o arquivo
--   fica hospedado.
--
--   O que se publica aqui é o executável COMPACTADO (ver ATENÇÃO no fim).
--   Endereço público, que é o que vai na variável (fixo — publicar versão
--   nova é trocar o arquivo mantendo o mesmo nome):
--     {VITE_SUPABASE_URL}/storage/v1/object/public/ponte-download/KoraPonte.zip
--
-- Por que NÃO é por tenant
--   É o mesmo executável para todos os estabelecimentos (ponte/README.md):
--   quem diz de quem ele é são as credenciais digitadas no painel da ponte,
--   não o binário. O arquivo é da plataforma, não do estabelecimento — daí
--   um caminho só, sem pasta de tenant (ao contrário de `delivery-fotos`).
--
-- Segurança (multi-tenant, decisão 002)
--   • Leitura: bucket PÚBLICO. O dono precisa baixar o programa ANTES de ter
--     qualquer coisa instalada, às vezes de outro computador, e o arquivo não
--     guarda segredo nenhum — é o mesmo instalador que já circula por e-mail
--     e pen drive.
--   • Escrita: NENHUMA policy, de propósito. `storage.objects` já vem com RLS
--     ligada, e sem policy de insert/update/delete nem `anon` nem
--     `authenticated` conseguem gravar aqui. Publicar versão nova é trabalho
--     da plataforma, pelo painel do Supabase (a `service_role` passa por cima
--     da RLS) — nunca pelo app, nunca pelo estabelecimento. Sem isso, um
--     tenant qualquer poderia trocar o executável que TODOS baixam.
--
-- Idempotente: pode rodar de novo sem erro.
-- ──────────────────────────────────────────────────────────────────

-- Bucket público, com teto de tamanho e os tipos que valem aqui: os dois de
-- zip, que é como o arquivo é publicado hoje, e os de executável de Windows,
-- para o dia em que o .exe puder subir cru. São vários porque o navegador
-- rotula o mesmo arquivo de um jeito diferente em cada máquina; se o upload
-- for recusado por tipo, é só acrescentar aqui o que o painel reclamar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ponte-download',
  'ponte-download',
  true,
  104857600, -- 100 MB — mas quem manda é o teto do projeto; ver ATENÇÃO abaixo
  array[
    'application/octet-stream',
    'application/x-msdownload',
    'application/vnd.microsoft.portable-executable',
    'application/x-msdos-program',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ATENÇÃO — por que o arquivo vai compactado
--   O limite acima é do bucket, mas quem vale é o MENOR entre ele e o teto
--   global do projeto (Storage → Settings → "Upload file size limit"). No
--   plano gratuito esse teto global é de 50 MB, e o KoraPonte.exe tem ~58 MB:
--   cru, o upload é recusado antes de começar. Por decisão do dono (custo —
--   memory/restrictions.md), a saída escolhida foi publicar COMPACTADO, sem
--   sair do plano gratuito: sobe `KoraPonte.zip`, e as duas telas do app
--   mandam descompactar antes do duplo clique.
--
--   Este arquivo não muda por causa disso: o bucket é o mesmo, e `zip` já está
--   entre os tipos aceitos acima — quem já rodou esta migration NÃO precisa
--   rodar de novo. Muda só o nome do objeto que se envia pelo painel.
--
--   Se um dia o .zip também não couber nos 50 MB, as saídas continuam sendo:
--     a) asset de Release do GitHub — gratuito, cabe (teto de 2 GB por
--        arquivo) e a variável aponta para lá sem mudar uma linha de código.
--        O repositório é público, então o link baixa direto, sem login;
--     b) plano Pago do Supabase (teto vai a 500 GB).

-- Conferência (deve devolver 1 linha, com public = true):
select id, public, file_size_limit
from storage.buckets
where id = 'ponte-download';

-- Limpeza opcional — some com o bucket vazio que ficou sobrando. Só rode
-- depois de conferir que ele está mesmo vazio (Storage → ponte-download): o
-- delete falha se houver qualquer arquivo dentro, e é assim que tem de ser.
-- delete from storage.buckets where id = 'ponte-download';


-- ══════════════════════════════════════════════════════════════════════
-- [18/25]  20260926_solicitacoes_conta.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [18/25] 20260926_solicitacoes_conta.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- 20260926 — solicitações de conta do site institucional (apex)
-- ══════════════════════════════════════════════════════════════════
--
-- O PROBLEMA
--   O botão "Entrar" do apex (kora.codes) mandava para /login, que no
--   domínio nu cai no slug de fallback: a porta de entrada da
--   PLATAFORMA abria o login de UM cliente específico (gastromundi),
--   com a marca dele na tela. Quem é cliente de outro estabelecimento
--   nem consegue entrar por ali — a credencial dele vive em outro
--   namespace (`usuario@<slug>.local`) — e quem ainda não é cliente
--   não tinha por onde começar.
--
--   Esta migração dá o que faltava do lado do banco: uma porta pública
--   para o visitante PEDIR sua conta (estabelecimento + plano), e uma
--   fila que o dono da plataforma resolve no Console.
--
-- POR QUE PEDIDO, E NÃO CRIAÇÃO DIRETA
--   Criar estabelecimento é ato da PLATAFORMA (decisão 027): a RPC
--   `provisionar_tenant` e a Edge Function `provisionar-estabelecimento`
--   exigem super-admin `plataforma`. Abrir isso para o anônimo daria a
--   qualquer script o poder de fabricar tenants, endereços e usuários
--   de auth. Então o visitante SOLICITA; quem cria continua sendo o
--   Console, com um clique a mais e nenhuma porta nova.
--
--   O responsável que preencheu vira o ADMIN do estabelecimento no
--   momento da aprovação — é o `provisionar-estabelecimento` de sempre,
--   agora com o formulário já preenchido pelo próprio cliente.
--
-- POR QUE UMA RPC E NÃO INSERT DIRETO COM POLICY DE anon
--   Mesmo desenho de `registrar_lead_apex` (20260925) e do delivery
--   público (20260804): tabela FECHADA para anon, escrita só por RPC
--   SECURITY DEFINER que valida de novo no banco e tem freio de abuso.
--
-- POR QUE NÃO TEM tenant_id NA ORIGEM
--   Quem solicita ainda NÃO é estabelecimento (decisão 017). O
--   `tenant_id` só é preenchido na APROVAÇÃO, e é o vínculo entre a
--   pessoa que pediu e o estabelecimento que nasceu para ela.
--
-- LGPD
--   Só o mínimo para abrir a conta e retomar o contato (nome, WhatsApp,
--   e-mail, nome do negócio, endereço pedido, plano de interesse). Sem
--   senha — senha de pedido guardado em tabela é segredo em texto claro;
--   a credencial nasce no provisionamento e vai pelo cartão de primeiro
--   acesso que o Console já emite. Sem IP, sem fingerprint.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — TABELA
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.solicitacoes_conta (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text        NOT NULL,   -- responsável (vira o admin)
  whatsapp        text        NOT NULL,   -- só dígitos (a RPC normaliza)
  email           text        NOT NULL,   -- minúsculo (a RPC normaliza)
  estabelecimento text        NOT NULL,   -- nome do negócio
  slug_desejado   text        NOT NULL,   -- endereço pedido, já normalizado
  -- Plano é INTERESSE COMERCIAL, não contrato: o código aqui é o do
  -- preset do site (balcao/restaurante/…), que não é o catálogo
  -- `public.planos`. Por isso sem FK — o preço real é fechado na
  -- conversa e o plano de verdade é escolhido no provisionamento.
  plano_codigo    text,
  plano_nome      text,
  plano_itens     text[],
  plano_total     numeric(10,2),
  status          text        NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente', 'aprovada', 'recusada')),
  tenant_id       uuid        REFERENCES public.tenants(id),
  observacao      text,       -- anotação do dono ao decidir
  criado_em       timestamptz NOT NULL DEFAULT now(),
  decidido_em     timestamptz,
  decidido_por    uuid        -- auth.uid() de quem decidiu
);

COMMENT ON TABLE public.solicitacoes_conta IS
  'Pedidos de conta feitos no site institucional (apex). Da PLATAFORMA, sem tenant_id na origem: quem pede ainda não é estabelecimento. O tenant_id aparece na aprovação.';

-- Fila do Console e freio da RPC cortam por data recente; a mesma ordem
-- descendente serve às duas consultas.
CREATE INDEX IF NOT EXISTS solicitacoes_conta_criado_em_idx
  ON public.solicitacoes_conta (criado_em DESC);

-- O laço de endereço pergunta "este slug já foi pedido e está pendente?".
-- Índice parcial: só as pendentes disputam endereço — pedido recusado ou
-- já aprovado (que virou tenant) não bloqueia ninguém.
CREATE INDEX IF NOT EXISTS solicitacoes_conta_slug_pendente_idx
  ON public.solicitacoes_conta (slug_desejado)
  WHERE status = 'pendente';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS: fechada por padrão
-- ══════════════════════════════════════════════════════════════════
-- Sem policy de INSERT de propósito: a única escrita pública é a RPC
-- abaixo, que roda como DEFINER e atravessa a RLS. Leitura e decisão
-- são do super-admin da plataforma. Nenhuma policy entrega esta tabela
-- a um token de estabelecimento.
ALTER TABLE public.solicitacoes_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_conta FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacoes_conta_leitura_plataforma ON public.solicitacoes_conta;
CREATE POLICY solicitacoes_conta_leitura_plataforma ON public.solicitacoes_conta
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Cinto e suspensório: nenhum GRANT de tabela para anon, e nenhum
-- UPDATE/DELETE direto nem para o super-admin — decidir passa pela RPC,
-- que é onde ficam as regras (transição de status, carimbo de quem
-- decidiu, vínculo com o tenant criado).
REVOKE ALL ON TABLE public.solicitacoes_conta FROM PUBLIC;
REVOKE ALL ON TABLE public.solicitacoes_conta FROM anon;
GRANT SELECT ON TABLE public.solicitacoes_conta TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — RPC pública (a única porta de escrita do visitante)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_solicitacao_conta(
  p_nome            text,
  p_whatsapp        text,
  p_email           text,
  p_estabelecimento text,
  p_slug            text    DEFAULT NULL,
  p_plano_codigo    text    DEFAULT NULL,
  p_plano_nome      text    DEFAULT NULL,
  p_total           numeric DEFAULT NULL,
  p_itens           text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome   text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_tel    text := NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), '');
  v_email  text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_negocio text := NULLIF(btrim(COALESCE(p_estabelecimento, '')), '');
  v_slug   text;
  v_livre  text;
  v_itens  text[];
  v_count  integer;
  v_n      integer := 1;
BEGIN
  -- ── Validação NO BANCO ────────────────────────────────────────────
  -- A tela valida igual, mas a tela não é a fronteira: o PostgREST
  -- aceita a chamada de qualquer lugar, com qualquer conteúdo.
  IF v_nome IS NULL OR length(v_nome) < 2 OR length(v_nome) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  END IF;

  IF v_tel IS NULL OR length(v_tel) < 10 OR length(v_tel) > 11 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'whatsapp_invalido');
  END IF;

  IF v_email IS NULL OR length(v_email) > 160
     OR v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'email_invalido');
  END IF;

  IF v_negocio IS NULL OR length(v_negocio) < 2 OR length(v_negocio) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'estabelecimento_invalido');
  END IF;

  -- Endereço: mesma normalização que o provisionamento aplicaria
  -- (`slugify_tenant`, 20260741). Vazio à toa não existe — cai no nome
  -- do negócio, exatamente como `provisionar_tenant` faz.
  -- `left(…, 40)` é o mesmo teto do formulário e da Edge Function
  -- (MAX_SLUG): sem ele o nome comprido de um bar viraria um subdomínio
  -- que ninguém digita, e o endereço guardado aqui não bateria com o que
  -- o provisionamento cria depois.
  v_slug := left(COALESCE(public.slugify_tenant(p_slug),
                          public.slugify_tenant(v_negocio)), 40);
  IF v_slug IS NULL OR length(v_slug) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'endereco_invalido');
  END IF;

  -- ── Endereço disputado ────────────────────────────────────────────
  -- Reservado, já de um estabelecimento, ou já pedido por outra pessoa
  -- que ainda está na fila. Recusar é o certo: dois clientes não podem
  -- combinar o mesmo subdomínio, e descobrir isso só na aprovação
  -- obrigaria o dono a renegociar o endereço depois da venda.
  --
  -- A recusa vem COM SUGESTÃO livre (mesmo laço de `provisionar_tenant`:
  -- base, base2, base3…), para a tela oferecer o próximo em vez de só
  -- dizer "não pode".
  IF public.slug_reservado(v_slug)
     OR EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.solicitacoes_conta
                 WHERE slug_desejado = v_slug AND status = 'pendente') THEN
    v_livre := v_slug;
    WHILE public.slug_reservado(v_livre)
          OR EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_livre)
          OR EXISTS (SELECT 1 FROM public.solicitacoes_conta
                      WHERE slug_desejado = v_livre AND status = 'pendente') LOOP
      v_n := v_n + 1;
      v_livre := v_slug || v_n::text;
      EXIT WHEN v_n > 50;  -- teto de segurança: laço nunca é infinito
    END LOOP;
    RETURN jsonb_build_object('ok', false, 'erro', 'endereco_em_uso', 'sugestao', v_livre);
  END IF;

  -- Total é referência comercial, não cobrança. Fora da faixa plausível
  -- vira NULL em vez de recusar: o pedido vale mais que o número.
  IF p_total IS NOT NULL AND (p_total < 0 OR p_total > 100000) THEN
    p_total := NULL;
  END IF;

  -- Teto de itens, igual ao dos leads: impede usar o campo como
  -- depósito de texto.
  v_itens := (SELECT array_agg(left(btrim(i), 80))
              FROM unnest(COALESCE(p_itens, ARRAY[]::text[])) AS i
              WHERE btrim(i) <> '');
  IF v_itens IS NOT NULL AND array_length(v_itens, 1) > 30 THEN
    v_itens := v_itens[1:30];
  END IF;

  -- ── Freio 1: mesmo contato ────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.solicitacoes_conta
  WHERE criado_em > now() - interval '10 minutes'
    AND (email = v_email OR whatsapp = v_tel);
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  -- ── Freio 2: balde geral do site ──────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.solicitacoes_conta
  WHERE criado_em > now() - interval '10 minutes';
  IF v_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  INSERT INTO public.solicitacoes_conta
    (nome, whatsapp, email, estabelecimento, slug_desejado,
     plano_codigo, plano_nome, plano_itens, plano_total)
  VALUES
    (v_nome, v_tel, v_email, v_negocio, v_slug,
     NULLIF(btrim(COALESCE(p_plano_codigo, '')), ''),
     NULLIF(btrim(COALESCE(p_plano_nome, '')), ''),
     v_itens, p_total);

  -- Devolve o endereço EFETIVO (normalizado) e nada mais: quem chama é
  -- anônimo e não tem o que fazer com o id de um registro que não pode
  -- ler — mas precisa ver o endereço que vai receber.
  RETURN jsonb_build_object('ok', true, 'endereco', v_slug);
END;
$$;

COMMENT ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) IS
  'Única porta de escrita em public.solicitacoes_conta. Chamada com a chave anon pelo site institucional (apex).';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 4 — RPC de decisão (Console da plataforma)
-- ══════════════════════════════════════════════════════════════════
-- Aprovar/recusar não é UPDATE solto: carimba quem decidiu, quando, e
-- (na aprovação) qual estabelecimento nasceu do pedido. Guarda de
-- plataforma ANTES de qualquer escrita.
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_conta(
  p_id         uuid,
  p_status     text,
  p_tenant_id  uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.solicitacoes_conta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_linha  public.solicitacoes_conta;
BEGIN
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente a plataforma pode decidir uma solicitação de conta.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('aprovada', 'recusada') THEN
    RAISE EXCEPTION 'Decisão inválida: use aprovada ou recusada.'
      USING ERRCODE = '22023';
  END IF;

  -- Aprovar sem estabelecimento seria mentir na fila: o pedido sairia de
  -- "pendente" sem que nada tenha sido criado para a pessoa.
  IF v_status = 'aprovada' AND p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Aprovar exige o estabelecimento criado para esta solicitação.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_linha FROM public.solicitacoes_conta WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_linha.status <> 'pendente' THEN
    RAISE EXCEPTION 'Esta solicitação já foi decidida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.solicitacoes_conta
     SET status       = v_status,
         tenant_id    = CASE WHEN v_status = 'aprovada' THEN p_tenant_id ELSE NULL END,
         observacao   = NULLIF(btrim(COALESCE(p_observacao, '')), ''),
         decidido_em  = now(),
         decidido_por = auth.uid()
   WHERE id = p_id
   RETURNING * INTO v_linha;

  RETURN v_linha;
END;
$$;

COMMENT ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) IS
  'Console: aprova (vinculando o tenant criado) ou recusa uma solicitação de conta. Só super-admin plataforma.';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 5 — GRANTS (REVOKE antes do GRANT, nessa ordem)
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) TO authenticated;

-- ── Conferência ───────────────────────────────────────────────────
SELECT 'public.solicitacoes_conta' AS tabela,
       CASE WHEN has_table_privilege('anon', 'public.solicitacoes_conta', 'SELECT')
             OR has_table_privilege('anon', 'public.solicitacoes_conta', 'INSERT')
            THEN '❌ anon alcança a tabela' ELSE '✅ fechada (só a RPC)' END AS anon_status,
       CASE WHEN has_function_privilege('anon', 'public.registrar_solicitacao_conta(text,text,text,text,text,text,text,numeric,text[])', 'EXECUTE')
            THEN '✅ RPC pública liberada' ELSE '❌ RPC pública sem grant' END AS rpc_publica,
       CASE WHEN has_function_privilege('anon', 'public.decidir_solicitacao_conta(uuid,text,uuid,text)', 'EXECUTE')
            THEN '❌ anon decide' ELSE '✅ decisão fechada ao anon' END AS rpc_decisao;


-- ══════════════════════════════════════════════════════════════════════
-- [19/25]  20260927_grupo_escolha_itens_ativo.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [19/25] 20260927_grupo_escolha_itens_ativo.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Opção de grupo de escolha pode ser DESLIGADA sem ser apagada
-- 20260927
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Acabou a cerveja da casa. Hoje o dono só tem uma saída: apagar  │
-- │ a opção do grupo. Ao apagar, some junto o acréscimo que ele     │
-- │ tinha configurado para ela — e amanhã, quando a cerveja voltar, │
-- │ ele precisa lembrar quanto era e cadastrar de novo.             │
-- │                                                                  │
-- │ Com a coluna, desligar é um clique e ligar de volta é outro. O  │
-- │ que estava configurado continua lá.                             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- SEM RISCO PARA QUEM JÁ TEM DADOS: a coluna nasce NOT NULL DEFAULT
-- true, então toda opção que já existe continua ligada, exatamente
-- como está hoje. Ninguém precisa reconfigurar nada.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS. Rodar de novo não faz nada.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.grupo_escolha_itens
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.grupo_escolha_itens.ativo IS
  'Opção desligada continua cadastrada (com o acréscimo dela) mas não aparece para o operador escolher. É o "acabou hoje" sem perder a configuração.';

-- ══════════════════════════════════════════════════════════════════
-- Autoteste — falha alto se a coluna não ficou como o app espera.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tipo    text;
  v_nulo    text;
  v_default text;
BEGIN
  SELECT c.data_type, c.is_nullable, c.column_default
    INTO v_tipo, v_nulo, v_default
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'grupo_escolha_itens'
     AND c.column_name = 'ativo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA: a coluna public.grupo_escolha_itens.ativo não foi criada. A tabela existe? Rode a 20260918_grupos_escolha.sql antes desta.';
  END IF;

  IF v_tipo <> 'boolean' THEN
    RAISE EXCEPTION 'FALHA: ativo deveria ser boolean, é %.', v_tipo;
  END IF;

  -- NOT NULL com default é o que garante que opção antiga continue
  -- ligada. Sem isso, as que já existem viriam NULL e o app teria de
  -- adivinhar o que fazer com elas.
  IF v_nulo <> 'NO' THEN
    RAISE EXCEPTION 'FALHA: ativo aceita NULL — opção antiga ficaria sem resposta sobre estar ligada ou não.';
  END IF;

  IF v_default IS NULL OR v_default NOT LIKE '%true%' THEN
    RAISE EXCEPTION 'FALHA: ativo deveria nascer com DEFAULT true, veio %.', coalesce(v_default, 'sem default');
  END IF;

  RAISE NOTICE 'grupo_escolha_itens.ativo conferida: desligar uma opção não apaga mais a configuração dela.';
END $conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [20/25]  20260928_delivery_retirada_no_local.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [20/25] 20260928_delivery_retirada_no_local.sql'; END $aplicando$;

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


-- ══════════════════════════════════════════════════════════════════════
-- [21/25]  20260929_delivery_sem_cep_e_meus_pedidos.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [21/25] 20260929_delivery_sem_cep_e_meus_pedidos.sql'; END $aplicando$;

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


-- ══════════════════════════════════════════════════════════════════════
-- [22/25]  20260930_delivery_telefone_obrigatorio.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [22/25] 20260930_delivery_telefone_obrigatorio.sql'; END $aplicando$;

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


-- ══════════════════════════════════════════════════════════════════════
-- [23/25]  20261001_delivery_via_sai_sozinha.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [23/25] 20261001_delivery_via_sai_sozinha.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- A via do pedido de delivery nunca saía sozinha na impressora.
--
-- ┌─ O buraco ────────────────────────────────────────────────────────┐
-- │ Existe um vigia que imprime a via de produção sozinho quando um   │
-- │ pedido novo chega (`useImpressaoLancamentos`, decisão do dono     │
-- │ 2026-07-29): é assim que o lançamento do Palm sai na bancada sem  │
-- │ ninguém apertar nada. Ele acha o que é novo por LANÇAMENTO, e um  │
-- │ lançamento é identificado pelo par (id da comanda, `launched_at`  │
-- │ do item) — ver `lancamentosDoPedido` em lib/impressao/            │
-- │ lancamentos.js, que PULA todo item sem esse carimbo.              │
-- │                                                                    │
-- │ O espelho que `criar_pedido_delivery` grava em `pending` nunca    │
-- │ carimbou `launched_at`. Resultado: o pedido de delivery entra no  │
-- │ painel, aparece na Cozinha, aparece na aba Delivery — e não sai   │
-- │ UM papel. Ele só era impresso se alguém estivesse com a tela da   │
-- │ Cozinha aberta e clicasse em "Via de produção", pedido a pedido.  │
-- │ Num restaurante em movimento é o pedido que passa despercebido.   │
-- └────────────────────────────────────────────────────────────────────┘
--
-- A correção é o carimbo. Todos os itens do pedido levam o MESMO
-- instante, de propósito: um pedido de delivery é um lançamento só, e é
-- isso que faz o eco do realtime (o caixa e o Palm reagindo à mesma
-- gravação) render um papel, e não um por item.
--
-- `now()` e não `timezone(fuso, now())`: `launched_at` é instante, não
-- data de calendário — quem precisa do dia do estabelecimento é o número
-- do pedido, que já tem o seu próprio tratamento de fuso logo abaixo.
--
-- Pedidos que já existem não ganham o carimbo, e é o certo: reimprimir
-- sozinho a via de tudo que está aberto assim que a migração subir
-- encheria a bancada de papel velho.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova.
-- ══════════════════════════════════════════════════════════════════

-- Cópia literal de 20260930, com o carimbo `launched_at` no espelho.
-- Nada mais do corpo mudou.
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
-- Conferência ao vivo — aborta a transação se o carimbo não estiver lá.
-- Não escreve dado nenhum.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'criar_pedido_delivery';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Via automática: criar_pedido_delivery não existe.';
  END IF;
  IF position('launched_at' in v_def) = 0 THEN
    RAISE EXCEPTION 'Via automática: o espelho em pending não carimba launched_at — a via do delivery continuaria só saindo no clique manual da Cozinha.';
  END IF;
  -- As guardas conquistadas antes continuam de pé nesta cópia: é a ÚLTIMA
  -- definição que vale, e uma cópia que esqueça uma delas a apaga do banco.
  IF position('telefone_br_valido' in v_def) = 0 THEN
    RAISE EXCEPTION 'Via automática: esta cópia perdeu a guarda do telefone.';
  END IF;
  IF position('v_retirada' in v_def) = 0 THEN
    RAISE EXCEPTION 'Via automática: esta cópia perdeu a retirada no local.';
  END IF;
  IF position('dispositivo_id' in v_def) = 0 THEN
    RAISE EXCEPTION 'Via automática: esta cópia perdeu o carimbo do aparelho (histórico sem conta).';
  END IF;

  RAISE NOTICE 'Via de produção do delivery: sai sozinha a partir de agora.';
END;
$conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [24/25]  20261002_venda_do_delivery.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [24/25] 20261002_venda_do_delivery.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- O delivery passa a fechar a própria venda, com registro separado.
--
-- ┌─ Como era ────────────────────────────────────────────────────────┐
-- │ `criar_pedido_delivery` espelha todo pedido em `pending`, e esse   │
-- │ espelho aparecia na lista de comandas do PDV como qualquer mesa.   │
-- │ Era ELE que o caixa fechava para registrar a venda — está escrito  │
-- │ na 20260904: "'entregue' mantém a comanda de propósito: é ela que  │
-- │ o PDV fecha para registrar a venda".                                │
-- │                                                                     │
-- │ Consequências: o pedido de delivery poluía a tela do garçom (ele   │
-- │ não tem nada a fazer com uma comanda que ninguém vai atender na    │
-- │ mesa), e a venda de delivery nascia indistinguível de uma venda de │
-- │ balcão — sem como separar quanto o delivery vendeu.                 │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- ┌─ Como fica ───────────────────────────────────────────────────────┐
-- │ A venda do delivery é registrada pela PRÓPRIA aba Delivery, no    │
-- │ momento em que o pedido é marcado como entregue, e nasce marcada   │
-- │ com `origem = 'delivery'` e o vínculo com o pedido que a originou. │
-- │ O espelho em `pending` deixa de ser peça financeira e passa a ser  │
-- │ só o que sempre foi de fato útil: a comanda que a COZINHA lê e que │
-- │ a impressora imprime.                                               │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- Por que uma RPC e não três INSERTs no front: venda, itens e pagamento
-- têm que entrar juntos ou não entrar. Do lado do navegador, a aba
-- fechando entre o primeiro e o segundo INSERT deixaria uma venda sem
-- itens no relatório — dinheiro registrado sem lastro.
--
-- Idempotente de propósito: `delivery_pedido_id` é UNIQUE, e a função
-- devolve a venda que já existe em vez de criar outra. O clique duplo em
-- "Confirmar entrega", o eco do realtime e o operador que volta na tela
-- não podem render duas vendas do mesmo pedido.
--
-- Pedido CANCELADO não vira venda: quem cancelou não recebeu nada.
--
-- RLS: nenhuma tabela nova. As colunas entram em `vendas`, que já tem
-- RLS por tenant. A RPC é SECURITY DEFINER e confere o tenant do pedido
-- contra o tenant de quem chama — ela NÃO é exposta ao anon.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A venda sabe de onde veio ───────────────────────────────────
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pdv';

DO $constraint$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_origem_check') THEN
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_origem_check CHECK (origem IN ('pdv', 'delivery'));
  END IF;
END;
$constraint$;

COMMENT ON COLUMN public.vendas.origem IS
  'De onde a venda veio: pdv (balcão/mesa) ou delivery. Toda venda que já existia é do PDV — era o único caminho.';

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS delivery_pedido_id uuid
    REFERENCES public.delivery_pedidos(id) ON DELETE SET NULL;

-- UNIQUE é a trava da idempotência: dois cliques em "Confirmar entrega"
-- não podem virar duas vendas do mesmo pedido.
CREATE UNIQUE INDEX IF NOT EXISTS vendas_delivery_pedido_id_key
  ON public.vendas (delivery_pedido_id)
  WHERE delivery_pedido_id IS NOT NULL;

COMMENT ON COLUMN public.vendas.delivery_pedido_id IS
  'Pedido de delivery que originou esta venda. UNIQUE: um pedido rende uma venda só, por mais vezes que o botão seja clicado.';

-- ── 2. Fechar o pedido de delivery: virar venda, em uma transação ──
CREATE OR REPLACE FUNCTION public.registrar_venda_delivery(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant  uuid := public.tenant_atual_id();
  v_pedido  public.delivery_pedidos;
  v_venda   text;
  v_existe  text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sessão sem estabelecimento.';
  END IF;

  -- FOR UPDATE: dois operadores clicando ao mesmo tempo em telas
  -- diferentes esperam um pelo outro em vez de gravarem duas vendas.
  SELECT * INTO v_pedido
    FROM public.delivery_pedidos
   WHERE id = p_pedido_id AND tenant_id = v_tenant
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de delivery não encontrado.';
  END IF;

  IF v_pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Pedido cancelado não vira venda.';
  END IF;

  -- Já fechado: devolve a venda que existe. Não é erro — é o segundo
  -- clique, o eco do realtime, ou o operador voltando na tela.
  SELECT id INTO v_existe
    FROM public.vendas
   WHERE delivery_pedido_id = p_pedido_id AND tenant_id = v_tenant;
  IF v_existe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'venda_id', v_existe, 'ja_existia', true);
  END IF;

  v_venda := 'dlv_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.vendas (
    id, comanda, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste,
    total, cashier, at, tenant_id, origem, delivery_pedido_id
  ) VALUES (
    v_venda,
    -- O número do delivery é a comanda desta venda: é por ele que o dono
    -- reencontra o pedido quando o cliente liga reclamando.
    v_pedido.numero,
    NULL,
    v_pedido.subtotal,
    false,
    -- A taxa de ENTREGA ocupa o lugar da taxa de serviço no total. Não é
    -- gorjeta, mas é a única linha de acréscimo que a venda tem, e
    -- somá-la ao subtotal esconderia quanto foi comida e quanto foi frete.
    COALESCE(v_pedido.taxa_entrega, 0),
    0,
    v_pedido.total,
    'delivery',
    now(),
    v_tenant,
    'delivery',
    v_pedido.id
  );

  INSERT INTO public.venda_itens (venda_id, product_id, nome, preco, qtd, tenant_id)
  SELECT v_venda, i.produto_id, i.nome, i.preco_unit, i.qtd, v_tenant
    FROM public.delivery_pedido_itens i
   WHERE i.pedido_id = p_pedido_id AND i.tenant_id = v_tenant;

  -- Pagamento é na entrega: a forma já foi escolhida pelo cliente no
  -- cardápio, e o valor é o total. Sem esta linha o fechamento de caixa
  -- não sabe em qual meio o dinheiro entrou.
  INSERT INTO public.venda_pagamentos (venda_id, metodo, valor, tenant_id)
  VALUES (v_venda, v_pedido.forma_pagamento, v_pedido.total, v_tenant);

  -- O espelho em `pending` cumpriu o papel dele (a cozinha já produziu) e
  -- não é mais peça financeira: quem fecha a venda do delivery é esta
  -- função. Deixá-lo aberto faria o pedido entregue continuar contado
  -- como comanda em aberto para sempre.
  IF v_pedido.pending_id IS NOT NULL THEN
    DELETE FROM public.pending
     WHERE id = v_pedido.pending_id AND tenant_id = v_tenant;
  END IF;

  RETURN jsonb_build_object('ok', true, 'venda_id', v_venda, 'ja_existia', false);
END;
$$;

COMMENT ON FUNCTION public.registrar_venda_delivery(uuid) IS
  'Fecha um pedido de delivery como venda (origem=delivery), em uma transação. Idempotente: o mesmo pedido devolve sempre a mesma venda.';

-- Só quem está logado no estabelecimento fecha venda. O anon da vitrine
-- não tem nada que ver com isto.
REVOKE EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 3. Conferência ao vivo — aborta se faltar ponta. Não escreve dado.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_def text;
  n     integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendas'
     AND column_name IN ('origem', 'delivery_pedido_id');
  IF n <> 2 THEN
    RAISE EXCEPTION 'Venda do delivery: faltam colunas em vendas (origem, delivery_pedido_id).';
  END IF;

  -- Toda venda que já existia é do PDV: era o único caminho que havia.
  SELECT count(*) INTO n FROM public.vendas WHERE origem NOT IN ('pdv', 'delivery');
  IF n > 0 THEN
    RAISE EXCEPTION 'Venda do delivery: % venda(s) com origem fora dos dois valores conhecidos.', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'vendas_delivery_pedido_id_key'
  ) THEN
    RAISE EXCEPTION 'Venda do delivery: falta o UNIQUE por pedido — dois cliques renderiam duas vendas.';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'registrar_venda_delivery';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC não foi criada.';
  END IF;
  IF position('FOR UPDATE' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: sem FOR UPDATE, dois operadores simultâneos gravariam duas vendas.';
  END IF;
  IF position('ja_existia' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC precisa devolver a venda já existente em vez de criar outra.';
  END IF;
  IF position('Pedido cancelado não vira venda' in v_def) = 0 THEN
    RAISE EXCEPTION 'Venda do delivery: falta a guarda de pedido cancelado.';
  END IF;
  IF has_function_privilege('public', 'public.registrar_venda_delivery(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Venda do delivery: a RPC não devia ter EXECUTE para PUBLIC — o anon da vitrine não fecha venda.';
  END IF;

  RAISE NOTICE 'Venda do delivery: registro próprio (origem=delivery) no ar.';
END;
$conf$;


-- ══════════════════════════════════════════════════════════════════════
-- [25/25]  20261003_delivery_whatsapp_no_aceite.sql
-- ══════════════════════════════════════════════════════════════════════
DO $aplicando$ BEGIN RAISE NOTICE '▶ APLICANDO [25/25] 20261003_delivery_whatsapp_no_aceite.sql'; END $aplicando$;

-- ══════════════════════════════════════════════════════════════════
-- Interruptor: confirmar no WhatsApp ao aceitar o pedido.
--
-- Ao aceitar um pedido, a aba Delivery abre o WhatsApp do cliente com a
-- confirmação já escrita — o operador confere e envia. Grátis, sem
-- integração, sem API paga: é o próprio navegador abrindo wa.me.
--
-- Nasce DESLIGADO de propósito. É uma aba que se abre sozinha, e isso só
-- pode acontecer para quem pediu: quem aceita dez pedidos seguidos numa
-- correria não quer dez abas de WhatsApp na cara.
--
-- Por que no banco e não no navegador: é decisão do ESTABELECIMENTO, não
-- do aparelho. Guardada no localStorage, o dono ligaria no computador do
-- caixa e o pedido aceito pelo celular não avisaria ninguém.
--
-- RLS: nenhuma tabela nova. A coluna entra em config_delivery, que já tem
-- RLS por tenant.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS whatsapp_no_aceite boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.whatsapp_no_aceite IS
  'Ao aceitar um pedido, abrir o WhatsApp do cliente com a confirmação escrita? Desligado por padrão — abre uma aba por pedido.';

DO $conf$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'config_delivery'
     AND column_name = 'whatsapp_no_aceite' AND column_default LIKE '%false%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'WhatsApp no aceite: a coluna precisa existir e nascer DESLIGADA — ninguém deve começar a ver abas abrindo sozinhas.';
  END IF;

  RAISE NOTICE 'Confirmação no WhatsApp ao aceitar: interruptor no ar (desligado).';
END;
$conf$;


-- ══════════════════════════════════════════════════════════════════════
-- Fim. Se você está lendo isto sem nenhum erro acima, as 25
-- migrações passaram e cada autoteste conferiu o próprio resultado.
-- ══════════════════════════════════════════════════════════════════════
DO $fim$ BEGIN
  RAISE NOTICE '────────────────────────────────────────────────';
  RAISE NOTICE '✅ 25 migrações aplicadas e conferidas.';
  RAISE NOTICE 'Agora o delivery tem: retirada no local, CEP opcional,';
  RAISE NOTICE 'histórico sem conta, telefone obrigatório, via saindo';
  RAISE NOTICE 'sozinha na impressora e venda com registro próprio.';
  RAISE NOTICE '────────────────────────────────────────────────';
END $fim$;

COMMIT;
