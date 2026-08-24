-- ════════════════════════════════════════════════════════════════════
-- 20260921 — rate-limit do delivery público: fechar o desvio do
--            "pedido sem telefone"
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (simulação de ataque, achado nº 2)
--   `criar_pedido_delivery` é chamada com a chave anon: qualquer pessoa
--   na internet cria pedido. O freio que existe é o trigger
--   `delivery_pedidos_rate_limit` (20260814, endurecido em 20260905):
--   no máximo 3 pedidos do MESMO telefone, no mesmo estabelecimento,
--   em 2 minutos.
--
--   Só que o telefone é o que o cliente digitou. A primeira linha do
--   trigger é:
--
--       IF v_tel IS NULL THEN RETURN NEW;   -- sem dígito, passa
--
--   Ou seja: mandar o pedido com o telefone em branco (ou só com
--   pontuação, "()-") pula o freio inteiro. Um script cria centenas de
--   pedidos seguidos, e cada um deles chega na Cozinha e no mini-painel
--   do estabelecimento. Não vaza dado nenhum — o estrago é operacional:
--   a tela de produção fica inutilizável no meio do serviço.
--
--   O desvio nem exige má-fé para aparecer: a tela pede
--   "Telefone (opcional)" (src/pages/delivery/CheckoutEntrega.jsx) e a
--   RPC nunca valida esse campo. O pedido sem telefone é um pedido
--   legítimo do produto.
--
-- POR QUE NÃO É SÓ "EXIGIR TELEFONE"
--   Passar a recusar pedido sem telefone fecharia o furo e quebraria um
--   fluxo que o produto oferece hoje na cara do cliente. Trocar um
--   problema de operação por um problema de venda é pior — e violaria o
--   Princípio nº 1: o cliente preencheria tudo, clicaria em "Finalizar"
--   e levaria um erro de um campo que a própria tela chamou de opcional.
--
--   Correlacionar por endereço também não resolve: mudar o número da
--   casa a cada requisição é tão barato quanto apagar o telefone.
--
-- CORREÇÃO
--   O balde sem telefone deixa de ser infinito e passa a ter teto
--   PRÓPRIO, por estabelecimento: 5 pedidos anônimos em 2 minutos.
--   A regra por telefone (3 em 2 minutos) continua igual para quem
--   preencheu.
--
--   O teto é do balde anônimo inteiro, não de um cliente — é a única
--   coisa que dá para contar quando não há identificador. 5 em 2
--   minutos é folgado para casa cheia (o pico real de uma casa média
--   fica bem abaixo disso, e quem digita telefone nem passa por essa
--   contagem) e curto o bastante para o script parar na quinta
--   requisição em vez de na quingentésima.
--
--   A mensagem de recusa é o único ponto em que o cliente honesto
--   encosta nisso, então ela não diz "limite excedido": diz o que
--   fazer para sair do balde compartilhado — digitar o telefone. Isso
--   também melhora o pedido (a casa passa a ter como avisar que saiu
--   para entrega).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (CREATE OR REPLACE — o trigger de 20260814 continua o mesmo e segue
-- apontando para esta função).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delivery_rate_limit_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel   text := NULLIF(regexp_replace(COALESCE(NEW.cliente_telefone, ''), '\D', '', 'g'), '');
  v_count integer;
BEGIN
  -- ── Sem telefone: teto do balde anônimo do estabelecimento ────────
  -- Não dá para separar um cliente do outro aqui, então o limite é do
  -- conjunto. Era exatamente por este caminho que o freio passava
  -- batido: antes, `v_tel IS NULL` devolvia NEW sem contar nada.
  IF v_tel IS NULL THEN
    SELECT count(*) INTO v_count
    FROM public.delivery_pedidos
    WHERE tenant_id = NEW.tenant_id
      AND created_at > now() - interval '2 minutes'
      AND NULLIF(regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g'), '') IS NULL;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Muitos pedidos sem telefone neste momento. Informe seu telefone para concluir o pedido agora.'
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  -- ── Com telefone: 3 do mesmo número em 2 minutos ──────────────────
  -- Compara DÍGITOS dos dois lados. Antes o lado esquerdo era a coluna
  -- crua, então bastava mudar a máscara para ganhar um contador novo.
  SELECT count(*) INTO v_count
  FROM public.delivery_pedidos
  WHERE tenant_id = NEW.tenant_id
    AND created_at > now() - interval '2 minutes'
    AND regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g') = v_tel;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde um instante e tente de novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ── Conferência ──────────────────────────────────────────────────────
-- O trigger continua sendo o de 20260814; o que muda é o corpo da
-- função. Se o trigger tiver sumido, o freio não está no caminho.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'delivery_pedidos_rate_limit' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger delivery_pedidos_rate_limit ausente — rode 20260814 antes desta.';
  END IF;

  RAISE NOTICE 'Rate-limit do delivery: 3 por telefone e 5 sem telefone, por tenant, em 2 minutos.';
END;
$$;
