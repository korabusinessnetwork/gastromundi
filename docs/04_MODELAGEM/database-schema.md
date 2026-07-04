# Esquema do Banco de Dados — GastroMundi

## Objetivo
Documentar o DDL SQL completo do banco de dados GastroMundi, servindo como fonte de verdade para criação e manutenção do schema.

## Contexto
O banco de dados é PostgreSQL gerenciado pelo Supabase. O schema inclui tabelas, tipos, índices, políticas de RLS e triggers necessários para o funcionamento do sistema.

## Regras Gerais
- Este arquivo deve estar sempre sincronizado com o banco de produção
- Toda migração deve ser documentada com data, autor e motivo
- RLS deve ser habilitado em todas as tabelas com dados de estabelecimento (tenant)
- Usar UUID (gen_random_uuid()) como PK padrão
- Timestamps com timezone: `timestamptz`

## Validações
- Migrações devem ser testadas em staging antes de aplicadas em produção
- Scripts de rollback devem ser preparados para toda migração de risco

## Permissões
- Apenas tech lead pode aplicar migrações em produção
- Alterações de schema devem ser revisadas em PR

## Exceções
- Migrações de emergência podem ser aplicadas diretamente com registro retroativo obrigatório

## Auditoria
- Histórico de migrações mantido via Supabase Dashboard e/ou Supabase CLI
- Todo script de migração deve ter comentário de contexto

## Eventos
- `schema.migrated` — migração aplicada com sucesso
- `schema.rollback` — rollback de migração executado

## Configurações Futuras
- Adotar Supabase CLI para gerenciamento de migrações
- Criar ambiente de migração automatizada no CI/CD

## Casos de Uso
- Criação de ambiente de desenvolvimento
- Onboarding técnico
- Auditoria de schema
- Planejamento de migrações

## Critérios de Aceite
- [ ] Schema está completo e executável
- [ ] RLS está configurado para todas as tabelas relevantes
- [ ] Índices estão definidos para colunas de filtro
- [ ] Triggers de `updated_at` estão configurados

---

## Schema SQL

> **Fonte de verdade do schema: `packages/db/src/schema/` (Drizzle ORM)**, aplicado via `pnpm --filter @workspace/db run push` (ADR-002). O SQL abaixo é a referência equivalente. Com auth via **Clerk** (decisão 012), não existe `auth.users` nem `auth.uid()`: o vínculo é `perfis.clerk_user_id` e o isolamento por tenant é aplicado na **camada de serviços da API** (RLS é opcional/complementar e exigiria outro mecanismo de contexto).

```sql
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- fornece gen_random_uuid()

-- Tipos customizados (decisões 002 e 008)
CREATE TYPE segmento_estabelecimento AS ENUM ('restaurante', 'varejo');
CREATE TYPE plano AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE papel_usuario AS ENUM ('dono', 'gerente', 'caixa', 'atendente', 'cozinha');

-- Tabela: estabelecimentos (tenant — unidade de isolamento)
CREATE TABLE public.estabelecimentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  segmento    segmento_estabelecimento NOT NULL,
  plano       plano NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Tabela: perfis (vinculada ao usuário Clerk via clerk_user_id — ADR-002)
CREATE TABLE public.perfis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  text NOT NULL UNIQUE,
  nome           text NOT NULL,
  avatar_url     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Tabela: membros (vínculo usuário ↔ estabelecimento + papel)
CREATE TABLE public.membros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  papel       papel_usuario NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usuario_id)
);
CREATE INDEX idx_membros_tenant  ON public.membros (tenant_id);
CREATE INDEX idx_membros_usuario ON public.membros (usuario_id);

-- Função: estabelecimentos do usuário autenticado (base do RLS por tenant)
CREATE OR REPLACE FUNCTION public.tenants_do_usuario()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM public.membros WHERE usuario_id = auth.uid();
$$;

-- RLS: perfis (cada um vê/edita o próprio)
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Perfil próprio (select)" ON public.perfis FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Perfil próprio (update)" ON public.perfis FOR UPDATE USING (auth.uid() = id);

-- RLS: estabelecimentos e membros (isolamento por tenant)
ALTER TABLE public.estabelecimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver estabelecimentos do usuário"
  ON public.estabelecimentos FOR SELECT
  USING (id IN (SELECT public.tenants_do_usuario()));

ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ver membros do mesmo tenant"
  ON public.membros FOR SELECT
  USING (tenant_id IN (SELECT public.tenants_do_usuario()));

-- Padrão de RLS para tabelas de módulos (todas têm tenant_id):
--   USING (tenant_id IN (SELECT public.tenants_do_usuario()))

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RET