# Entidades — GastroMundi

## Objetivo
Descrever todas as entidades do domínio GastroMundi: seus atributos, tipos, obrigatoriedade e semântica de negócio.

## Contexto
Entidades são os objetos centrais do sistema. Cada entidade corresponde a uma tabela no banco de dados e representa um conceito de negócio relevante.

## Regras Gerais
- Toda entidade deve ter `id` (UUID), `created_at` e `updated_at`
- Atributos sensíveis devem ser marcados como `[SENSÍVEL]`
- Entidades que pertencem a um estabelecimento devem ter `tenant_id` (estabelecimento_id) como foreign key — base do isolamento por RLS (decisão 002)
- Nomes de entidades são sempre em inglês (snake_case no banco, PascalCase no código)

## Validações
- UUID gerado automaticamente pelo banco (gen_random_uuid())
- Timestamps gerenciados pelo banco (DEFAULT now())
- Foreign keys devem ter índice criado

## Permissões
- Acesso a entidades regulado por RLS no Supabase
- Entidades com dados pessoais seguem política de privacidade

## Exceções
- Tabelas de log/auditoria podem ter schema mais flexível

## Auditoria
- Toda entidade com dados pessoais deve estar mapeada no registro de tratamento de dados (LGPD)

## Eventos
> _A preencher conforme entidades forem criadas_

## Configurações Futuras
- Adicionar campo `deleted_at` para soft delete quando necessário
- Avaliar particionamento para entidades de alto volume

## Casos de Uso
- Planejamento de features
- Revisão de schema
- Implementação de repositórios/serviços

## Critérios de Aceite
- [ ] Todas as entidades do MVP estão documentadas
- [ ] Atributos obrigatórios estão marcados
- [ ] Tipos de dados estão especificados
- [ ] Relacionamentos com outras entidades estão referenciados

---

## estabelecimentos (tenant)

Unidade de isolamento multi-tenant (decisão 002). Todo dado de negócio pertence a um estabelecimento.

| Atributo | Tipo | Obrigatório | Descrição |
|----------|------|-------------|-----------|
| id | uuid | ✅ | PK |
| nome | text | ✅ | Nome do estabelecimento |
| segmento | enum | ✅ | restaurante \| varejo |
| plano | enum | ✅ | free \| pro \| enterprise |
| created_at | timestamptz | ✅ | Auto |
| updated_at | timestamptz | ✅ | Auto |

## perfis (usuários)

Perfil vinculado ao usuário **Clerk** (ADR-002 / decisão 012) via `clerk_user_id`. Um usuário pode pertencer a um ou mais estabelecimentos via `membros`.

| Atributo | Tipo | Obrigatório | Descrição |
|----------|------|-------------|-----------|
| id | uuid | ✅ | PK |
| clerk_user_id | text | ✅ | Unique — vincula ao usuário Clerk [SENSÍVEL: e-mail e credenciais vivem no Clerk] |
| nome | text | ✅ | Nome de exibição |
| avatar_url | text | ❌ | URL do avatar |
| created_at | timestamptz | ✅ | Auto |
| updated_at | timestamptz | ✅ | Auto |

## membros (vínculo usuário ↔ estabelecimento)

Define o **papel** do usuário em cada estabelecimento (decisão 008) e é a base do isolamento por tenant na camada de serviços da API (ADR-002; RLS é opcional/complementar).

| Atributo | Tipo | Obrigatório | Descrição |
|----------|------|-------------|-----------|
| id | uuid | ✅ | PK |
| tenant_id | uuid | ✅ | FK → estabelecimentos.id |
| usuario_id | uuid | ✅ | FK → perfis.id |
| papel | enum | ✅ | dono \| gerente \| caixa \| atendente \| cozinha |
| created_at | timestamptz | ✅ | Auto |

> Entidades dos módulos (produto