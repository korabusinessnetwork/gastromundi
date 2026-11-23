-- ══════════════════════════════════════════════════════════════════
-- salvar_subproduto: o subproduto e o saldo dele gravam juntos, ou nada
-- (tarefa 1.6 do plano de refatoração, ADR-015)
--
-- O DEFEITO
-- `SubprodutosView.jsx` gravava em duas chamadas: o subproduto, depois o
-- saldo em `estoque_subprodutos`. Na criação, se a segunda falhasse, o
-- subproduto já existia e a tela mostrava erro; o operador clicava de novo
-- e criava um SEGUNDO subproduto com o mesmo nome. Na edição, o cadastro
-- mudava e o saldo ficava o antigo.
--
-- A CORREÇÃO
-- Uma função só, numa transação. SECURITY INVOKER: as policies que já
-- existem continuam valendo (subproduto, gerente e admin; saldo, caixa,
-- gerente e admin; tudo isolado por estabelecimento). Nenhum privilégio novo.
--
-- Mantido de propósito: subproduto que deixa de controlar estoque NÃO tem o
-- saldo apagado, a tela só para de gravá-lo, como sempre foi.
--
-- Recusas:
--   P0001  nome vazio, preço inválido, ou saldo/mínimo inválido
--   P0002  subproduto para editar não existe (ou a RLS escondeu a linha)
--   42501  papel sem permissão (RLS, vem do Postgres)
--
-- Idempotente: CREATE OR REPLACE. RODAR MANUALMENTE no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.salvar_subproduto(
  p_id               uuid,
  p_nome             text,
  p_categoria        text,
  p_preco            numeric,
  p_unidade_medida   text,
  p_controla_estoque boolean,
  p_ativo            boolean,
  p_quantidade       numeric,
  p_minimo           numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'Informe o nome.' USING ERRCODE = 'P0001';
  END IF;
  -- NaN em numeric é ordenado como o MAIOR valor e passaria por ">= 0".
  IF p_preco IS NULL OR p_preco = 'NaN'::numeric OR p_preco < 0 THEN
    RAISE EXCEPTION 'Preço inválido.' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_controla_estoque, false) THEN
    IF p_quantidade IS NULL OR p_quantidade = 'NaN'::numeric OR p_quantidade < 0 THEN
      RAISE EXCEPTION 'Quantidade em estoque inválida.' USING ERRCODE = 'P0001';
    END IF;
    IF p_minimo IS NULL OR p_minimo = 'NaN'::numeric OR p_minimo < 0 THEN
      RAISE EXCEPTION 'Estoque mínimo inválido.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.subprodutos (nome, categoria, preco, unidade_medida, controla_estoque, ativo, updated_at)
    VALUES (btrim(p_nome), p_categoria, p_preco, p_unidade_medida, COALESCE(p_controla_estoque, false), COALESCE(p_ativo, true), now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.subprodutos
       SET nome = btrim(p_nome),
           categoria = p_categoria,
           preco = p_preco,
           unidade_medida = p_unidade_medida,
           controla_estoque = COALESCE(p_controla_estoque, false),
           ativo = COALESCE(p_ativo, true),
           updated_at = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Este subproduto não existe mais, ou seu usuário não pode alterá-lo.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF COALESCE(p_controla_estoque, false) THEN
    INSERT INTO public.estoque_subprodutos AS e (subproduto_id, quantidade, minimo, updated_at)
    VALUES (v_id, p_quantidade, p_minimo, now())
    ON CONFLICT (subproduto_id) DO UPDATE
       SET quantidade = EXCLUDED.quantidade,
           minimo = EXCLUDED.minimo,
           updated_at = now();
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_subproduto(uuid, text, text, numeric, text, boolean, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_subproduto(uuid, text, text, numeric, text, boolean, boolean, numeric, numeric) TO authenticated;
