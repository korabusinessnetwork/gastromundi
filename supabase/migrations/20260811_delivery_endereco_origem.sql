-- ══════════════════════════════════════════════════════════════════
-- Delivery — endereço de origem do estabelecimento (mapa do range)
-- Complementa 20260810 (taxa por km) · decisão 017 (multi-tenant)
--
-- Por quê: no modo "por distância", o mapa precisa de uma origem
-- (origem_lat/origem_lng). Até agora só dava para marcá-la arrastando o
-- pino. Agora o endereço do estabelecimento — informado no Console ao
-- criar (para quem quer delivery integrado) ou na própria tela "Entrega e
-- taxas" — é geocodificado (Nominatim/OSM, grátis) e posiciona o pino
-- automaticamente; o dono ainda pode arrastar para o ajuste fino.
--
-- Esta migração só guarda o TEXTO do endereço de origem, para exibir na
-- tela e permitir re-localizar. As coordenadas continuam em
-- origem_lat/origem_lng (já existentes desde a 20260810).
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente.
-- RLS: nenhuma policy nova — a coluna entra numa tabela (config_delivery)
-- cuja RLS já existe (admin do tenant lê/grava a própria config).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS endereco_origem text;

COMMENT ON COLUMN public.config_delivery.endereco_origem IS
  'Endereço em texto do estabelecimento (origem do delivery por km). '
  'Geocodificado para origem_lat/origem_lng; exibido na tela e usado para re-localizar.';
