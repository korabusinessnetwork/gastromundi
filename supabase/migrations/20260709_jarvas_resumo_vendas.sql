-- ══════════════════════════════════════════════════════════════════
-- TD009 (etapa 2) — RPC de resumo de vendas para o assistente do Jarvas
--
-- Contexto: supabase/functions/jarvas-assistente baixava sales inteira
-- (JSONB) e agregava total/por-dia/top-produtos em JavaScript. Com as
-- tabelas relacionais (vendas/venda_itens), essa agregação passa a
-- rodar no Postgres — um único round-trip, sem baixar linha nenhuma
-- de detalhe para o runtime da function.
--
-- Retorna jsonb no MESMO formato já consumido pela function
-- (contexto.vendas_30_dias): { total, numero_de_vendas, por_dia,
-- top_produtos }. Itens cancelados são excluídos do top de produtos.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.jarvas_resumo_vendas(p_desde timestamptz, p_limite_produtos integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT sum(total) FROM public.vendas WHERE at >= p_desde), 0),
    'numero_de_vendas', (SELECT count(*) FROM public.vendas WHERE at >= p_desde),
    'por_dia', COALESCE((
      SELECT jsonb_object_agg(dia, soma) FROM (
        SELECT to_char(at, 'YYYY-MM-DD') AS dia, sum(total) AS soma
        FROM public.vendas
        WHERE at >= p_desde
        GROUP BY 1
      ) d
    ), '{}'::jsonb),
    'top_produtos', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT vi.nome AS nome, sum(vi.qtd) AS unidades, round(sum(vi.preco * vi.qtd), 2) AS receita
        FROM public.venda_itens vi
        JOIN public.vendas v ON v.id = vi.venda_id
        WHERE vi.cancelado = false AND v.at >= p_desde
        GROUP BY vi.nome
        ORDER BY receita DESC
        LIMIT p_limite_produtos
      ) t
    ), '[]'::jsonb)
  );
$$;

-- Mesma convenção de acesso das tabelas de origem (RLS de vendas/
-- venda_itens já restringe a caixa/gerente/admin); a edge function
-- também valida role admin/gerente antes de chamar esta RPC.
GRANT EXECUTE ON FUNCTION public.jarvas_resumo_vendas(timestamptz, integer) TO authenticated;
