-- ══════════════════════════════════════════════════════════════════
-- RPC limpar_reserva_mesa
--
-- Chamada no checkout para remover a reserva de uma mesa após o
-- pagamento, mas apenas se status_manual era 'reservada'.
-- Mesas em 'manutencao' ou já 'livre' não são afetadas.
--
-- SECURITY DEFINER: a RLS de escrita (gerente/admin) não bloqueia
-- o caixa — a função roda com os privilégios do definidor.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.limpar_reserva_mesa(mesa_numero text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.mesas
     SET status_manual = 'livre',
         updated_at    = now()
   WHERE numero        = mesa_numero
     AND status_manual = 'reservada';
END;
$$;

GRANT EXECUTE ON FUNCTION public.limpar_reserva_mesa(text) TO authenticated;
