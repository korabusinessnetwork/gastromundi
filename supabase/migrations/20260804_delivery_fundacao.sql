-- ══════════════════════════════════════════════════════════════════
-- DELIVERY — Fase 1 (fundação): tabelas + RLS + RPCs públicas
-- Spec: docs/03_REGRAS_DE_NEGOCIO/DELIVERY.md
--
-- ┌─ O QUE ESTA MIGRATION FAZ ───────────────────────────────────────┐
-- │ 1. Tabelas novas (todas com tenant_id NOT NULL + RLS RESTRICTIVE │
-- │    tenant_id = tenant_atual_id()): config_delivery,               │
-- │    produto_delivery, grupos_complemento, complementos,            │
-- │    delivery_pedidos, delivery_pedido_itens.                       │
-- │ 2. Três RPCs SECURITY DEFINER — a ÚNICA superfície pública        │
-- │    (anon), resolvidas por SLUG (o subdomínio), nunca por JWT:     │
-- │      • cardapio_publico(slug)                                     │
-- │      • calcular_taxa_entrega(slug, cep, bairro)                   │
-- │      • criar_pedido_delivery(slug, payload)                       │
-- │    Preço e taxa são SEMPRE recalculados no servidor; nada vindo   │
-- │    do cliente é confiado. Mesmo padrão de branding_por_slug       │
-- │    (20260742): anon lê só o que é público, por slug exato.        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ SEGURANÇA (Leva 16) ────────────────────────────────────────────┐
-- │ • Tabelas: anon NÃO acessa direto (RLS + sem GRANT). Só as 3 RPCs │
-- │   têm GRANT EXECUTE TO anon.                                      │
-- │ • criar_pedido_delivery insere com tenant_id = tenant RESOLVIDO   │
-- │   do slug (anon não tem tenant_atual_id()); grava também em       │
-- │   `pending` (Realtime) no formato { id, name, price, qty, obs }   │
-- │   pra o pedido aparecer na Cozinha / mini-painel.                 │
-- │ • Guardas fail-closed com COALESCE (NULL vira false).            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente
--    (CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DO-guards).
-- ⚠️ RLS precisa estar habilitada — esta migration já faz ENABLE ROW
--    LEVEL SECURITY em cada tabela nova.
-- ⚠️ STORAGE: criar manualmente o bucket público `delivery-fotos` no
--    painel (fotos otimizadas WebP; Cache-Control agressivo). O bucket
--    não é criado por SQL de migration.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — TABELAS
-- ══════════════════════════════════════════════════════════════════

-- ── config_delivery — 1 linha por tenant ──────────────────────────
-- faixas_taxa (jsonb): [{ "tipo":"bairro","bairro":"Centro","taxa":5 },
--                       { "tipo":"cep","cep_ini":"90000000","cep_fim":"90999999","taxa":8 }]
-- horario (jsonb): livre p/ a UI (ex.: por dia da semana). Sem regra
-- rígida nesta fase — `aberto` é o interruptor efetivo do checkout.
CREATE TABLE IF NOT EXISTS public.config_delivery (
  tenant_id         uuid        PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  aberto            boolean     NOT NULL DEFAULT false,
  pedido_minimo     numeric     NOT NULL DEFAULT 0,
  tempo_preparo_min integer     NOT NULL DEFAULT 30,
  horario           jsonb       NOT NULL DEFAULT '{}',
  faixas_taxa       jsonb       NOT NULL DEFAULT '[]',
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── produto_delivery — foto/descrição por produto (products só tem emoji)
CREATE TABLE IF NOT EXISTS public.produto_delivery (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id  bigint      NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  foto_url    text,
  descricao   text,
  disponivel  boolean     NOT NULL DEFAULT true,
  ordem       integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, produto_id)
);

-- ── grupos_complemento — ex.: "Ponto da carne" (obrig., 1-1), "Adicionais" (0-N)
CREATE TABLE IF NOT EXISTS public.grupos_complemento (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id   bigint      NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nome         text        NOT NULL,
  min_escolhas integer     NOT NULL DEFAULT 0,
  max_escolhas integer     NOT NULL DEFAULT 1,
  ordem        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── complementos — itens de um grupo (ex.: +bacon R$4) ─────────────
CREATE TABLE IF NOT EXISTS public.complementos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_id    uuid        NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  preco       numeric     NOT NULL DEFAULT 0,
  disponivel  boolean     NOT NULL DEFAULT true,
  ordem       integer     NOT NULL DEFAULT 0
);

-- ── delivery_pedidos — histórico próprio do delivery ───────────────
-- pending_id: liga ao registro em `pending` (Realtime) que a Cozinha/
-- mini-painel consome. forma_pagamento: 'dinheiro'|'pix'|'cartao'.
CREATE TABLE IF NOT EXISTS public.delivery_pedidos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero              text        NOT NULL,
  cliente_nome        text        NOT NULL,
  cliente_telefone    text,
  cep                 text,
  bairro              text,
  endereco            text        NOT NULL,
  complemento_endereco text,
  subtotal            numeric     NOT NULL,
  taxa_entrega        numeric     NOT NULL DEFAULT 0,
  total               numeric     NOT NULL,
  forma_pagamento     text        NOT NULL,
  troco_para          numeric,
  levar_maquininha    boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'recebido',
  pending_id          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── delivery_pedido_itens — itens do pedido (com complementos) ─────
CREATE TABLE IF NOT EXISTS public.delivery_pedido_itens (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid    NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id    uuid    NOT NULL REFERENCES public.delivery_pedidos(id) ON DELETE CASCADE,
  produto_id   bigint  REFERENCES public.products(id) ON DELETE SET NULL,
  combo_id     uuid    REFERENCES public.combos(id) ON DELETE SET NULL,
  nome         text    NOT NULL,
  qtd          integer NOT NULL DEFAULT 1,
  preco_unit   numeric NOT NULL,
  complementos jsonb   NOT NULL DEFAULT '[]',
  obs          text
);

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS (gestão só pelo próprio tenant; anon nunca toca tabela)
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'config_delivery', 'produto_delivery', 'grupos_complemento',
    'complementos', 'delivery_pedidos', 'delivery_pedido_itens'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
    -- Policy RESTRICTIVE de isolamento por tenant (mesmo padrão da
    -- 20260724). SECURITY DEFINER das RPCs públicas roda como owner e
    -- ignora RLS — por isso o anon lê/escreve o cardápio SÓ via RPC.
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I', tbl || '_tenant_isolamento', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL '
      'USING (tenant_id = public.tenant_atual_id()) '
      'WITH CHECK (tenant_id = public.tenant_atual_id())',
      tbl || '_tenant_isolamento', tbl);
  END LOOP;
END;
$$;

-- ── Índices (RLS mais barata + joins do cardápio) ──────────────────
CREATE INDEX IF NOT EXISTS produto_delivery_tenant_idx      ON public.produto_delivery (tenant_id);
CREATE INDEX IF NOT EXISTS produto_delivery_produto_idx     ON public.produto_delivery (produto_id);
CREATE INDEX IF NOT EXISTS grupos_complemento_tenant_idx    ON public.grupos_complemento (tenant_id);
CREATE INDEX IF NOT EXISTS grupos_complemento_produto_idx   ON public.grupos_complemento (produto_id);
CREATE INDEX IF NOT EXISTS complementos_tenant_idx          ON public.complementos (tenant_id);
CREATE INDEX IF NOT EXISTS complementos_grupo_idx           ON public.complementos (grupo_id);
CREATE INDEX IF NOT EXISTS delivery_pedidos_tenant_idx      ON public.delivery_pedidos (tenant_id);
CREATE INDEX IF NOT EXISTS delivery_pedidos_status_idx      ON public.delivery_pedidos (tenant_id, status);
CREATE INDEX IF NOT EXISTS delivery_pedido_itens_tenant_idx ON public.delivery_pedido_itens (tenant_id);
CREATE INDEX IF NOT EXISTS delivery_pedido_itens_pedido_idx ON public.delivery_pedido_itens (pedido_id);

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — RPCs PÚBLICAS (SECURITY DEFINER, resolvidas por slug)
-- ══════════════════════════════════════════════════════════════════

-- ── Helper interno: slug → tenant_id (não exposto ao anon) ─────────
CREATE OR REPLACE FUNCTION public.delivery_tenant_por_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id
  FROM public.tenants t
  WHERE t.slug = lower(btrim(coalesce(p_slug, '')))
  LIMIT 1;
$$;

-- ── 1. cardapio_publico(slug) — vitrine pública ───────────────────
-- Retorna jsonb: { aberto, pedido_minimo, tempo_preparo_min,
--   produtos:[{ produto_id, nome, preco, categoria, foto_url, descricao,
--     grupos:[{ id, nome, min, max, itens:[{ id, nome, preco }] }] }],
--   combos:[{ combo_id, nome, preco }] }
-- Só produtos active + disponivel_delivery; só complementos disponíveis.
-- Slug desconhecido → NULL (não enumera tenants).
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
            SELECT jsonb_agg(jsonb_build_object(
              'id',   g.id,
              'nome', g.nome,
              'min',  g.min_escolhas,
              'max',  g.max_escolhas,
              'itens', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'preco', c.preco)
                                 ORDER BY c.ordem, c.nome)
                FROM public.complementos c
                WHERE c.grupo_id = g.id AND c.tenant_id = v_tenant AND c.disponivel
              ), '[]'::jsonb)
            ) ORDER BY g.ordem, g.nome)
            FROM public.grupos_complemento g
            WHERE g.produto_id = p.id AND g.tenant_id = v_tenant
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

-- ── 2. calcular_taxa_entrega(slug, cep, bairro) ───────────────────
-- ViaCEP (front, grátis) resolve o bairro a partir do CEP; aqui casamos
-- com as faixas cadastradas (por CEP ou por bairro). Retorna jsonb:
--   { ok:true, taxa, bairro }  |  { ok:false, motivo:'fora_area' }
-- Preço/taxa NUNCA vêm do cliente — sempre da config do tenant.
CREATE OR REPLACE FUNCTION public.calcular_taxa_entrega(
  p_slug   text,
  p_cep    text,
  p_bairro text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_tenant uuid := public.delivery_tenant_por_slug(p_slug);
  v_cep    text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_bairro text := lower(btrim(coalesce(p_bairro, '')));
  v_faixas jsonb;
  v_faixa  jsonb;
  v_taxa   numeric;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tenant_invalido');
  END IF;

  SELECT faixas_taxa INTO v_faixas FROM public.config_delivery WHERE tenant_id = v_tenant;
  IF v_faixas IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fora_area');
  END IF;

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

-- ── 3. criar_pedido_delivery(slug, payload) ───────────────────────
-- payload jsonb esperado:
--   { cliente:{ nome, telefone }, entrega:{ cep, bairro, endereco, complemento },
--     pagamento:{ forma:'dinheiro'|'pix'|'cartao', troco_para?, levar_maquininha? },
--     itens:[{ produto_id?|combo_id?, qtd, complementos?:[uuid], obs? }] }
-- SERVIDOR RECALCULA tudo: preço de cada item (products/combos +
-- complementos disponíveis do tenant) e a taxa (faixas do tenant). O
-- payload NUNCA define preço/total. Grava delivery_pedidos + itens e
-- espelha em `pending` (Realtime) no formato { id, name, price, qty, obs }.
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

-- ══════════════════════════════════════════════════════════════════
-- PARTE 4 — GRANTS
-- ══════════════════════════════════════════════════════════════════
-- As 3 RPCs públicas: anon (vitrine) + authenticated. O helper de slug
-- fica interno (sem GRANT a anon — as RPCs já o chamam como definer).
REVOKE EXECUTE ON FUNCTION public.delivery_tenant_por_slug(text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.cardapio_publico(text)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calcular_taxa_entrega(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.criar_pedido_delivery(text, jsonb)     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.cardapio_publico(text)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calcular_taxa_entrega(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_delivery(text, jsonb)     TO anon, authenticated;

-- ── Conferência: as tabelas NÃO devem estar acessíveis ao anon ─────
-- (anon só alcança o delivery via as 3 RPCs acima).
SELECT tablename,
       CASE WHEN has_table_privilege('anon', 'public.'||tablename, 'SELECT')
            THEN '❌ anon lê a tabela' ELSE '✅ fechada' END AS anon_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('config_delivery','produto_delivery','grupos_complemento',
                    'complementos','delivery_pedidos','delivery_pedido_itens')
ORDER BY tablename;
