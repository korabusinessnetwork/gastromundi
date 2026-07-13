-- ══════════════════════════════════════════════════════════════════
-- Correção de drift — restaura tenants.plano_codigo + catálogo de planos
-- docs/08_DECISOES/adr-005.md · Fase 2 (planos/módulos)
--
-- SINTOMA: no app, TODO módulo aparece como "não está no seu plano"
-- (ex.: Frente de Caixa bloqueada). CAUSA: o banco de produção está
-- SEM a coluna public.tenants.plano_codigo — a migração original
-- 20260717_planos_modulos.sql (que a adiciona, linha 70-71) não entrou
-- completa. Sem a coluna, o bootstrap do front (src/lib/tenant.js:41,
-- `select ... plano_codigo ...`) FALHA, a lista de módulos vem vazia e
-- moduloHabilitado() responde "não" para tudo. Nada disso tem relação
-- com o isolamento multi-tenant (Levas 1/2) — é drift pré-existente.
--
-- Esta migração é idempotente e cobre os três itens que a Fase 2
-- deveria ter deixado, caso qualquer um esteja faltando: (1) catálogo
-- public.planos, (2) mapa public.planos_modulos, (3) a coluna
-- tenants.plano_codigo apontando para o plano mais alto ('avancado'),
-- que é o que o único tenant de hoje deve ter (ADR-005: "usa todos os
-- módulos existentes, não perde nada com o gating").
-- ══════════════════════════════════════════════════════════════════

-- 1. Catálogo de planos (idempotente — mesma definição da 20260717)
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

-- 2. Mapa plano→módulos (superconjunto, igual à 20260717). Só o
--    'avancado' importa para o tenant atual, mas repõe o conjunto todo
--    para o catálogo ficar íntegro.
CREATE TABLE IF NOT EXISTS public.planos_modulos (
  plano_codigo  text NOT NULL REFERENCES public.planos(codigo),
  modulo_codigo text NOT NULL,
  PRIMARY KEY (plano_codigo, modulo_codigo)
);

INSERT INTO public.planos_modulos (plano_codigo, modulo_codigo) VALUES
  ('basico', 'cardapio'), ('basico', 'pdv'), ('basico', 'caixa'),
  ('simples', 'cardapio'), ('simples', 'pdv'), ('simples', 'caixa'),
  ('simples', 'estoque'), ('simples', 'pedidos'),
  ('medio', 'cardapio'), ('medio', 'pdv'), ('medio', 'caixa'),
  ('medio', 'estoque'), ('medio', 'pedidos'),
  ('medio', 'mesas_comandas'), ('medio', 'cozinha'), ('medio', 'alertas'),
  ('alto', 'cardapio'), ('alto', 'pdv'), ('alto', 'caixa'),
  ('alto', 'estoque'), ('alto', 'pedidos'),
  ('alto', 'mesas_comandas'), ('alto', 'cozinha'), ('alto', 'alertas'),
  ('alto', 'financeiro'), ('alto', 'clientes'), ('alto', 'relatorios'),
  ('avancado', 'cardapio'), ('avancado', 'pdv'), ('avancado', 'caixa'),
  ('avancado', 'estoque'), ('avancado', 'pedidos'),
  ('avancado', 'mesas_comandas'), ('avancado', 'cozinha'), ('avancado', 'alertas'),
  ('avancado', 'financeiro'), ('avancado', 'clientes'), ('avancado', 'relatorios'),
  ('avancado', 'jarvas'), ('avancado', 'multiloja'), ('avancado', 'fiscal_integracoes')
ON CONFLICT (plano_codigo, modulo_codigo) DO NOTHING;

-- 3. A coluna que faltava + tenant no plano mais alto. ADD COLUMN é
--    idempotente; o UPDATE reafirma 'avancado' caso a coluna já
--    existisse com outro valor.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS plano_codigo text NOT NULL DEFAULT 'avancado'
  REFERENCES public.planos(codigo);

UPDATE public.tenants
   SET plano_codigo = 'avancado'
 WHERE plano_codigo IS DISTINCT FROM 'avancado';

-- 4. RLS de catálogo (idêntica à 20260717): planos/planos_modulos são
--    lookup global — leitura para qualquer logado, escrita só via
--    migration/painel (sem policy de INSERT/UPDATE/DELETE). Reafirmado
--    aqui porque, se as tabelas foram (re)criadas por esta migração,
--    nascem sem RLS. DROP+CREATE torna a policy reexecutável.
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
