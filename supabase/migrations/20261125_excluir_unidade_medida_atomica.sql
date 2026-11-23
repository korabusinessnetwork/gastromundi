-- ══════════════════════════════════════════════════════════════════
-- excluir_unidade_medida: desvincular dos produtos e excluir, ou nada
-- (tarefa 1.3 do plano de refatoração, ADR-015)
--
-- O DEFEITO
-- Excluir uma unidade de medida, no computador (ConfiguracoesView) e no
-- celular (SecaoUnidades), rodava quatro passos soltos do navegador:
-- limpa a unidade de estoque dos produtos, limpa a de consumo, tira a
-- unidade da lista de compra de cada produto, e só então apaga a unidade.
--
-- Pior que a queda de rede no meio era o caso de PERMISSÃO. As policies de
-- produção deixam GERENTE alterar produtos, mas só ADMIN apagar unidade
-- (unidades_write_admin). Um DELETE barrado pela RLS não dá erro: afeta
-- zero linhas. Então, com um gerente, os três primeiros passos passavam, o
-- quarto não fazia nada, e a tela dizia "excluída". A unidade continuava
-- cadastrada e os produtos tinham perdido a unidade deles.
--
-- A CORREÇÃO
-- Uma função só, numa transação. O DELETE confere se apagou a unidade; se
-- não apagou, levanta erro e a transação desfaz também os produtos.
--
-- SECURITY INVOKER: cada passo roda com as policies que já existem. Nenhum
-- privilégio novo, e o recorte por estabelecimento vale em todos os UPDATE
-- (a RESTRICTIVE de tenant em products) sem precisar repetir aqui.
--
-- Comportamento mantido de propósito: a unidade é procurada pela
-- abreviação, sem olhar o tipo. É o que as duas telas faziam (TD022).
--
-- Recusas:
--   P0002  a unidade não existe mais (ou é de outro estabelecimento)
--   42501  o usuário não pode excluir unidades (o DELETE não apagou nada)
--
-- Idempotente: CREATE OR REPLACE. RODAR MANUALMENTE no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.excluir_unidade_medida(p_unidade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_abbr    text;
  v_apagada uuid;
BEGIN
  SELECT u.abreviacao INTO v_abbr FROM public.unidades_medida u WHERE u.id = p_unidade_id;
  IF v_abbr IS NULL THEN
    RAISE EXCEPTION 'Esta unidade não existe mais. Recarregue a lista.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.products SET unidade_estoque = '' WHERE unidade_estoque = v_abbr;

  UPDATE public.products SET unidade_consumo = NULL WHERE unidade_consumo = v_abbr;

  UPDATE public.products p
     SET unidades_compra = (
           SELECT COALESCE(jsonb_agg(c), '[]'::jsonb)
             FROM jsonb_array_elements(p.unidades_compra) AS c
            WHERE c->>'unidade' IS DISTINCT FROM v_abbr
         )
   WHERE p.unidades_compra @> jsonb_build_array(jsonb_build_object('unidade', v_abbr));

  -- O DELETE por último, e conferido: zero linhas aqui é a RLS recusando
  -- em silêncio, e o RAISE desfaz os UPDATE acima.
  DELETE FROM public.unidades_medida WHERE id = p_unidade_id RETURNING id INTO v_apagada;
  IF v_apagada IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não pode excluir unidades de medida. Peça ao administrador.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_unidade_medida(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_unidade_medida(uuid) TO authenticated;
