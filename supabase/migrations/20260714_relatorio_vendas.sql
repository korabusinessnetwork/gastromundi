-- ══════════════════════════════════════════════════════════════════
-- F011 — Relatórios (vendas, margem, desempenho)
-- docs/03_REGRAS_DE_NEGOCIO/RELATORIOS.md
--
-- Contexto: relatórios são somente leitura e agregam as tabelas já
-- normalizadas (TD009: vendas/venda_itens/venda_pagamentos), pelo
-- mesmo motivo da RPC jarvas_resumo_vendas (20260709) — agregação no
-- Postgres, sem baixar o blob `sales` nem trazer linha de detalhe
-- para o cliente. Esta RPC aceita um intervalo (início/fim) explícito
-- para permitir período customizado e comparação com o período
-- anterior (o app chama a mesma RPC duas vezes, uma por período).
--
-- Retorna: faturamento, número de vendas, ticket médio, série diária,
-- total por método de pagamento e top produtos por receita (itens
-- cancelados excluídos). Custo/margem NÃO entra aqui: não há coluna
-- de custo em public.products hoje (só existe ficha técnica manual,
-- guardada em public.config); a margem é calculada no cliente
-- cruzando este retorno com a ficha técnica, e sinalizada como
-- indisponível quando o produto não tem ficha (ver src/lib/relatorios.js).
-- ══════════════════════════════════════════════════════════════════

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

-- Mesma convenção de acesso das tabelas de origem (vendas/venda_itens/
-- venda_pagamentos já restringem a caixa/gerente/admin via RLS);
-- relatórios financeiros/margem ficam restritos a gerente/admin na UI.
GRANT EXECUTE ON FUNCTION public.relatorio_vendas(timestamptz, timestamptz, integer) TO authenticated;
