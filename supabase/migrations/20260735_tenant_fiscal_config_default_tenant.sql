-- ══════════════════════════════════════════════════════════════════
-- NFC-e (modelo 65) — Painel de Configuração Fiscal do tenant (Leva 13)
-- multi-tenant (decisão 002/028) · white-label (decisão 017)
--
-- A tela de configuração (PainelFiscal) faz UPSERT na linha do próprio
-- estabelecimento em public.tenant_fiscal_config. A RLS (20260731) já
-- exige, na escrita, `tenant_id = tenant_atual_id()` — mas a coluna
-- `tenant_id` (PK) NÃO tinha DEFAULT, então o primeiro cadastro exigiria
-- o front informar o tenant. Isto dá ao `tenant_id` o DEFAULT
-- `tenant_atual_id()` (o mesmo do JWT que a RLS usa), de modo que o
-- upsert NÃO precisa — e não deve — passar tenant pelo front: o banco
-- resolve o tenant do chamador e a RLS garante o isolamento.
--
-- ┌─ FRONTEIRA DE SEGREDO (inalterada) ──────────────────────────────┐
-- │ Nada de segredo entra aqui. O certificado A1 e o VALOR do CSC     │
-- │ continuam fora desta tabela (Vault / secret da Edge Function).    │
-- │ Esta migration só ajusta um DEFAULT — não adiciona coluna.        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Idempotente: ALTER COLUMN ... SET DEFAULT é idempotente. Não mexe em
-- RLS (as policies da 20260731 seguem valendo) — nada a fazer no painel
-- além de aplicar esta migration.
-- ⚠️ Aplicar no SQL Editor do Supabase (como as anteriores).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.tenant_fiscal_config
  ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
