-- ══════════════════════════════════════════════════════════════════
-- Baixa no caixa SEMPRE vira baixa no estoque
--
-- ┌─ O FURO ─────────────────────────────────────────────────────────┐
-- │ `baixar_estoque` é um UPDATE: `WHERE produto_id = ...`. Produto   │
-- │ sem linha em `estoque` → 0 linhas afetadas, nenhum erro. A venda  │
-- │ fecha e o estoque não mexe.                                       │
-- │                                                                   │
-- │ E produto sem linha é o caso COMUM, não a exceção: `addProduct`   │
-- │ nunca criou a linha. Todo produto cadastrado pelo app nasce fora  │
-- │ do controle de estoque e é vendido para sempre sem descontar —    │
-- │ enquanto a tela de Estoque o lista com saldo "0", igualzinho a um │
-- │ produto controlado que acabou. Não dá para distinguir na tela o   │
-- │ que acabou do que nunca foi contado.                              │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CORREÇÃO ─────────────────────────────────────────────────────┐
-- │ A RPC cria a linha (saldo 0, mínimo padrão) antes de descontar.   │
-- │ A partir daí o UPDATE sempre acha o que atualizar: o desconto     │
-- │ acontece, o `GREATEST(0, ...)` segura o saldo em zero e o app     │
-- │ recebe a linha de volta — que é como o Jarvas enxerga a venda sem │
-- │ estoque (oversell) e o cruzamento do mínimo.                      │
-- │                                                                   │
-- │ O INSERT vem ANTES da checagem de idempotência de propósito: uma  │
-- │ baixa reenviada da fila offline também precisa devolver a linha,  │
-- │ senão o app lê "nenhuma linha" e acusa falha numa baixa que já    │
-- │ tinha sido aplicada.                                              │
-- │                                                                   │
-- │ Só a tabela `estoque` (produtos) muda. `estoque_subprodutos` não: │
-- │ lá a linha nasce junto com o `controla_estoque` do cadastro de    │
-- │ subprodutos, então linha faltando é inconsistência de dados — o   │
-- │ app passa a acusar em vez de criar por conta própria.             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Efeito colateral declarado: produto que ninguém quer controlar (couvert,
-- taxa de serviço) passa a ter linha e a gerar alerta de venda sem estoque.
-- Hoje não existe como desligar o controle por produto — a saída é dar
-- entrada do saldo. Um `controla_estoque` em `products` resolveria, e está
-- anotado no backlog como decisão de produto.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + REVOKE/GRANT re-aplicáveis.
-- RLS: nenhuma policy nova. A função é SECURITY DEFINER e continua sendo a
-- única a escrever aqui em nome do operador; o INSERT carrega
-- `tenant_atual_id()` explícito, então a linha nasce no tenant certo.
-- ══════════════════════════════════════════════════════════════════

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

  -- Garante a linha do produto no tenant de quem está vendendo. `DO NOTHING`
  -- porque o caso normal é a linha já existir; e se ela existir em OUTRO
  -- tenant, o conflito não a rouba — o UPDATE abaixo não vai achá-la e o app
  -- acusa a baixa não aplicada, que é o certo.
  -- quantidade e minimo ficam com os defaults da tabela (0 e 10).
  INSERT INTO public.estoque (produto_id, tenant_id)
  VALUES (p_produto_id, public.tenant_atual_id())
  ON CONFLICT (produto_id) DO NOTHING;

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

-- ── Backfill: produtos que já existem sem linha de estoque ─────────
-- Sem isto, a linha só nasceria na primeira venda de cada produto — e até
-- lá a tela de Estoque continuaria mostrando saldo "0" que não é saldo
-- nenhum. Cria com saldo 0 e mínimo padrão, no tenant do próprio produto.
INSERT INTO public.estoque (produto_id, tenant_id)
SELECT p.id, p.tenant_id
  FROM public.products p
 WHERE NOT EXISTS (SELECT 1 FROM public.estoque e WHERE e.produto_id = p.id)
ON CONFLICT (produto_id) DO NOTHING;
