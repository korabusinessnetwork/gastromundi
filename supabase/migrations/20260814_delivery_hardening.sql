-- ══════════════════════════════════════════════════════════════════
-- Delivery — Endurecimento (auditoria DL3 + DL4 + DL5)
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: DROP ... IF EXISTS antes de recriar; CREATE OR REPLACE.
--
-- DL3 — Rate-limit do checkout público (criar_pedido_delivery é anon):
--   sem freio, um script cria centenas de pedidos e polui a Cozinha /
--   mini-painel. Não há IP dentro da RPC, então o lever prático é o
--   TELEFONE do cliente. Um trigger BEFORE INSERT em delivery_pedidos
--   recusa mais de 3 pedidos do MESMO telefone/tenant em 2 minutos.
--   Fica no trigger (não na RPC) para NÃO duplicar o corpo grande da
--   função e valer para qualquer caminho de INSERT.
--
-- DL4 — Vazamento de dados do cliente entre papéis:
--   a 20260807 liberou SELECT em delivery_pedidos/itens para QUALQUER
--   autenticado (auth.role() = 'authenticated'). Isso expõe nome,
--   telefone e endereço do cliente a papéis que não operam entrega
--   (ex.: garçom). Aperta para caixa/gerente/admin — os mesmos que já
--   podem ESCREVER (avançar status). A RESTRICTIVE de tenant continua.
--
-- DL5 — Enumeração de tenants pela vitrine:
--   cardapio_publico devolve NULL para slug inexistente, mas devolve um
--   objeto (mesmo vazio) para um tenant que EXISTE porém não tem delivery
--   configurado. A diferença NULL × objeto deixa descobrir quais slugs
--   existem. Passa a devolver NULL também quando não há config_delivery
--   para o tenant — inexistente e sem-delivery ficam indistinguíveis.
-- ══════════════════════════════════════════════════════════════════

-- ── DL3: trigger de rate-limit por telefone ─────────────────────────
CREATE OR REPLACE FUNCTION public.delivery_rate_limit_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel   text := NULLIF(btrim(coalesce(NEW.cliente_telefone, '')), '');
  v_count integer;
BEGIN
  -- Sem telefone não dá pra correlacionar — deixa passar (o UNIQUE de
  -- numero e as validações da RPC seguem valendo).
  IF v_tel IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.delivery_pedidos
  WHERE tenant_id = NEW.tenant_id
    AND cliente_telefone = NEW.cliente_telefone
    AND created_at > now() - interval '2 minutes';

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde um instante e tente de novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedidos_rate_limit ON public.delivery_pedidos;
CREATE TRIGGER delivery_pedidos_rate_limit
  BEFORE INSERT ON public.delivery_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_rate_limit_check();

-- ── DL4: aperta o SELECT dos pedidos para caixa e acima ─────────────
-- Troca a policy _select_auth (qualquer autenticado) por _select_caixa_up
-- (mesmo conjunto de papéis que já escreve). Papel lido de
-- app_metadata.gastro_role (NÃO da raiz `role` do JWT — ver 20240108).
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['delivery_pedidos', 'delivery_pedido_itens'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_auth', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select_caixa_up', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT '
      'USING ((auth.jwt() -> ''app_metadata'' ->> ''gastro_role'') IN (''caixa'', ''gerente'', ''admin''))',
      tbl || '_select_caixa_up', tbl);
  END LOOP;
END;
$$;

-- ── DL5: cardapio_publico devolve NULL para tenant sem delivery ─────
-- Recria a versão da 20260809 (join via produto_grupos) acrescentando a
-- guarda: sem linha em config_delivery → RETURN NULL (anti-enumeração).
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
            ) ORDER BY pg.ordem, g.ordem, g.nome)
            FROM public.grupos_complemento g
            JOIN public.produto_grupos pg
              ON pg.grupo_id = g.id AND pg.produto_id = p.id AND pg.tenant_id = v_tenant
            WHERE g.tenant_id = v_tenant
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
