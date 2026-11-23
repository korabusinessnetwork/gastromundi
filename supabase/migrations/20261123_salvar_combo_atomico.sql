-- ══════════════════════════════════════════════════════════════════
-- salvar_combo: o combo e a composição dele gravam juntos, ou nada grava
-- (tarefa 1.1 do plano de refatoração, ADR-015)
--
-- O DEFEITO
-- `CombosView.jsx` salvava em até cinco chamadas soltas do navegador:
-- atualiza o combo, apaga os subprodutos, apaga os produtos, insere os
-- subprodutos, insere os produtos. Cada uma era uma transação separada.
-- Se a rede caísse depois dos deletes, o combo ficava gravado SEM itens:
-- o PDV passava a vender o combo pelo preço cheio e a baixar só o estoque
-- do item principal. Na criação, o combo nascia sem composição se o insert
-- dos itens falhasse.
--
-- A CORREÇÃO
-- Uma função só. Chamada de função no PostgREST é uma transação: qualquer
-- erro no meio desfaz tudo, inclusive o que já tinha sido apagado.
--
-- ┌─ POR QUE SECURITY INVOKER, E NÃO DEFINER ─────────────────────────┐
-- │ A função roda com as permissões de quem chama. As policies que já │
-- │ valem para as três tabelas continuam valendo sem reescrita:       │
-- │ escrita só para gerente e admin, e a RESTRICTIVE de tenant soma   │
-- │ AND em tudo. Nenhum privilégio novo nasce aqui. DEFINER obrigaria │
-- │ a repetir a checagem de papel e de tenant dentro da função, e     │
-- │ qualquer esquecimento viraria furo.                               │
-- │                                                                   │
-- │ Não depende de 20260923: a composição só é gravada depois do      │
-- │ INSERT ou UPDATE em `combos`, cuja policy já barra quem não é     │
-- │ gerência. A 20260923 fecha outro caminho, a escrita DIRETA em     │
-- │ combo_produtos pela API, e continua necessária por si só.         │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Recusas, com SQLSTATE próprio para a tela distinguir:
--   P0001  nome vazio, combo sem item, ou item com quantidade inválida
--   P0002  combo para editar não existe, ou a RLS escondeu a linha
--          (papel sem permissão: o UPDATE afeta zero linhas, sem erro,
--          então a função transforma o silêncio em recusa)
--   42501  insert recusado pela RLS (vem do próprio Postgres)
--
-- Idempotente: CREATE OR REPLACE. RODAR MANUALMENTE no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.salvar_combo(
  p_combo_id          uuid,
  p_nome              text,
  p_item_principal_id bigint,
  p_modo              text,
  p_preco_total       numeric,
  p_subprodutos       jsonb,
  p_produtos          jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_subs  jsonb := COALESCE(p_subprodutos, '[]'::jsonb);
  v_prods jsonb := COALESCE(p_produtos, '[]'::jsonb);
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome do combo.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(v_subs) <> 'array' OR jsonb_typeof(v_prods) <> 'array' THEN
    RAISE EXCEPTION 'A composição do combo veio em formato inválido.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(v_subs) + jsonb_array_length(v_prods) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um produto ou subproduto ao combo.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_subs || v_prods) AS e
    WHERE COALESCE((e->>'quantidade')::int, 0) < 1
  ) THEN
    RAISE EXCEPTION 'Cada item do combo precisa de quantidade 1 ou mais.' USING ERRCODE = 'P0001';
  END IF;

  IF p_combo_id IS NULL THEN
    INSERT INTO public.combos (nome, item_principal_id, modo, preco_total, ativo, updated_at)
    VALUES (btrim(p_nome), p_item_principal_id, p_modo, p_preco_total, true, now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.combos
       SET nome = btrim(p_nome),
           item_principal_id = p_item_principal_id,
           modo = p_modo,
           preco_total = p_preco_total,
           updated_at = now()
     WHERE id = p_combo_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Este combo não existe mais, ou seu usuário não pode alterá-lo.' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.combo_subprodutos WHERE combo_id = v_id;
    DELETE FROM public.combo_produtos    WHERE combo_id = v_id;
  END IF;

  INSERT INTO public.combo_subprodutos (combo_id, subproduto_id, quantidade, preco_customizado)
  SELECT v_id,
         (e->>'subproduto_id')::uuid,
         (e->>'quantidade')::int,
         NULLIF(e->>'preco_customizado', '')::numeric
    FROM jsonb_array_elements(v_subs) AS e;

  INSERT INTO public.combo_produtos (combo_id, produto_id, quantidade, preco_customizado)
  SELECT v_id,
         (e->>'produto_id')::bigint,
         (e->>'quantidade')::int,
         NULLIF(e->>'preco_customizado', '')::numeric
    FROM jsonb_array_elements(v_prods) AS e;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_combo(uuid, text, bigint, text, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_combo(uuid, text, bigint, text, numeric, jsonb, jsonb) TO authenticated;
