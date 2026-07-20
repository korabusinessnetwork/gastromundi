-- ══════════════════════════════════════════════════════════════════
-- Delivery — Grupos de complemento REUTILIZÁVEIS (N‑para‑N).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: pode rodar de novo sem erro.
--
-- CONTEXTO / DECISÃO (dono, 2026-07-20):
--   Até aqui um grupo de complementos pertencia a UM único produto
--   (grupos_complemento.produto_id). O dono pediu que um grupo (ex.:
--   "Adicionais") possa ser usado em VÁRIOS produtos — uma biblioteca de
--   grupos reaproveitáveis. Isso vira uma relação N‑para‑N:
--     • o grupo passa a ser do TENANT (não de um produto);
--     • uma tabela de ligação `produto_grupos` diz em quais produtos
--       cada grupo aparece.
--   Editar os itens/nome de um grupo reflete em TODOS os produtos que o
--   usam — que é justamente a vantagem do reuso.
--
-- COMPATIBILIDADE:
--   • grupos_complemento.produto_id deixa de ser obrigatório (DROP NOT
--     NULL). A coluna PERMANECE (histórico / origem do grupo), mas a
--     vitrine passa a ler os grupos de um produto pela tabela de ligação.
--   • BACKFILL: cada grupo antigo (com produto_id) ganha uma linha em
--     produto_grupos, então nada some do cardápio depois de rodar.
--   • A RPC pública cardapio_publico é recriada (CREATE OR REPLACE) só
--     trocando o vínculo grupo↔produto para passar pela ligação. Corpo
--     idêntico ao da 20260804 no resto.
--
-- RLS: produto_grupos nasce com o MESMO padrão das outras tabelas do
--   delivery — RESTRICTIVE de isolamento por tenant (20260804) + as
--   PERMISSIVE de papel (leitura authenticated / escrita gerente-admin,
--   espelhando 20260807). Papel lido de app_metadata.gastro_role.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Grupo deixa de exigir produto_id (agora é do tenant) ─────────
ALTER TABLE public.grupos_complemento
  ALTER COLUMN produto_id DROP NOT NULL;

-- ── 2. Tabela de ligação produto ↔ grupo (N‑para‑N) ─────────────────
CREATE TABLE IF NOT EXISTS public.produto_grupos (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id bigint  NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  grupo_id   uuid    NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  ordem      integer NOT NULL DEFAULT 0,
  UNIQUE (produto_id, grupo_id)
);

CREATE INDEX IF NOT EXISTS produto_grupos_tenant_idx  ON public.produto_grupos (tenant_id);
CREATE INDEX IF NOT EXISTS produto_grupos_produto_idx ON public.produto_grupos (produto_id);
CREATE INDEX IF NOT EXISTS produto_grupos_grupo_idx   ON public.produto_grupos (grupo_id);

-- ── 3. RLS: isolamento por tenant (RESTRICTIVE) + papel (PERMISSIVE) ─
ALTER TABLE public.produto_grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_grupos FORCE ROW LEVEL SECURITY;

-- Tenant (RESTRICTIVE) — mesma forma da 20260804.
DROP POLICY IF EXISTS produto_grupos_tenant_isolamento ON public.produto_grupos;
CREATE POLICY produto_grupos_tenant_isolamento ON public.produto_grupos
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

-- Leitura para qualquer autenticado (tenant já filtrado pela RESTRICTIVE).
DROP POLICY IF EXISTS produto_grupos_select_auth ON public.produto_grupos;
CREATE POLICY produto_grupos_select_auth ON public.produto_grupos
  FOR SELECT USING (auth.role() = 'authenticated');

-- Escrita (vincular/desvincular) só para gerente/admin — dono do cardápio.
-- Papel lido de app_metadata.gastro_role (NÃO da raiz `role` do JWT).
DROP POLICY IF EXISTS produto_grupos_write_gerente_admin ON public.produto_grupos;
CREATE POLICY produto_grupos_write_gerente_admin ON public.produto_grupos
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- ── 4. BACKFILL: grupos antigos (1 produto) → linha na ligação ──────
-- Idempotente pelo UNIQUE(produto_id, grupo_id).
INSERT INTO public.produto_grupos (tenant_id, produto_id, grupo_id, ordem)
SELECT g.tenant_id, g.produto_id, g.id, g.ordem
FROM public.grupos_complemento g
WHERE g.produto_id IS NOT NULL
ON CONFLICT (produto_id, grupo_id) DO NOTHING;

-- ── 5. RPC pública: ler os grupos de um produto pela ligação ────────
-- Corpo idêntico ao da 20260804; muda SÓ o vínculo grupo↔produto, que
-- deixa de ser g.produto_id = p.id e passa pela tabela produto_grupos.
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
