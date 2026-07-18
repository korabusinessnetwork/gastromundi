-- ════════════════════════════════════════════════════════════════════
-- 20260744 — papel `caixa` pode abrir/fechar a própria sessão de caixa
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (varredura Kora, crítico 6):
--   Abrir/fechar caixa grava três chaves em `public.config`
--   (fundo_atual, caixa_aberto, sessao_aberta_em), mas a única policy
--   de escrita da tabela é config_write_gerente_admin (20240108) —
--   o papel `caixa` era barrado pela RLS silenciosamente, embora:
--     • docs/03_REGRAS_DE_NEGOCIO/CAIXA.md dê ao caixa a permissão
--       "Abrir/fechar a própria sessão" ✓;
--     • `fechamentos` já aceite caixa (fechamentos_all_caixa_up);
--     • a Sidebar mostre os botões de abrir/fechar para o caixa.
--
-- CORREÇÃO:
--   Policy PERMISSIVE adicional em `public.config` liberando o papel
--   `caixa` a escrever SOMENTE as chaves de sessão. As chaves de
--   gestão (meios_pagamento, taxa_servico, metodos_custom,
--   dias_alerta_validade) continuam restritas a gerente/admin.
--
--   Policies permissivas se somam (OR); o isolamento por tenant da
--   fase 2 (20260724) é RESTRICTIVE e continua valendo (AND) — o
--   caixa só alcança as linhas do próprio tenant.
--
-- ✅ Aplicada em produção pelo dono em 2026-07-18.

DROP POLICY IF EXISTS "config_write_caixa_sessao" ON public.config;
CREATE POLICY "config_write_caixa_sessao" ON public.config FOR ALL
  USING  (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em')
  );
