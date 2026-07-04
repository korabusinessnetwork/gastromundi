# Relacionamentos — GastroMundi

## Objetivo
Documentar os relacionamentos entre entidades do GastroMundi com cardinalidade, tipo de join e regras de integridade referencial.

## Contexto
Relacionamentos bem definidos garantem integridade dos dados, facilitam queries e documentam o modelo mental do domínio para toda a equipe.

## Regras Gerais
- Foreign keys devem sempre ter índice criado
- Cascade delete deve ser explicitamente justificado — padrão é RESTRICT
- Relacionamentos N:N usam tabela de junção nomeada com os dois lados (ex: `membros` para usuário ↔ estabelecimento)

## Validações
- Toda FK deve referenciar PK existente
- Tabelas de junção devem ter PK composta ou UUID próprio

## Permissões
- Alterações em relacionamentos exigem migração revisada pelo tech lead

## Exceções
- Soft deletes podem manter registros órfãos temporariamente — documentar explicitamente

## Auditoria
- Diagrama deve ser atualizado a cada nova entidade ou relacionamento

## Eventos
- `schema.relationship.added` — novo relacionamento criado
- `schema.relationship.changed` — cardinalidade ou regra alterada

## Configurações Futuras
- Gerar diagrama ER automaticamente via ferramenta (ex: Supabase Dashboard, dbdiagram.io)
- Documentar relacionamentos polimórficos quando necessários

## Casos de Uso
- Planejamento de queries complexas
- Revisão de schema
- Onboarding técnico

## Critérios de Aceite
- [ ] Diagrama ER está atualizado
- [ ] Todos os relacionamentos têm cardinalidade documentada
- [ ] Regras de cascade estão especificadas

---

## Diagrama de Relacionamentos

```
Usuário Clerk (externo — ADR-002)
    │ 1:1 (via perfis.clerk_user_id, unique)
    ▼
public.perfis ─────────┐
                       │ N:N (via membros, com papel)
                       ▼
public.estabelecimentos (tenant)
                       │ 1:N
                       ▼
[entidades dos módulos — todas com tenant_id]
(produtos, vendas, pedidos, caixa, estoque, lançamentos, clientes)
```

## Tabela de Relacionamentos

| Entidade A | Cardinalidade | Entidade B | Join / FK | Cascade |
|------------|---------------|------------|-----------|---------|
| usuário Clerk | 1:1 | perfis | perfis.clerk_user_id (unique, sem FK — Clerk é externo) | N/A (limpeza via webhook/rotina) |
| perfis | N:N | estabelecimentos | via `membros` (usuario_id, tenant_id) + `papel` | DELETE CASCADE |
| estabelecimentos | 1:N | membros | membros.tenant_id → estabelecimentos.id | DELETE CASCADE |
| estabeleciment