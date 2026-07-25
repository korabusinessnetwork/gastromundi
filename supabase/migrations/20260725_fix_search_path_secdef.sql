-- ══════════════════════════════════════════════════════════════════
-- HARDENING — Adiciona SET search_path a funções SECURITY DEFINER
--
-- CONTEXTO / POR QUÊ:
--   Funções PostgreSQL com SECURITY DEFINER são vulneráveis a
--   search_path hijacking: se um atacante inserir um schema malicioso
--   na frente do search_path, funções como `crypt()`, `upper()` ou
--   tabelas chamadas sem schema explícito podem resolver para a
--   versão atacante.
--
--   SOLUÇÃO: adicionar `SET search_path = <schemas>` ao CREATE/ALTER
--   de CADA função SECURITY DEFINER. Padrão do projeto:
--   `SET search_path = public` (casos simples) ou
--   `SET search_path = public, auth, extensions` (se usar auth/ext).
--
-- MODO DE EXECUÇÃO:
--   Rodar MANUALMENTE no SQL Editor do Supabase (não é executado
--   automático). Idempotente (ALTER FUNCTION é re-aplicável).
--
-- ══════════════════════════════════════════════════════════════════

-- ── Origem: 20260718_addons.sql (~60) ───────────────────────────
-- Função de conveniência — vê add-ons do tenant atual.
ALTER FUNCTION public.tenant_atual_tem_addon(p_addon text)
SET search_path = public;

-- ── Origem: 20260725_multitenant_fase3_wrappers_jwt.sql (~71) ────
-- Genérica de gating de módulo — recebe tenant_id por parâmetro.
ALTER FUNCTION public.tenant_tem_modulo(p_tenant_id uuid, p_modulo text)
SET search_path = public;

-- ── Origem: 20260725_multitenant_fase3_wrappers_jwt.sql (~90) ────
-- Wrapper de módulo — resolve tenant pelo JWT (tenant_atual_id).
ALTER FUNCTION public.tenant_atual_tem_modulo(p_modulo text)
SET search_path = public;

-- ── Origem: 20260725_multitenant_fase3_wrappers_jwt.sql (~106) ───
-- Wrapper de assinatura — resolve tenant pelo JWT (tenant_atual_id).
ALTER FUNCTION public.assinatura_atual_ativa()
SET search_path = public;

-- ── Origem: 20260720_assinatura_enforcement.sql (~18) ────────────
-- Enforcement de assinatura por tenant_id (recebe o tenant por parâmetro).
-- Base de assinatura_atual_ativa(); nunca foi redefinida depois, então
-- precisa do carimbo próprio (assinatura por argumento é DIFERENTE do
-- wrapper sem args acima).
ALTER FUNCTION public.assinatura_ativa(p_tenant_id uuid)
SET search_path = public;

-- ── Origem: 20260802_leva16_hardening_rpcs.sql (~37) ──────────────
-- Baixa estoque de produto, com guarda de role e filtro de tenant.
ALTER FUNCTION public.baixar_estoque(p_produto_id bigint, p_qtd numeric)
SET search_path = public;

-- ── Origem: 20260802_leva16_hardening_rpcs.sql (~61) ──────────────
-- Baixa estoque de subproduto, com guarda de role e filtro de tenant.
ALTER FUNCTION public.baixar_estoque_subproduto(p_subproduto_id uuid, p_qtd numeric)
SET search_path = public;

-- ── Origem: 20260802_leva16_hardening_rpcs.sql (~86) ──────────────
-- Confirma renovação de assinatura, vínculo de tenant para gerente/admin.
ALTER FUNCTION public.confirmar_renovacao_assinatura(p_tenant_id uuid, p_competencia date, p_valor numeric, p_metodo text, p_confirmado_por text)
SET search_path = public;

-- ── Origem: 20260802_leva16_hardening_rpcs.sql (~137) ─────────────
-- Sincroniza o cache de status de assinatura, vínculo de tenant.
ALTER FUNCTION public.sincronizar_status_assinatura(p_tenant_id uuid)
SET search_path = public;

-- ── Origem: 20260802_leva16_hardening_rpcs.sql (~180) ─────────────
-- Libera reserva de mesa, com guarda de role e filtro de tenant.
ALTER FUNCTION public.limpar_reserva_mesa(mesa_numero text)
SET search_path = public;
