-- ══════════════════════════════════════════════════════════════════
-- Remove a tabela legada public.logs
--
-- Contexto: logs foi substituída por operator_logs e está sem
-- nenhuma policy em produção (RLS nega tudo — inacessível via API).
-- Nenhum código em src/ referencia esta tabela (confirmado via grep
-- por from("logs") antes de aplicar esta migração).
-- ══════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.logs;
