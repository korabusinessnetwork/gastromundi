-- ══════════════════════════════════════════════════════════════════
-- RUN 4 (estoque) LEVA 4 — entrada de mercadoria atômica no servidor
--
-- ┌─ O FURO ─────────────────────────────────────────────────────────┐
-- │ A entrada de estoque (coluna "Entrada" da tela de estoque) era um │
-- │ read-modify-write feito no navegador: a tela lia o saldo que ELA  │
-- │ tinha em memória, somava a quantidade digitada e gravava o total  │
-- │ ABSOLUTO por upsert (`quantidade = 45`).                          │
-- │                                                                   │
-- │ Dois aparelhos conferindo a mesma nota ao mesmo tempo perdem      │
-- │ mercadoria. Saldo 40, o primeiro dá entrada de 5 e grava 45; o    │
-- │ segundo, que ainda tinha 40 na tela, dá entrada de 3 e grava 43.  │
-- │ Os 5 do primeiro somem do saldo sem nenhum erro na tela — e é     │
-- │ exatamente o cenário de recebimento de carga, em que duas pessoas │
-- │ lançam junto para ir mais rápido.                                 │
-- │                                                                   │
-- │ A baixa de estoque (venda) já era atômica desde a leva D          │
-- │ (`baixar_estoque`); a entrada tinha ficado para trás.             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A CORREÇÃO ─────────────────────────────────────────────────────┐
-- │ Quem soma passa a ser o banco: `quantidade = quantidade + delta`  │
-- │ dentro de uma única instrução, do mesmo jeito que a baixa faz o   │
-- │ `quantidade - p_qtd`. A tela manda só o QUANTO ENTROU, nunca o    │
-- │ total. Não existe mais janela entre ler e gravar.                 │
-- │                                                                   │
-- │ Trocar valor absoluto por delta cria um risco novo: se a resposta │
-- │ se perder na queda de conexão e o app repetir a chamada, a soma   │
-- │ aconteceria duas vezes. Por isso a entrada nasce com `op_id` e    │
-- │ reusa o mesmo livro de idempotência da baixa                      │
-- │ (`estoque_baixas_aplicadas`, migration 20260830): id já gravado = │
-- │ entrada já aplicada, devolve o saldo de agora sem somar de novo.  │
-- │                                                                   │
-- │ A função também faz o que o upsert do app não fazia: recusa delta │
-- │ nulo/zero/negativo/NaN e confere que o produto é DESTE            │
-- │ estabelecimento antes de mexer no saldo.                          │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ RLS / PAINEL ───────────────────────────────────────────────────┐
-- │ Nenhuma tabela nova. `estoque_baixas_aplicadas` ganha só a coluna │
-- │ `tipo`; ela já está com RLS LIGADA e SEM POLICY de propósito      │
-- │ (20260830) — nenhum cliente lê ou escreve direto, só as funções   │
-- │ SECURITY DEFINER, que rodam como owner e não passam pela RLS.     │
-- │ Nada a configurar no painel do Supabase nesta migration.          │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION +
-- REVOKE/GRANT são todos re-aplicáveis.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. O livro de idempotência passa a distinguir baixa de entrada ─
-- Os op_id são uuid gerados no app, então não há risco de colisão entre
-- os dois tipos. A coluna existe para o livro poder ser LIDO (auditoria
-- de "o que essa chave aplicou") e para a limpeza periódica das linhas
-- velhas continuar fazendo sentido. DEFAULT 'baixa' preenche as linhas
-- que já estão lá — todas são baixas.
ALTER TABLE public.estoque_baixas_aplicadas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'baixa';

COMMENT ON COLUMN public.estoque_baixas_aplicadas.tipo IS
  'baixa (venda/consumo) ou entrada (compra/reposição). Só as RPCs SECURITY DEFINER escrevem aqui.';

-- ── 2. entrada_estoque ────────────────────────────────────────────
-- Mesma forma de `baixar_estoque`: fail-closed no papel, escopo pelo
-- tenant do JWT, idempotência opcional por `p_op_id`, e devolve
-- (quantidade, minimo) para o app atualizar a tela e avaliar alerta.
CREATE OR REPLACE FUNCTION public.entrada_estoque(
  p_produto_id bigint,
  p_delta      numeric,
  p_op_id      uuid DEFAULT NULL
)
RETURNS TABLE (quantidade numeric, minimo numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.tenant_atual_id();
BEGIN
  -- Fail-closed: claim ausente/NULL (anon, token adulterado) → RAISE.
  IF NOT COALESCE(
       (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin'),
       false) THEN
    RAISE EXCEPTION 'Sem permissão para dar entrada em estoque.';
  END IF;

  -- Delta inválido nunca chega ao saldo. O teste de NaN é explícito porque
  -- em numeric o Postgres ordena NaN COMO O MAIOR VALOR: 'NaN' > 0 é TRUE
  -- e passaria pelo `> 0` sozinho.
  IF p_delta IS NULL OR p_delta = 'NaN'::numeric OR NOT (p_delta > 0) THEN
    RAISE EXCEPTION 'Quantidade de entrada inválida: %', p_delta;
  END IF;

  -- A função roda como owner, então a RLS de products NÃO se aplica aqui:
  -- a checagem de tenant tem que ser explícita, senão um token de outro
  -- estabelecimento mexeria no saldo deste.
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = p_produto_id AND p.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Produto % não pertence a este estabelecimento.', p_produto_id;
  END IF;

  IF p_op_id IS NOT NULL THEN
    INSERT INTO public.estoque_baixas_aplicadas (op_id, tenant_id, produto_id, qtd, tipo)
    VALUES (p_op_id, v_tenant, p_produto_id, p_delta, 'entrada')
    ON CONFLICT (op_id) DO NOTHING;

    -- Nada inserido = esta entrada já foi aplicada antes. Devolve o saldo
    -- de agora sem somar de novo.
    IF NOT FOUND THEN
      RETURN QUERY
      SELECT e.quantidade, e.minimo
        FROM public.estoque e
       WHERE e.produto_id = p_produto_id
         AND e.tenant_id  = v_tenant;
      RETURN;
    END IF;
  END IF;

  -- Produto que nunca teve linha de estoque passa a ter (é o primeiro
  -- recebimento dele); produto que já tem, soma sobre o saldo do banco.
  -- O `minimo` fica no DEFAULT da tabela na primeira vez e é preservado
  -- nas seguintes.
  RETURN QUERY
  INSERT INTO public.estoque AS e (produto_id, tenant_id, quantidade, updated_at)
  VALUES (p_produto_id, v_tenant, p_delta, now())
  ON CONFLICT (produto_id) DO UPDATE
     SET quantidade = e.quantidade + p_delta,
         updated_at = now()
   WHERE e.tenant_id = v_tenant
  RETURNING e.quantidade, e.minimo;

  -- Linha existe mas é de outro tenant (só acontece com dado corrompido:
  -- o produto passou a checagem acima). O DO UPDATE ... WHERE não fez
  -- nada e devolveria zero linhas em silêncio — melhor estourar.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível atualizar o estoque do produto %.', p_produto_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.entrada_estoque(bigint, numeric, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.entrada_estoque(bigint, numeric, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.entrada_estoque(bigint, numeric, uuid) TO authenticated;

COMMENT ON FUNCTION public.entrada_estoque(bigint, numeric, uuid) IS
  'Soma p_delta ao saldo do produto de forma atômica (entrada de mercadoria). Idempotente quando p_op_id é informado.';
