-- ══════════════════════════════════════════════════════════════════
-- AUDITORIA LEVA D — chave de idempotência nas RPCs de baixa de estoque
--
-- ┌─ O FURO ─────────────────────────────────────────────────────────┐
-- │ `baixar_estoque` e `baixar_estoque_subproduto` são um UPDATE      │
-- │ relativo (`quantidade - p_qtd`): rodar duas vezes desconta duas   │
-- │ vezes. O app fecha venda offline e guarda a RPC numa fila local   │
-- │ (`rpc_baixar_estoque`) para reenviar quando a internet voltar —   │
-- │ e existe uma janela real em que a baixa GRAVOU no banco mas a     │
-- │ resposta se perdeu na queda de conexão. Nesse caso o reenvio      │
-- │ desconta de novo e o estoque some sem venda correspondente.       │
-- │ A dívida estava anotada no código desde a auditoria P3/P4         │
-- │ (AppContext.jsx, "precisa de chave de idempotência na RPC").      │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CORREÇÃO ─────────────────────────────────────────────────────┐
-- │ Cada baixa nasce com um `op_id` (uuid) gerado no app. A RPC       │
-- │ registra esse id numa tabela de controle ANTES de descontar; se   │
-- │ o id já estiver lá, a baixa já foi aplicada e a função devolve o  │
-- │ saldo atual SEM descontar de novo. Insert e update rodam na mesma │
-- │ transação da função, então ou os dois acontecem ou nenhum.        │
-- │                                                                   │
-- │ `p_op_id` tem DEFAULT NULL: chamada sem o id se comporta          │
-- │ exatamente como hoje (desconta sempre). Isso mantém compatíveis   │
-- │ as operações que já estão na fila local dos aparelhos no momento  │
-- │ do deploy — elas foram guardadas sem `op_id` e não podem quebrar. │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: CREATE IF NOT EXISTS + DROP/CREATE FUNCTION + REVOKE/
-- GRANT são todos re-aplicáveis.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Tabela de controle ──────────────────────────────────────────
-- Só a RPC (SECURITY DEFINER, roda como owner) escreve aqui. RLS fica
-- LIGADA e SEM POLICY: nenhum cliente lê nem escreve direto, e a
-- função continua passando porque o owner não é submetido à RLS.
CREATE TABLE IF NOT EXISTS public.estoque_baixas_aplicadas (
  op_id         uuid        PRIMARY KEY,
  tenant_id     uuid,
  produto_id    bigint,
  subproduto_id uuid,
  qtd           numeric     NOT NULL,
  aplicada_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estoque_baixas_aplicadas ENABLE ROW LEVEL SECURITY;

-- A tabela só cresce. O índice existe para a limpeza periódica das
-- linhas velhas — passada a janela de reenvio (a fila local é drenada
-- assim que a internet volta), a linha não tem mais utilidade:
--   DELETE FROM public.estoque_baixas_aplicadas
--    WHERE aplicada_em < now() - interval '90 days';
CREATE INDEX IF NOT EXISTS estoque_baixas_aplicadas_aplicada_em_idx
  ON public.estoque_baixas_aplicadas (aplicada_em);

COMMENT ON TABLE public.estoque_baixas_aplicadas IS
  'Chaves de idempotência das baixas de estoque já aplicadas. Impede que o reenvio de uma RPC offline desconte o mesmo item duas vezes.';

-- ── 2. baixar_estoque ──────────────────────────────────────────────
-- DROP + CREATE (não CREATE OR REPLACE): a lista de argumentos muda.
-- Manter as duas assinaturas conviveria como sobrecarga e deixaria a
-- chamada de dois argumentos ambígua no PostgREST.
DROP FUNCTION IF EXISTS public.baixar_estoque(bigint, numeric);

CREATE OR REPLACE FUNCTION public.baixar_estoque(
  p_produto_id bigint,
  p_qtd        numeric,
  p_op_id      uuid DEFAULT NULL
)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fail-closed: claim ausente/NULL (anon, token adulterado) → RAISE.
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  IF p_op_id IS NOT NULL THEN
    INSERT INTO public.estoque_baixas_aplicadas (op_id, tenant_id, produto_id, qtd)
    VALUES (p_op_id, public.tenant_atual_id(), p_produto_id, p_qtd)
    ON CONFLICT (op_id) DO NOTHING;

    -- Nada inserido = esta baixa já foi aplicada antes. Devolve o saldo
    -- de agora (o app precisa dele para o alerta de mínimo) sem repetir
    -- o desconto.
    IF NOT FOUND THEN
      RETURN QUERY
      SELECT e.quantidade, e.minimo
        FROM public.estoque e
       WHERE e.produto_id = p_produto_id
         AND e.tenant_id  = public.tenant_atual_id();
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.estoque e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.produto_id = p_produto_id
     AND e.tenant_id  = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.baixar_estoque(bigint, numeric, uuid) TO authenticated;

-- ── 3. baixar_estoque_subproduto ───────────────────────────────────
DROP FUNCTION IF EXISTS public.baixar_estoque_subproduto(uuid, numeric);

CREATE OR REPLACE FUNCTION public.baixar_estoque_subproduto(
  p_subproduto_id uuid,
  p_qtd           numeric,
  p_op_id         uuid DEFAULT NULL
)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para baixar estoque.';
  END IF;

  IF p_op_id IS NOT NULL THEN
    INSERT INTO public.estoque_baixas_aplicadas (op_id, tenant_id, subproduto_id, qtd)
    VALUES (p_op_id, public.tenant_atual_id(), p_subproduto_id, p_qtd)
    ON CONFLICT (op_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT e.quantidade, e.minimo
        FROM public.estoque_subprodutos e
       WHERE e.subproduto_id = p_subproduto_id
         AND e.tenant_id     = public.tenant_atual_id();
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.estoque_subprodutos e
     SET quantidade = GREATEST(0, e.quantidade - p_qtd),
         updated_at = now()
   WHERE e.subproduto_id = p_subproduto_id
     AND e.tenant_id     = public.tenant_atual_id()
  RETURNING e.quantidade, e.minimo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.baixar_estoque_subproduto(uuid, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.baixar_estoque_subproduto(uuid, numeric, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.baixar_estoque_subproduto(uuid, numeric, uuid) TO authenticated;
