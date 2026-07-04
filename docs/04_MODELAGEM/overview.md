# Modelagem de Dados — Visão Geral — GastroMundi

## Objetivo
Documentar a modelagem de dados do GastroMundi: entidades, atributos, relacionamentos e esquema do banco de dados.

## Contexto
GastroMundi utiliza PostgreSQL via Supabase como banco de dados principal. A modelagem relacional com RLS garante isolamento de dados por **estabelecimento (tenant)** e segurança por padrão (decisões 002 e 008).

## Regras Gerais
- Toda entidade deve ser documentada em `entities.md` antes de ser criada no banco
- O esquema em `database-schema.md` é a fonte de verdade do banco — código SQL e ORM devem estar em sincronia com ele
- Toda tabela deve ter: `id` (UUID), `created_at`, `updated_at`
- RLS deve ser ativado em todas as tabelas com dados de estabelecimento (tenant)
- Dados sensíveis (ex: tokens, senhas) nunca devem ser armazenados em texto puro

## Validações
- Migrações devem ser revisadas antes de aplicadas em produção
- Colunas `NOT NULL` devem ter justificativa documentada
- Índices devem ser criados para todas as colunas usadas em filtros frequentes

## Permissões
- Alterações de schema em produção: apenas tech lead
- Criação de novas tabelas exige revisão de modelagem

## Exceções
- Tabelas de auditoria/log podem ter schema mais flexível (ex: JSONB para payloads variáveis)

## Auditoria
- Histórico de migrações deve ser mantido
- Alterações de schema em produção devem ser registradas com data, autor e motivo

## Eventos
- `schema.migration.applied` — migração aplicada
- `schema.table.created` — nova tabela criada
- `schema.table.altered` — tabela alterada

## Configurações Futuras
- Definir estratégia de soft delete (campo `deleted_at`) vs hard delete
- Planejar particionamento de tabelas de alto volume
- Avaliar uso de Supabase Vault para dados sensíveis

## Casos de Uso
- Planejamento de novas features
- Code review de PRs com mudanças de schema
- Onboarding técnico
- Auditoria de segurança de dados

## Critérios de Aceite
- [ ] Todas as entidades principais estão documentadas
- [ ] Relacionamentos estão mapeados com cardinalidade
- [ ] Schema SQL está atualizado e sincronizado com a documentação
- [ ] RLS está documentado para todas as tabelas relevantes

---

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [entities.md](./entities.md) | Descrição de cada entidade e seus atributos |
| [database-schema.md](./database-schema.md) | DDL SQL e configuração de tabelas |
| [relationships.md](./relationships.md) | Diagrama e descrição dos relacionamentos |
