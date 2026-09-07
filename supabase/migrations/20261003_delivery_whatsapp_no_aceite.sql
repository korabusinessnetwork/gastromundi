-- ══════════════════════════════════════════════════════════════════
-- Interruptor: confirmar no WhatsApp ao aceitar o pedido.
--
-- Ao aceitar um pedido, a aba Delivery abre o WhatsApp do cliente com a
-- confirmação já escrita — o operador confere e envia. Grátis, sem
-- integração, sem API paga: é o próprio navegador abrindo wa.me.
--
-- Nasce DESLIGADO de propósito. É uma aba que se abre sozinha, e isso só
-- pode acontecer para quem pediu: quem aceita dez pedidos seguidos numa
-- correria não quer dez abas de WhatsApp na cara.
--
-- Por que no banco e não no navegador: é decisão do ESTABELECIMENTO, não
-- do aparelho. Guardada no localStorage, o dono ligaria no computador do
-- caixa e o pedido aceito pelo celular não avisaria ninguém.
--
-- RLS: nenhuma tabela nova. A coluna entra em config_delivery, que já tem
-- RLS por tenant.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS whatsapp_no_aceite boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.whatsapp_no_aceite IS
  'Ao aceitar um pedido, abrir o WhatsApp do cliente com a confirmação escrita? Desligado por padrão — abre uma aba por pedido.';

DO $conf$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'config_delivery'
     AND column_name = 'whatsapp_no_aceite' AND column_default LIKE '%false%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'WhatsApp no aceite: a coluna precisa existir e nascer DESLIGADA — ninguém deve começar a ver abas abrindo sozinhas.';
  END IF;

  RAISE NOTICE 'Confirmação no WhatsApp ao aceitar: interruptor no ar (desligado).';
END;
$conf$;
