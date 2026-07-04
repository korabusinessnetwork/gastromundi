-- ══════════════════════════════════════════════════════════════════
-- TD001 — Remove senhas legíveis gravadas em config.credentials
--
-- Contexto: a key "credentials" da tabela config guardava senhas em
-- texto puro, legível por QUALQUER usuário autenticado via RLS
-- (policy config_select_auth). A recuperação de senha passa a ser
-- somente redefinição via Edge Function manage-user
-- (atualizarSenhaAuth). O app não lê/grava mais essa key.
-- ══════════════════════════════════════════════════════════════════

DELETE FROM public.config WHERE key = 'credentials';
