-- ══════════════════════════════════════════════════════════════════
-- importar_nota_fiscal: nota, itens, histórico e saldo numa transação só
-- (tarefa 1.2 do plano de refatoração, ADR-015)
--
-- O DEFEITO
-- `NotasFiscaisTab.jsx` gravava a importação em quatro etapas soltas do
-- navegador: a nota, os itens, o histórico de entradas e, produto por
-- produto, a soma no saldo. Se qualquer etapa depois da primeira falhasse,
-- a nota ficava gravada pela metade: sem itens, ou com itens e sem saldo.
-- E a reimportação para consertar era recusada como "nota já importada",
-- porque a chave de acesso já estava lá. Só restava ajustar o estoque à mão.
--
-- A CORREÇÃO
-- Uma função só. Chamada de função no PostgREST é uma transação: qualquer
-- falha desfaz a nota, os itens, o histórico e todas as somas de saldo.
-- A reimportação volta a ser possível porque nada ficou gravado.
--
-- ┌─ QUEM PODE, E POR QUÊ NÃO MUDA NADA ──────────────────────────────┐
-- │ SECURITY INVOKER: nota, itens e histórico gravam com as policies  │
-- │ que já existem (gerente e admin, isolado por estabelecimento). A  │
-- │ soma no saldo é feita pela `entrada_estoque` (20260901), a mesma  │
-- │ que a tela chamava, que confere papel e estabelecimento por conta │
-- │ própria. Nenhum privilégio novo nasce aqui.                       │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Recusas:
--   P0001  item vinculado sem quantidade para o estoque, ou itens fora
--          do formato (a tela já bloqueia o primeiro caso antes)
--   23505  chave de acesso já importada (índice único, vem do Postgres)
--   42501  papel sem permissão (RLS, vem do Postgres)
--
-- Devolve uma linha por produto que entrou no estoque, com o saldo que o
-- banco confirmou. Nota sem item vinculado devolve uma linha só, com o id
-- da nota e o resto nulo.
--
-- Idempotente: CREATE OR REPLACE. RODAR MANUALMENTE no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.importar_nota_fiscal(
  p_nota  jsonb,
  p_itens jsonb
)
RETURNS TABLE (nota_id uuid, produto_id bigint, quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_nota    uuid;
  v_entrada date;
  v_item    record;
  v_alguma  boolean := false;
BEGIN
  IF p_nota IS NULL OR jsonb_typeof(p_nota) <> 'object'
     OR p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'A nota veio em formato inválido. Recarregue a página e tente de novo.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_itens) AS e
     WHERE NULLIF(e->>'product_id', '') IS NOT NULL
       AND COALESCE(NULLIF(e->>'quantidade_estoque', '')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'Há produto vinculado com quantidade 0 para o estoque. Confira o fator de conversão.' USING ERRCODE = 'P0001';
  END IF;

  -- A data do histórico vem do navegador: é o "hoje" do restaurante, no fuso
  -- de quem opera, quando a nota não traz data de emissão.
  v_entrada := COALESCE(
    NULLIF(p_nota->>'data_emissao', '')::date,
    NULLIF(p_nota->>'data_entrada', '')::date,
    current_date
  );

  INSERT INTO public.notas_fiscais (
    chave_acesso, numero, serie, data_emissao, fornecedor_nome,
    fornecedor_cnpj, valor_total, xml_raw
  ) VALUES (
    NULLIF(p_nota->>'chave_acesso', ''),
    p_nota->>'numero',
    p_nota->>'serie',
    NULLIF(p_nota->>'data_emissao', '')::date,
    p_nota->>'fornecedor_nome',
    p_nota->>'fornecedor_cnpj',
    NULLIF(p_nota->>'valor_total', '')::numeric,
    p_nota->>'xml_raw'
  )
  RETURNING id INTO v_nota;

  INSERT INTO public.notas_fiscais_itens (
    nota_fiscal_id, product_id, descricao_xml, codigo_xml, unidade_xml,
    quantidade, preco_unitario, preco_total, fator_conversao, quantidade_estoque
  )
  SELECT v_nota,
         NULLIF(e->>'product_id', '')::bigint,
         e->>'descricao_xml',
         e->>'codigo_xml',
         e->>'unidade_xml',
         NULLIF(e->>'quantidade', '')::numeric,
         NULLIF(e->>'preco_unitario', '')::numeric,
         NULLIF(e->>'preco_total', '')::numeric,
         NULLIF(e->>'fator_conversao', '')::numeric,
         NULLIF(e->>'quantidade_estoque', '')::numeric
    FROM jsonb_array_elements(p_itens) AS e;

  -- Histórico de entradas: um registro por item vinculado, com o custo
  -- unitário já na unidade do estoque (preço da nota dividido pelo fator).
  INSERT INTO public.estoque_entradas (product_id, nota_fiscal_id, quantidade, preco_unitario, data_entrada)
  SELECT NULLIF(e->>'product_id', '')::bigint,
         v_nota,
         NULLIF(e->>'quantidade_estoque', '')::numeric,
         CASE WHEN COALESCE(NULLIF(e->>'fator_conversao', '')::numeric, 0) > 0
              THEN NULLIF(e->>'preco_unitario', '')::numeric / NULLIF(e->>'fator_conversao', '')::numeric
              ELSE NULLIF(e->>'preco_unitario', '')::numeric
         END,
         v_entrada
    FROM jsonb_array_elements(p_itens) AS e
   WHERE NULLIF(e->>'product_id', '') IS NOT NULL;

  -- Saldo: a mesma função atômica que a tela chamava, item por item. Se uma
  -- delas recusar, a exceção desfaz tudo o que veio antes.
  FOR v_item IN
    SELECT NULLIF(e->>'product_id', '')::bigint AS pid,
           NULLIF(e->>'quantidade_estoque', '')::numeric AS qtd
      FROM jsonb_array_elements(p_itens) AS e
     WHERE NULLIF(e->>'product_id', '') IS NOT NULL
  LOOP
    v_alguma := true;
    RETURN QUERY
    SELECT v_nota, v_item.pid, s.quantidade, s.minimo
      FROM public.entrada_estoque(v_item.pid, v_item.qtd, NULL) AS s;
  END LOOP;

  IF NOT v_alguma THEN
    RETURN QUERY SELECT v_nota, NULL::bigint, NULL::numeric, NULL::numeric;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.importar_nota_fiscal(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_nota_fiscal(jsonb, jsonb) TO authenticated;
