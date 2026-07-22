-- ══════════════════════════════════════════════════════════════════
-- Delivery — Subgrupos aninhados e reutilizáveis (estilo iFood).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: DROP ... IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS.
--
-- CONTEXTO / DECISÃO (dono, 2026-07-22):
--   Um grupo de complementos ("Adicionais") já podia ser reutilizado em
--   vários PRODUTOS (20260809, produto_grupos). Agora o dono quer aninhar
--   grupos DENTRO de grupos — um "grupo com grupos dentro" no estilo iFood
--   (ex.: "Monte seu combo" contém "Bebida", "Acompanhamento" e "Molhos").
--   Cada subgrupo é, ele mesmo, um grupo NORMAL da biblioteca: continua
--   utilizável sozinho em outros produtos. Reutilização em duas dimensões.
--
-- MODELO:
--   Nova tabela de ligação `grupo_subgrupos` (N‑para‑N grupo↔grupo) diz
--   quais grupos-filho pendem de um grupo-pai, com `ordem` para a exibição.
--   Nada muda no espaço de seleção do cliente: cada grupo (raiz ou aninhado)
--   tem id ÚNICO, então a seleção continua um mapa PLANO grupoId→[itemId].
--   O aninhamento muda só a RENDERIZAÇÃO (recursiva) e a caminhada de
--   VALIDAÇÃO (percorre a árvore) — o payload segue uma lista plana de ids.
--
-- INVARIANTE DE SEGURANÇA (min/max por grupo):
--   Todo grupo alcançável na árvore do produto tem seu min/max validado no
--   servidor, em qualquer profundidade (igual ao iFood). A validação usa o
--   FECHO da árvore (grupos_do_produto) em vez do join direto produto_grupos.
--
-- PROTEÇÃO CONTRA RECURSÃO:
--   • grupos_do_produto: CTE recursiva com UNION (dedup quebra ciclo) e
--     teto de nível (nivel < 6).
--   • montar_grupo_delivery: cap de profundidade (p_depth > 6 → NULL).
--   • CHECK (grupo_pai_id <> grupo_filho_id) impede auto-referência direta.
--   O front (admin) ainda barra ciclos ANTES de gravar (UX), mas o servidor
--   é a rede de segurança final.
--
-- RLS: grupo_subgrupos nasce com o MESMO padrão de produto_grupos
--   (20260809) — RESTRICTIVE de isolamento por tenant + PERMISSIVE de papel
--   (leitura authenticated / escrita gerente-admin via app_metadata.gastro_role).
--   LEMBRETE AO DONO: conferir no painel que a RLS ficou ativa após rodar.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela de ligação grupo ↔ subgrupo (N‑para‑N) ────────────────
CREATE TABLE IF NOT EXISTS public.grupo_subgrupos (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_pai_id   uuid    NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  grupo_filho_id uuid    NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 0,
  UNIQUE (grupo_pai_id, grupo_filho_id),
  CONSTRAINT grupo_subgrupos_sem_auto CHECK (grupo_pai_id <> grupo_filho_id)
);

CREATE INDEX IF NOT EXISTS grupo_subgrupos_tenant_idx ON public.grupo_subgrupos (tenant_id);
CREATE INDEX IF NOT EXISTS grupo_subgrupos_pai_idx    ON public.grupo_subgrupos (grupo_pai_id);
CREATE INDEX IF NOT EXISTS grupo_subgrupos_filho_idx  ON public.grupo_subgrupos (grupo_filho_id);

-- ── 2. RLS: isolamento por tenant (RESTRICTIVE) + papel (PERMISSIVE) ─
ALTER TABLE public.grupo_subgrupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_subgrupos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grupo_subgrupos_tenant_isolamento ON public.grupo_subgrupos;
CREATE POLICY grupo_subgrupos_tenant_isolamento ON public.grupo_subgrupos
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

DROP POLICY IF EXISTS grupo_subgrupos_select_auth ON public.grupo_subgrupos;
CREATE POLICY grupo_subgrupos_select_auth ON public.grupo_subgrupos
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS grupo_subgrupos_write_gerente_admin ON public.grupo_subgrupos;
CREATE POLICY grupo_subgrupos_write_gerente_admin ON public.grupo_subgrupos
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- ── 3. Fecho da árvore: todos os grupos alcançáveis por um produto ──
-- Raízes = grupos ligados direto ao produto (produto_grupos). Desce pelos
-- subgrupos (grupo_subgrupos). UNION deduplica (quebra ciclo) e nivel < 6
-- limita a profundidade. Usada pela validação do checkout para aplicar
-- min/max em CADA grupo da árvore, em qualquer profundidade.
CREATE OR REPLACE FUNCTION public.grupos_do_produto(p_produto_id bigint, p_tenant uuid)
RETURNS TABLE(grupo_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE arvore AS (
    SELECT pg.grupo_id AS gid, 0 AS nivel
    FROM public.produto_grupos pg
    WHERE pg.produto_id = p_produto_id AND pg.tenant_id = p_tenant
    UNION
    SELECT gs.grupo_filho_id AS gid, a.nivel + 1
    FROM public.grupo_subgrupos gs
    JOIN arvore a ON a.gid = gs.grupo_pai_id
    WHERE gs.tenant_id = p_tenant AND a.nivel < 6
  )
  SELECT DISTINCT gid FROM arvore;
$$;

-- ── 4. Monta um grupo (com itens e subgrupos) em jsonb, recursivo ───
-- Devolve { id, nome, min, max, itens:[...], subgrupos:[...] }.
-- Cada subgrupo é construído por chamada recursiva, ordenado por `ordem`.
-- Cap de profundidade (p_depth > 6 → NULL) e filtro de NULL nos subgrupos
-- protegem contra ciclo mal configurado. A vitrine consome esse formato.
CREATE OR REPLACE FUNCTION public.montar_grupo_delivery(
  p_grupo_id uuid,
  p_tenant   uuid,
  p_depth    integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo  public.grupos_complemento;
  v_result jsonb;
BEGIN
  IF p_depth > 6 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_grupo
  FROM public.grupos_complemento
  WHERE id = p_grupo_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'id',   v_grupo.id,
    'nome', v_grupo.nome,
    'min',  v_grupo.min_escolhas,
    'max',  v_grupo.max_escolhas,
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'preco', c.preco)
                       ORDER BY c.ordem, c.nome)
      FROM public.complementos c
      WHERE c.grupo_id = v_grupo.id AND c.tenant_id = p_tenant AND c.disponivel
    ), '[]'::jsonb),
    'subgrupos', COALESCE((
      SELECT jsonb_agg(sub ORDER BY sub_ordem)
      FROM (
        SELECT public.montar_grupo_delivery(gs.grupo_filho_id, p_tenant, p_depth + 1) AS sub,
               gs.ordem AS sub_ordem
        FROM public.grupo_subgrupos gs
        WHERE gs.grupo_pai_id = v_grupo.id AND gs.tenant_id = p_tenant
      ) s
      WHERE sub IS NOT NULL
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

-- ── 5. cardapio_publico: grupos-raiz agora vêm por montar_grupo_delivery ──
-- Baseado na 20260814 (mantém a guarda DL5: sem config_delivery → NULL,
-- anti-enumeração). Só troca o jsonb inline dos grupos pela função
-- recursiva, que traz subgrupos aninhados. Ordena os grupos-raiz por
-- produto_grupos.ordem.
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
    'aberto',            COALESCE(v_cfg.aberto, false),
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

-- ── 6. criar_pedido_delivery: validação pelo FECHO da árvore ────────
-- Baseado na 20260812. Muda só o trecho de complementos: em vez de casar
-- pelo join direto produto_grupos (só grupos-raiz), usa o fecho
-- grupos_do_produto (todos os grupos da árvore, em qualquer profundidade).
-- Assim min/max/obrigatoriedade valem para subgrupos também. Preço somado
-- por pertencer a um grupo do fecho. Resto do corpo idêntico.
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
  v_taxa_res := public.calcular_taxa_entrega(
    p_slug,
    p_payload -> 'entrega' ->> 'cep',
    p_payload -> 'entrega' ->> 'bairro'
  );
  IF NOT COALESCE((v_taxa_res->>'ok')::boolean, false) THEN
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
