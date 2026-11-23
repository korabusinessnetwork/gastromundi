-- ══════════════════════════════════════════════════════════════════
-- CATCH-UP — reaplica as 2 migrations que o diagnóstico achou faltando
-- em produção (2026-07). Ambas idempotentes: rodar de novo é seguro,
-- não duplica nem sobrescreve dado.
--
-- Cole no SQL Editor do Supabase e rode. Não muda nada no front.
--
--   1) 20260714_relatorio_vendas  → função relatorio_vendas() NÃO existia
--      → o relatório de Desempenho (src/lib/relatorios.js:117) quebrava.
--   2) 20260721_produtos_produzivel → coluna products.produzivel NÃO existia
--      → o recurso "item não vai pra cozinha" não persistia.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) relatorio_vendas (idêntica à 20260714) ──────────────────────
CREATE OR REPLACE FUNCTION public.relatorio_vendas(p_inicio timestamptz, p_fim timestamptz, p_limite_produtos integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'faturamento', COALESCE((SELECT sum(total) FROM public.vendas WHERE at >= p_inicio AND at < p_fim), 0),
    'numero_vendas', (SELECT count(*) FROM public.vendas WHERE at >= p_inicio AND at < p_fim),
    'por_dia', COALESCE((
      SELECT jsonb_agg(d ORDER BY d.dia) FROM (
        SELECT to_char(at, 'YYYY-MM-DD') AS dia, sum(total) AS total
        FROM public.vendas
        WHERE at >= p_inicio AND at < p_fim
        GROUP BY 1
      ) d
    ), '[]'::jsonb),
    'por_metodo', COALESCE((
      SELECT jsonb_agg(m) FROM (
        SELECT vp.metodo AS metodo, sum(vp.valor) AS total
        FROM public.venda_pagamentos vp
        JOIN public.vendas v ON v.id = vp.venda_id
        WHERE v.at >= p_inicio AND v.at < p_fim
        GROUP BY vp.metodo
        ORDER BY total DESC
      ) m
    ), '[]'::jsonb),
    'top_produtos', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT vi.product_id AS produto_id, vi.nome AS nome,
               sum(vi.qtd) AS unidades, round(sum(vi.preco * vi.qtd), 2) AS receita
        FROM public.venda_itens vi
        JOIN public.vendas v ON v.id = vi.venda_id
        WHERE vi.cancelado = false AND v.at >= p_inicio AND v.at < p_fim
        GROUP BY vi.product_id, vi.nome
        ORDER BY receita DESC
        LIMIT p_limite_produtos
      ) t
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.relatorio_vendas(timestamptz, timestamptz, integer) TO authenticated;

-- ── 2) products.produzivel (idêntica à 20260721) ───────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS produzivel boolean NOT NULL DEFAULT true;

-- ── Conferência (opcional) — as duas linhas devem voltar ✅ ─────────
SELECT 'relatorio_vendas' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='relatorio_vendas')
            THEN '✅' ELSE '❌' END AS status
UNION ALL
SELECT 'products.produzivel',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='products' AND column_name='produzivel')
            THEN '✅' ELSE '❌' END;
