-- Delivery — trava de edição do endereço de origem.
--
-- Depois de conferir e salvar o endereço do estabelecimento (ponto de partida
-- das entregas), o admin pode fechar o cadeado ao lado do campo. Com o cadeado
-- fechado o autocomplete some, o campo fica somente-leitura e o pino do mapa
-- para de arrastar — evita mexer na origem sem querer, que reposicionaria os
-- anéis de taxa por distância de todo o cardápio.
--
-- `endereco_origem_bloqueado` guarda esse estado (default false = destravado).
--
-- RLS: coluna nova em tabela já existente — herda as policies de
-- public.config_delivery. Nenhuma policy nova é necessária. Idempotente
-- (IF NOT EXISTS) para poder reaplicar sem erro.

ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS endereco_origem_bloqueado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.endereco_origem_bloqueado IS
  'Quando true, o endereço/origem do estabelecimento fica travado para edição na UI (cadeado fechado): sem autocomplete, campo somente-leitura e pino do mapa fixo.';
