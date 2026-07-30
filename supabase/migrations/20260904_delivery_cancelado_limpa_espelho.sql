-- ══════════════════════════════════════════════════════════════════
-- Delivery — Cancelar o pedido tem que cancelar a comanda espelho
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS antes de recriar.
--
-- DL22 — Pedido cancelado continuava sendo feito na cozinha e cobrado no PDV.
--
--   `criar_pedido_delivery` espelha TODO pedido em `public.pending` como a
--   comanda 'Delivery <n>' (created_by = 'delivery') e guarda o vínculo em
--   delivery_pedidos.pending_id. Esse vínculo é escrito por todas as seis
--   versões da RPC (20260804, 20260810, 20260812, 20260822, 20260902,
--   20260903) e não era LIDO por ninguém: nenhum trigger, nenhuma tela.
--
--   Cancelar o pedido só faz UPDATE de delivery_pedidos.status = 'cancelado'.
--   A comanda espelho ficava em `pending` com status 'open' e os itens
--   intactos. Consequência real, na operação:
--     · a Cozinha (usePedidosCozinha lê TODA linha de `pending`) seguia
--       preparando comida de um pedido que o cliente cancelou;
--     · no PDV a comanda fantasma continuava aberta, esperando ser cobrada.
--
--   O conserto é um trigger AFTER UPDATE OF status que apaga a linha
--   espelho quando — e só quando — o pedido entra em 'cancelado'.
--
--   Por que DELETE e não um status novo em `pending`: a Cozinha pega toda
--   linha de `pending` independente do status, e o único caminho que tira
--   um cartão do painel ao vivo é o evento DELETE do Realtime (o mesmo
--   caminho que o app já usa para retirar comanda finalizada). Um flag
--   novo exigiria mudar Cozinha, PDV e mini-painel para respeitá-lo.
--
--   Escopo deliberado: NUNCA apaga em 'entregue'. No modo add-on (o
--   estabelecimento usa o PDV junto com o delivery) é justamente essa
--   comanda que o caixa fecha para registrar a venda — apagar em
--   'entregue' faria a venda desaparecer do caixa.
--
--   `pending.id` é text e globalmente único (gerado como
--   'dlv_' || uuid), mas o DELETE ainda filtra por tenant_id: um trigger
--   SECURITY DEFINER roda sem RLS, e o filtro garante que um vínculo
--   errado (ou adulterado) não alcance a comanda de outro estabelecimento.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delivery_cancelado_limpa_espelho()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só cancelamento mexe no espelho. 'entregue' mantém a comanda de
  -- propósito: é ela que o PDV fecha para registrar a venda.
  IF NEW.status IS DISTINCT FROM 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Pedido antigo (anterior ao espelho) ou sem vínculo: nada a apagar.
  IF NEW.pending_id IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.pending
   WHERE id = NEW.pending_id
     AND tenant_id = NEW.tenant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedidos_cancelado_limpa_espelho ON public.delivery_pedidos;
CREATE TRIGGER delivery_pedidos_cancelado_limpa_espelho
  AFTER UPDATE OF status ON public.delivery_pedidos
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IS DISTINCT FROM 'cancelado')
  EXECUTE FUNCTION public.delivery_cancelado_limpa_espelho();

-- ── Autoconferência: o trigger tem que existir do jeito certo ──────
-- Assertiva de catálogo (não escreve dado nenhum): se a migração for
-- aplicada pela metade, ou o trigger nascer na tabela/momento errado,
-- ela aborta aqui em vez de deixar o furo aberto em silêncio.
DO $$
DECLARE
  v_tabela   text;
  v_enabled  char;
  v_definicao text;
  v_secdef   boolean;
BEGIN
  SELECT c.relname, t.tgenabled, pg_get_triggerdef(t.oid)
    INTO v_tabela, v_enabled, v_definicao
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE t.tgname = 'delivery_pedidos_cancelado_limpa_espelho'
     AND NOT t.tgisinternal;

  IF v_tabela IS NULL THEN
    RAISE EXCEPTION 'DL22: trigger delivery_pedidos_cancelado_limpa_espelho não foi criado.';
  END IF;
  IF v_tabela <> 'delivery_pedidos' THEN
    RAISE EXCEPTION 'DL22: trigger criado na tabela errada (%).', v_tabela;
  END IF;
  IF v_enabled = 'D' THEN
    RAISE EXCEPTION 'DL22: trigger existe mas está desabilitado.';
  END IF;
  IF v_definicao NOT ILIKE '%AFTER UPDATE OF status%' THEN
    RAISE EXCEPTION 'DL22: trigger não está como AFTER UPDATE OF status (%).', v_definicao;
  END IF;

  SELECT p.prosecdef INTO v_secdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'delivery_cancelado_limpa_espelho';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'DL22: função public.delivery_cancelado_limpa_espelho não existe.';
  END IF;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'DL22: função precisa ser SECURITY DEFINER (o trigger apaga em pending).';
  END IF;
END;
$$;
