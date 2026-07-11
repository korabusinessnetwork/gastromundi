-- ══════════════════════════════════════════════════════════════════
-- Camada de Comercialização — Fase 2 (planos, módulos e gating)
-- docs/08_DECISOES/adr-005.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md
--
-- Registro central plano → módulos: 5 tiers superconjunto (Básico é
-- piso, cada plano seguinte repete tudo do anterior + o que é novo).
-- Fonte única — nenhum componente do app decide sozinho "o que esse
-- plano inclui"; front e backend só leem estas tabelas/funções.
--
-- O tenant atual (única linha de public.tenants, Fase 1) recebe o
-- plano 'avancado' por padrão — ele já usa hoje todos os módulos
-- existentes no app, então a operação real não perde nada com a
-- introdução do gating.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.planos (
  codigo text    PRIMARY KEY,
  nome   text    NOT NULL,
  ordem  integer NOT NULL UNIQUE,
  ativo  boolean NOT NULL DEFAULT true
);

INSERT INTO public.planos (codigo, nome, ordem) VALUES
  ('basico',   'Básico',   1),
  ('simples',  'Simples',  2),
  ('medio',    'Médio',    3),
  ('alto',     'Alto',     4),
  ('avancado', 'Avançado', 5)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.planos_modulos (
  plano_codigo  text NOT NULL REFERENCES public.planos(codigo),
  modulo_codigo text NOT NULL,
  PRIMARY KEY (plano_codigo, modulo_codigo)
);

-- Superconjunto: cada plano repete os módulos do anterior + os novos.
-- Códigos em português, iguais a src/constants/modulos.js (fonte
-- única espelhada nos dois lados — se um módulo novo nascer, precisa
-- entrar aqui E lá).
INSERT INTO public.planos_modulos (plano_codigo, modulo_codigo) VALUES
  -- Básico (piso): Cardápio/Produtos + PDV + Caixa
  ('basico', 'cardapio'), ('basico', 'pdv'), ('basico', 'caixa'),

  -- Simples: + Estoque + Pedidos
  ('simples', 'cardapio'), ('simples', 'pdv'), ('simples', 'caixa'),
  ('simples', 'estoque'), ('simples', 'pedidos'),

  -- Médio: + Mesas/Comandas + Cozinha + Alertas
  ('medio', 'cardapio'), ('medio', 'pdv'), ('medio', 'caixa'),
  ('medio', 'estoque'), ('medio', 'pedidos'),
  ('medio', 'mesas_comandas'), ('medio', 'cozinha'), ('medio', 'alertas'),

  -- Alto: + Financeiro + Clientes/Fiado + Relatórios
  ('alto', 'cardapio'), ('alto', 'pdv'), ('alto', 'caixa'),
  ('alto', 'estoque'), ('alto', 'pedidos'),
  ('alto', 'mesas_comandas'), ('alto', 'cozinha'), ('alto', 'alertas'),
  ('alto', 'financeiro'), ('alto', 'clientes'), ('alto', 'relatorios'),

  -- Avançado: + Jarvas + Multi-loja + Fiscal/Integrações nativas
  ('avancado', 'cardapio'), ('avancado', 'pdv'), ('avancado', 'caixa'),
  ('avancado', 'estoque'), ('avancado', 'pedidos'),
  ('avancado', 'mesas_comandas'), ('avancado', 'cozinha'), ('avancado', 'alertas'),
  ('avancado', 'financeiro'), ('avancado', 'clientes'), ('avancado', 'relatorios'),
  ('avancado', 'jarvas'), ('avancado', 'multiloja'), ('avancado', 'fiscal_integracoes')
ON CONFLICT (plano_codigo, modulo_codigo) DO NOTHING;

-- O tenant hoje usa TODOS os módulos existentes — plano mais alto,
-- para não perder acesso a nada quando o gating entrar em vigor.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plano_codigo text NOT NULL DEFAULT 'avancado' REFERENCES public.planos(codigo);

-- DROP + CREATE em cada policy: torna a migration segura para rodar
-- mais de uma vez (CREATE POLICY não tem "IF NOT EXISTS").
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planos_select_auth" ON public.planos;
CREATE POLICY "planos_select_auth"
  ON public.planos FOR SELECT
  USING (auth.role() = 'authenticated');

ALTER TABLE public.planos_modulos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planos_modulos_select_auth" ON public.planos_modulos;
CREATE POLICY "planos_modulos_select_auth"
  ON public.planos_modulos FOR SELECT
  USING (auth.role() = 'authenticated');
-- Sem política de escrita pelo app: planos/planos_modulos são geridos
-- só via migration/painel Supabase (mesma convenção do ADR-005 §2).

-- ── Funções de gating (camada 2 — fonte de verdade) ─────────────────

-- Genérica, já pronta para o multi-tenant real: recebe o tenant_id.
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

-- Conveniência para hoje (single-tenant, ADR-004): resolve "o" tenant
-- sozinha, sem exigir que toda política de RLS descubra o tenant_id.
-- Quando o multi-tenant real chegar, só o corpo desta função muda
-- (ex.: resolver por auth.uid() → membership) — as políticas que a
-- usam permanecem iguais.
CREATE OR REPLACE FUNCTION public.tenant_atual_tem_modulo(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.tenant_tem_modulo(
    (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1),
    p_modulo
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_atual_tem_modulo(text) TO authenticated;

-- ── Camada 2 — RLS de escrita para módulos que podem faltar em planos
-- inferiores (Nota: só os módulos abaixo têm tabela isolada e de
-- baixo risco para gating nesta fase. cozinha/pedidos/mesas_comandas
-- e cardápio/pdv/caixa NÃO são gated ainda nesta migração — ver nota
-- no plano técnico/resumo da Fase 2 sobre por quê. RESTRICTIVE
-- policies exigem que TODAS elas passem, além de pelo menos uma
-- política permissiva — é uma cláusula AND adicional, não substitui
-- as políticas de papel já existentes.) ─────────────────────────────

-- estoque (ausente no Básico)
DROP POLICY IF EXISTS "estoque_modulo_insert" ON public.estoque;
CREATE POLICY "estoque_modulo_insert" ON public.estoque
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_atual_tem_modulo('estoque'));
DROP POLICY IF EXISTS "estoque_modulo_update" ON public.estoque;
CREATE POLICY "estoque_modulo_update" ON public.estoque
  AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_atual_tem_modulo('estoque'))
  WITH CHECK (public.tenant_atual_tem_modulo('estoque'));
DROP POLICY IF EXISTS "estoque_modulo_delete" ON public.estoque;
CREATE POLICY "estoque_modulo_delete" ON public.estoque
  AS RESTRICTIVE FOR DELETE
  USING (public.tenant_atual_tem_modulo('estoque'));

-- lancamentos / financeiro (ausente abaixo do Alto)
DROP POLICY IF EXISTS "lancamentos_modulo_insert" ON public.lancamentos;
CREATE POLICY "lancamentos_modulo_insert" ON public.lancamentos
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_atual_tem_modulo('financeiro'));
DROP POLICY IF EXISTS "lancamentos_modulo_update" ON public.lancamentos;
CREATE POLICY "lancamentos_modulo_update" ON public.lancamentos
  AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_atual_tem_modulo('financeiro'))
  WITH CHECK (public.tenant_atual_tem_modulo('financeiro'));
DROP POLICY IF EXISTS "lancamentos_modulo_delete" ON public.lancamentos;
CREATE POLICY "lancamentos_modulo_delete" ON public.lancamentos
  AS RESTRICTIVE FOR DELETE
  USING (public.tenant_atual_tem_modulo('financeiro'));

-- clientes (ausente abaixo do Alto)
DROP POLICY IF EXISTS "clientes_modulo_insert" ON public.clientes;
CREATE POLICY "clientes_modulo_insert" ON public.clientes
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.tenant_atual_tem_modulo('clientes'));
DROP POLICY IF EXISTS "clientes_modulo_update" ON public.clientes;
CREATE POLICY "clientes_modulo_update" ON public.clientes
  AS RESTRICTIVE FOR UPDATE
  USING (public.tenant_atual_tem_modulo('clientes'))
  WITH CHECK (public.tenant_atual_tem_modulo('clientes'));
DROP POLICY IF EXISTS "clientes_modulo_delete" ON public.clientes;
CREATE POLICY "clientes_modulo_delete" ON public.clientes
  AS RESTRICTIVE FOR DELETE
  USING (public.tenant_atual_tem_modulo('clientes'));
