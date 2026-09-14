# 04 — MODELAGEM · {{PRODUTO}}

> Estrutura de dados: entities, relationships, schema. Single source of truth do banco.

## O que vive aqui

- **Entidades**: descrição de cada tabela, seu propósito, ciclo de vida
- **Relacionamentos**: FK, cardinalidades, constraints, índices
- **Schema**: DDL (CREATE TABLE...), migrations, versionamento
- **Multi-tenancy**: como RLS (Row Level Security) isola dados por tenant
- **Padrões de dados**: soft delete, timestamps (created/updated), status enums
- **Diagramas ER**: visual do relacionamento entre tabelas

## O que NÃO vive aqui

- Queries/endpoints que usam os dados → `07_APIS/`
- Regras de como usar os dados → `03_REGRAS_DE_NEGOCIO/`
- Componentes que exibem os dados → `06_COMPONENTES/`
- Infra do banco (backup, replicação) → `01_ARQUITETURA/`

## Arquivos sugeridos

- `entities.md` — lista de tabelas com descrição, campos, tipos
- `relationships.md` — diagrama e documentação de FKs e cardinalidades
- `database-schema.md` — DDL organizado, com comentários
- `migrations.md` — histórico e convenção de nomes (ex: 2026-01-15_create_users.sql)
- `diagramas/er.md` — diagrama ER (Mermaid ou similar)
- `multi-tenancy.md` — estratégia RLS, como garantir isolamento

## Como preencher

1. **Desenhe o ER primeiro**: entidades, relacionamentos, cardinalidades
2. **Schema em produção prevalece**: `supabase/schema.sql` é a verdade; doc descreve + explica
3. **Toda nova tabela tem migration**: nunca muda schema direto (rollback possível)
4. **Nomes em inglês, comentários em português**: `usuarios` → `users`, `describe table`
5. **Multi-tenant por padrão**: toda tabela pensa em tenant_id, RLS, isolamento

## Ligações

- `supabase/schema.sql` — schema real (fonte de verdade técnica)
- `supabase/migrations/` — histórico de mudanças
- `02_DESIGN_SYSTEM/` — padrões visuais que refletem estrutura (ex: fields)
- `03_REGRAS_DE_NEGOCIO/` — o que as regras esperam da modelagem
