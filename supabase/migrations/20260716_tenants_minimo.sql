-- ══════════════════════════════════════════════════════════════════
-- Camada de Comercialização — Fase 1 (tenants mínimo)
-- docs/08_DECISOES/adr-005.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md
--
-- Pré-requisito mínimo para planos/billing/theming (ADR-005 §6):
-- cria a tabela `tenants` com EXATAMENTE UMA LINHA (a instalação atual
-- do GastroMundi). NÃO é a migração multi-tenant completa (decisão
-- 002) — nenhuma tabela existente ganha `tenant_id` nesta fase, nada
-- muda no comportamento do app single-establishment de hoje.
--
-- `plano_codigo`, `assinaturas` etc. vêm em fases seguintes (Fase 2+);
-- esta migração só estabelece a base para os `REFERENCES public.tenants(id)`
-- futuros.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tenants (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text        NOT NULL,
  tema       jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (nome)
SELECT 'GastroMundi'
WHERE NOT EXISTS (SELECT 1 FROM public.tenants);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- DROP + CREATE em vez de só CREATE: torna a migration segura para
-- rodar mais de uma vez (CREATE POLICY não tem "IF NOT EXISTS").
DROP POLICY IF EXISTS "tenants_select_auth" ON public.tenants;
CREATE POLICY "tenants_select_auth"
  ON public.tenants FOR SELECT
  USING (auth.role() = 'authenticated');

-- Sem política de INSERT/UPDATE/DELETE pelo app nesta fase: a única
-- linha é gerida via migration/painel Supabase, não pela aplicação.
