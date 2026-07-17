-- ══════════════════════════════════════════════════════════════════
-- F011 — Relatórios: série diária no fuso do estabelecimento
--
-- Bug: a série 'por_dia' agrupava com to_char(at, 'YYYY-MM-DD'), que
-- usa o fuso da sessão do banco (UTC no Supabase). Vendas feitas após
-- as 21h no Brasil (UTC-3) caíam no dia seguinte do gráfico, enquanto
-- os limites do período (calcularPeriodo, src/lib/relatorios.js) são
-- calculados no fuso local do cliente.
--
-- Correção: novo parâmetro p_tz (nome IANA, ex. 'America/Sao_Paulo'),
-- enviado pelo cliente; o agrupamento por dia usa AT TIME ZONE p_tz.
-- Default 'UTC' preserva o comportamento antigo para chamadas antigas.
-- A assinatura de 3 argumentos é removida para não deixar overload
-- ambíguo (o default cobre chamadas sem p_tz).
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.relatorio_vendas(timestamptz, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.relatorio_vendas(p_inicio timestamptz, p_fim timestamptz, p_limite_produtos integer DEFAULT 20, p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'faturamento', COALESCE((SELECT sum(total) FROM public.vendas WHERE at >= p_inicio AND at < p_fim), 0),
    'numero_vendas', (SELECT count(*) FROM public.vendas WHERE at >= p_inicio AND at < p_fim),
    'por_dia', COALESCE((
      SELECT jsonb_agg(d ORDER BY d.dia) FROM (
        SELECT to_char(at AT TIME ZONE p_tz, 'YYYY-MM-DD') AS dia, sum(total) AS total
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

GRANT EXECUTE ON FUNCTION public.relatorio_vendas(timestamptz, timestamptz, integer, text) TO authenticated;
