-- ══════════════════════════════════════════════════════════════════
-- TD009 (etapa 2) — Backfill do histórico de sales → vendas/venda_itens/venda_pagamentos
--
-- Espelha exatamente src/lib/vendas.js (mapearVendaParaLinhas): mesmos
-- campos, mesmos defaults (COALESCE). Idempotente — pode ser rodada
-- mais de uma vez sem duplicar dados:
--   - vendas: ON CONFLICT (id) DO NOTHING (vendas já gravadas pela
--     gravação dupla da etapa 1 são ignoradas).
--   - venda_itens / venda_pagamentos: só inserem para vendas que
--     ainda não têm NENHUMA linha filha (NOT EXISTS) — evita duplicar
--     tanto em vendas já dual-written quanto em reexecuções deste
--     próprio backfill.
--
-- Vendas sem total (data->>'total' nulo) são puladas — não são uma
-- venda finalizada válida.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Cabeçalho da venda ────────────────────────────────────────────
INSERT INTO public.vendas (id, comanda, mesa, subtotal, taxa_servico, valor_taxa, valor_ajuste, total, cashier, at)
SELECT
  s.id,
  s.data->>'comanda',
  s.data->>'mesa',
  (s.data->>'subtotal')::numeric,
  COALESCE((s.data->>'taxaServico')::boolean, false),
  COALESCE((s.data->>'valorTaxa')::numeric, 0),
  COALESCE((s.data->>'valorAjuste')::numeric, 0),
  (s.data->>'total')::numeric,
  s.data->>'cashier',
  s.at
FROM public.sales s
WHERE (s.data->>'total') IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ── 2. Itens ─────────────────────────────────────────────────────────
-- product_id só quando o valor é numérico E existe em products (senão
-- NULL — o nome snapshot preserva a informação), mesma regra do mapper.
INSERT INTO public.venda_itens (venda_id, product_id, nome, preco, qtd, cancelado, motivo_cancelamento, cancelado_por)
SELECT
  s.id,
  CASE
    WHEN (item->>'id') ~ '^[0-9]+$' AND (item->>'id')::bigint IN (SELECT id FROM public.products)
      THEN (item->>'id')::bigint
    ELSE NULL
  END,
  COALESCE(item->>'name', ''),
  COALESCE((item->>'price')::numeric, 0),
  COALESCE((item->>'qty')::numeric, 1),
  COALESCE((item->>'cancelado')::boolean, false),
  item->>'motivoCancelamento',
  item->>'canceladoPor'
FROM public.sales s
JOIN public.vendas v ON v.id = s.id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.data->'items') = 'array' THEN s.data->'items' ELSE '[]'::jsonb END
) AS item
WHERE NOT EXISTS (SELECT 1 FROM public.venda_itens vi WHERE vi.venda_id = s.id);

-- ── 3. Pagamentos ────────────────────────────────────────────────────
-- Mesmo fallback de normalizarPagamentos (src/utils/pagamentos.js):
-- sales antigas sem array `pagamentos` usam os campos flat
-- metodo/total do topo da venda como um pagamento único.
INSERT INTO public.venda_pagamentos (venda_id, metodo, valor)
SELECT s.id, pag.metodo, pag.valor
FROM public.sales s
JOIN public.vendas v ON v.id = s.id
CROSS JOIN LATERAL (
  SELECT
    COALESCE(elem->>'metodo', s.data->>'metodo')                        AS metodo,
    COALESCE((elem->>'valor')::numeric, (s.data->>'total')::numeric, 0) AS valor
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(s.data->'pagamentos') = 'array' AND jsonb_array_length(s.data->'pagamentos') > 0
        THEN s.data->'pagamentos'
      ELSE jsonb_build_array(jsonb_build_object())
    END
  ) AS elem
) AS pag
WHERE pag.metodo IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.venda_pagamentos vp WHERE vp.venda_id = s.id);

-- ══════════════════════════════════════════════════════════════════
-- Query de CONFERÊNCIA (rode manualmente no SQL Editor após aplicar
-- esta migração) — compara contagem e soma de totais entre sales e
-- vendas, por mês. Divergências grandes indicam problema no backfill.
--
-- SELECT
--   coalesce(sv.mes, vv.mes)   AS mes,
--   sv.qtd_sales, sv.total_sales,
--   vv.qtd_vendas, vv.total_vendas
-- FROM (
--   SELECT to_char(at, 'YYYY-MM') AS mes, count(*) AS qtd_sales,
--          sum((data->>'total')::numeric) AS total_sales
--   FROM public.sales GROUP BY 1
-- ) sv
-- FULL OUTER JOIN (
--   SELECT to_char(at, 'YYYY-MM') AS mes, count(*) AS qtd_vendas,
--          sum(total) AS total_vendas
--   FROM public.vendas GROUP BY 1
-- ) vv USING (mes)
-- ORDER BY mes;
-- ══════════════════════════════════════════════════════════════════
