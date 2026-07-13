-- ══════════════════════════════════════════════════════════════════
-- Isolamento Multi-tenant — Fase 1 (S1-1, Leva 3): wrappers de
-- conveniência resolvem o tenant pelo JWT (+ reconciliação de drift)
-- docs/08_DECISOES/adr-008.md §4 · decisão 002 · decisão 028
--
-- OBJETIVO — os DOIS wrappers "atual" de conveniência descobriam qual é
-- o tenant com a expressão single-tenant:
--     (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
-- Sempre devolvia O único tenant — correto com um só, ERRADO no multi-
-- tenant (com 2+, o gating/assinatura de TODO mundo cai no tenant mais
-- antigo). Esta leva passa a resolver por public.tenant_atual_id()
-- (Leva 1, lê o tenant do JWT). As POLICIES que usam os wrappers não
-- mudam — só o corpo dos wrappers.
--
-- ┌─ DRIFT DESCOBERTO (por que esta leva também CRIA, não só troca) ──┐
-- │ Inventário em produção (2026-07-12) mostrou que a camada de       │
-- │ MÓDULOS da migração 20260717 NUNCA foi aplicada por completo:     │
-- │   • public.tenant_tem_modulo(uuid,text)   → NÃO EXISTIA           │
-- │   • public.tenant_atual_tem_modulo(text)  → NÃO EXISTIA           │
-- │ (O app não quebrou porque o front lê public.planos_modulos direto │
-- │  em src/lib/tenant.js — nunca chamou o RPC.) A camada de          │
-- │ ASSINATURA (20260720) SIM existe: assinatura_ativa(uuid) e        │
-- │ assinatura_atual_ativa() presentes. Então aqui:                   │
-- │   – tenant_tem_modulo/tenant_atual_tem_modulo são CRIADAS         │
-- │     (a genérica idêntica à 20260717; o wrapper já com corpo JWT). │
-- │   – assinatura_atual_ativa é só REESCRITA (corpo JWT).            │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ PENDÊNCIAS registradas (NÃO tratadas aqui — fora do bloqueador   ┐
-- │  de isolamento; decisão do dono quando encostar em billing):      │
-- │  1. As policies RESTRICTIVE de gating de módulo da 20260717       │
-- │     (estoque_modulo_*, lancamentos_modulo_*, clientes_modulo_*)   │
-- │     também não existem em produção (foram junto do drift). Esta   │
-- │     leva deixa as FUNÇÕES prontas mas NÃO liga o enforcement —    │
-- │     ligar gating de escrita é decisão de comercialização (F013),  │
-- │     não de isolamento. Com o tenant atual em 'avancado' os 3      │
-- │     módulos existem, então ligar seria no-op prático — mas fica   │
-- │     como escolha explícita, não efeito colateral desta migração.  │
-- │  2. public.calcular_status_assinatura(date,integer) NÃO existe,   │
-- │     porém assinatura_ativa(uuid) a chama. Bug DORMENTE: só falha  │
-- │     em runtime se um tenant tiver linha em `assinaturas` com      │
-- │     status != 'cancelado' (hoje não há) — o caminho NOT FOUND     │
-- │     retorna true antes de chamá-la. Corrigir junto da leva de     │
-- │     billing real, não aqui.                                       │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Semântica do NULL (usuário sem claim / super-admin `plataforma` com
-- tenant_id NULL), coerente com o isolamento da Leva 2:
--   • tenant_atual_tem_modulo(m) → tenant_tem_modulo(NULL,m) → sem
--     tenant com id NULL → FALSE (gating fecha). A policy da Leva 2 já
--     esconde toda linha quando tenant_atual_id() é NULL — nada a vazar.
--   • assinatura_atual_ativa() → assinatura_ativa(NULL) → sem linha de
--     assinatura → NOT FOUND → TRUE ("billing não configurado não é
--     inadimplência"). Sem vazamento: o isolamento da Leva 2 já barra
--     as linhas por tenant. O super-admin opera dado por IMPERSONATION
--     (JWT com o tenant alvo), então lá os wrappers resolvem o certo.
--
-- Idempotente (CREATE OR REPLACE FUNCTION). Nada no app muda.
--
-- PRÉ-REQUISITOS: Leva 1 (tenant_atual_id) e Leva 2 aplicadas; todos os
-- usuários relogados (já garantido — senão o PDV estaria vazio na Leva 2).
-- ══════════════════════════════════════════════════════════════════

-- ── Genérica de módulo (idêntica à 20260717) — CRIADA por drift ─────
-- Já multi-tenant por natureza: recebe o tenant_id por parâmetro.
-- Reafirmada aqui verbatim; se a 20260717 rodar um dia, é no-op.
CREATE OR REPLACE FUNCTION public.tenant_tem_modulo(p_tenant_id uuid, p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    JOIN public.planos_modulos pm ON pm.plano_codigo = t.plano_codigo
    WHERE t.id = p_tenant_id AND pm.modulo_codigo = p_modulo
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_tem_modulo(uuid, text) TO authenticated;

-- ── Wrapper 1 — gating de módulo, agora pelo JWT ────────────────────
-- Antes (na 20260717): (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
-- Agora: public.tenant_atual_id().
CREATE OR REPLACE FUNCTION public.tenant_atual_tem_modulo(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.tenant_tem_modulo(public.tenant_atual_id(), p_modulo);
$$;

GRANT EXECUTE ON FUNCTION public.tenant_atual_tem_modulo(text) TO authenticated;

-- ── Wrapper 2 — enforcement de assinatura, agora pelo JWT ───────────
-- assinatura_ativa(uuid) já existe em produção; aqui só troca-se como o
-- wrapper resolve o tenant.
-- Antes (na 20260720): assinatura_ativa((SELECT id FROM tenants ORDER BY created_at LIMIT 1))
-- Agora: assinatura_ativa(public.tenant_atual_id()).
CREATE OR REPLACE FUNCTION public.assinatura_atual_ativa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.assinatura_ativa(public.tenant_atual_id());
$$;

GRANT EXECUTE ON FUNCTION public.assinatura_atual_ativa() TO authenticated;

-- PRÓXIMA LEVA (20260726): role `plataforma` + RPC de impersonation +
-- base do Console (super-admin). É a S1-2 (console da plataforma).
