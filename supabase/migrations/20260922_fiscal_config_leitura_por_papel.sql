-- ══════════════════════════════════════════════════════════════════
-- NFC-e — leitura da configuração fiscal POR PAPEL (correção)
-- Fecha vazamento da identidade fiscal do estabelecimento para
-- qualquer conta autenticada do tenant (inclusive o garçom).
--
-- O QUE ESTAVA ABERTO
-- A policy de leitura criada em 20260731_tenant_fiscal_config.sql era:
--
--     USING (tenant_id = public.tenant_atual_id() OR public.is_super_admin())
--
-- Isso isola o TENANT (ninguém lê a config fiscal de outro
-- estabelecimento — isso continua valendo), mas NÃO isola o PAPEL: no
-- próprio tenant, qualquer JWT autenticado lê a linha inteira. Um
-- garçom com o app aberto — ou qualquer um com a chave anon e uma
-- sessão de garçom — pega CNPJ, inscrição estadual, inscrição
-- municipal, razão social, nome fantasia, endereço completo do
-- emitente, regime tributário, série, ambiente e o csc_id.
--
-- Nada disso é o SEGREDO fiscal (o certificado A1 e o VALOR do CSC
-- nunca entraram nesta tabela — a fronteira de segredo de 20260731
-- continua correta e intacta). Mas é o dossiê fiscal do
-- estabelecimento em uma linha só, e o app não tem nenhuma tela que
-- mostre isso para o garçom: é vazamento puro, sem contrapartida de
-- uso. Em SaaS multi-estabelecimento (decisão 017), esse conjunto é
-- exatamente o que alguém precisa para se passar pelo emitente.
--
-- QUEM PRECISA MESMO LER (e por isso fica)
--   • admin    — configura o fiscal (PainelFiscal, permissão
--                `configuracoes`).
--   • gerente  — histórico de notas (HistoricoNfce, permissão
--                `relatorio`, que chama buscarEmitenteFiscal).
--   • caixa    — NÃO tem tela, mas EMITE: emitir-nfce e reenviar-nfce
--                leem esta tabela com o JWT DE QUEM CHAMOU.
--
-- ┌─ CORREÇÃO DE UMA NOTA ERRADA ────────────────────────────────────┐
-- │ O rodapé de 20260731 diz:                                        │
-- │   "a emissão em si (Leva 3) roda na Edge Function com            │
-- │    service_role, que ignora RLS — estas policies protegem a      │
-- │    TELA de configuração no app, não o caminho de emissão."       │
-- │                                                                  │
-- │ Isso é FALSO no código que existe hoje. As quatro funções        │
-- │ fiscais (emitir-nfce, reenviar-nfce, cancelar-nfce,              │
-- │ inutilizar-nfce) montam o cliente com SUPABASE_ANON_KEY +        │
-- │ o header Authorization do chamador, de propósito, para que a RLS │
-- │ resolva o tenant. Ou seja: esta policy É o caminho de emissão.   │
-- │ Apertar demais aqui QUEBRA a emissão no caixa — por isso `caixa` │
-- │ entra na lista, mesmo sem tela.                                  │
-- └──────────────────────────────────────────────────────────────────┘
--
-- POR QUE NÃO SÓ `admin`
-- Seria mais apertado e quebraria dois fluxos reais: o caixa pararia
-- de emitir cupom no meio da venda (412 "Estabelecimento sem
-- configuração fiscal", com o cliente esperando na frente) e o gerente
-- perderia o emitente no histórico de notas. Este é o menor conjunto
-- que mantém o produto funcionando.
--
-- ESCRITA: sem mudança. Continua só o admin do próprio tenant
-- (fiscal_config_write_admin, de 20260731) — este arquivo não toca nela.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- ── Leitura: papéis que realmente usam + super-admin (Console) ─────
DROP POLICY IF EXISTS "fiscal_config_select" ON public.tenant_fiscal_config;
CREATE POLICY "fiscal_config_select" ON public.tenant_fiscal_config
  FOR SELECT
  USING (
    (
      (auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('caixa', 'gerente', 'admin')
      AND tenant_id = public.tenant_atual_id()
    )
    OR public.is_super_admin()
  );

-- ── Verificação ────────────────────────────────────────────────────
-- Esperado: fiscal_config_select com a lista de papéis no USING, e
-- fiscal_config_write_admin intacta.
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'tenant_fiscal_config'
ORDER BY policyname;
