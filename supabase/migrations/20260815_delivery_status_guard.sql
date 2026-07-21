-- ══════════════════════════════════════════════════════════════════
-- Delivery — Guarda de transição de status (auditoria N3)
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS antes de recriar.
--
-- N3 — Ressuscitar pedido terminal por API direta:
--   `atualizarStatusPedido` (front) faz UPDATE incondicional de
--   delivery_pedidos.status. A coluna é text livre (sem CHECK) e o fluxo
--   só existe no front (STATUS_FLUXO). Um caixa/gerente/admin — que já
--   tem permissão de UPDATE pela RLS — pode, por chamada direta ao
--   PostgREST, mandar QUALQUER status: reabrir um pedido 'entregue' ou
--   'cancelado' (terminal), pular etapas (recebido → entregue) ou gravar
--   um status inexistente. Isso corrompe o histórico e os painéis.
--
--   A guarda vive num trigger BEFORE UPDATE (não na RPC) para valer em
--   QUALQUER caminho de UPDATE — inclusive o UPDATE direto do supabase-js
--   que a camada de operação usa hoje. Espelha exatamente o fluxo do
--   front (fonte de verdade única): mesmas transições, nada além.
--
--   Transições permitidas (= STATUS_FLUXO + cancelamento de não-terminal):
--     recebido     → em_preparo | cancelado
--     em_preparo   → saiu_entrega | cancelado
--     saiu_entrega → entregue | cancelado
--     entregue     → (terminal, nada)
--     cancelado    → (terminal, nada)
--   UPDATE que não mexe no status (status igual) passa sempre — a linha
--   pode ter outros campos editados sem esbarrar na guarda.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delivery_status_transicao_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- UPDATE que não altera o status: nada a validar (edição de outros campos).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Estado terminal não avança nem volta: pedido entregue/cancelado é final.
  IF OLD.status IN ('entregue', 'cancelado') THEN
    RAISE EXCEPTION 'Pedido % não pode mudar de status (já está %).', NEW.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Transições válidas espelhando o fluxo do front (STATUS_FLUXO).
  IF (OLD.status = 'recebido'     AND NEW.status IN ('em_preparo', 'cancelado'))
  OR (OLD.status = 'em_preparo'   AND NEW.status IN ('saiu_entrega', 'cancelado'))
  OR (OLD.status = 'saiu_entrega' AND NEW.status IN ('entregue', 'cancelado')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transição de status inválida: % → %.', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedidos_status_guard ON public.delivery_pedidos;
CREATE TRIGGER delivery_pedidos_status_guard
  BEFORE UPDATE ON public.delivery_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_status_transicao_check();
