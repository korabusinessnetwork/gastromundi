-- ══════════════════════════════════════════════════════════════════
-- F008 — Estoque: baixa automática + alertas de mínimo
--
-- Contexto: baixar_estoque (20260705) só fazia UPDATE e RETURNS void.
-- Para o app decidir se uma baixa cruzou o mínimo (e disparar o
-- alerta do Jarvas) sem uma segunda leitura ao banco — o que abriria
-- uma janela de corrida entre a baixa e a checagem — a RPC passa a
-- devolver quantidade e mínimo já atualizados, na mesma transação.
--
-- Precisa DROP + CREATE (não CREATE OR REPLACE) porque o tipo de
-- retorno muda de void para uma linha (quantidade, minimo).
-- ══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.baixar_estoque(bigint, numeric);

CREATE FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- SECURITY DEFINER contorna a RLS; checagem de role explícita aqui
  IF (auth.jwt() ->> 'role') NOT IN ('caixa', 'gerente', 'admin') THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  RETURN QUERY
  UPDATE public.estoque e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.produto_id = p_produto_id
  RETURNING e.quantidade, e.minimo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric) TO authenticated;
