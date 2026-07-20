-- ══════════════════════════════════════════════════════════════════
-- Delivery — módulo no registro de planos (ADR-005)
--
-- Insere o módulo 'delivery' no superconjunto plano → módulos. A
-- 20260717_planos_modulos.sql é a fonte única plano→módulos e já rodou
-- em produção; NÃO se edita aquela migração — este arquivo apenas
-- ACRESCENTA o novo módulo (idempotente, ON CONFLICT DO NOTHING).
--
-- Onde entra:
--   • 'alto'     → tem PDV → Delivery vira ADDON (sincroniza com o
--                  cardápio do PDV; importa produtos existentes).
--   • 'avancado' → idem (é o plano do tenant atual por padrão).
--
-- Modo (addon x standalone) NÃO é decidido aqui: o front deriva pelo
-- conjunto de módulos do plano (tem 'pdv' → addon; só 'delivery' sem
-- 'pdv' → standalone). Um futuro plano "somente delivery" recebe
-- 'delivery' SEM 'pdv' e passa a rodar standalone sem tocar em código.
--
-- Espelha src/constants/modulos.js (MODULOS.DELIVERY = 'delivery').
--
-- ▸ PASSO MANUAL RESERVADO: rodar este SQL no Supabase SQL Editor
--   (idempotente). Enquanto não rodar, o item Delivery aparece
--   bloqueado (convite a upgrade) no menu — nunca quebrado.
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.planos_modulos (plano_codigo, modulo_codigo) VALUES
  ('alto',     'delivery'),
  ('avancado', 'delivery')
ON CONFLICT (plano_codigo, modulo_codigo) DO NOTHING;
