# ADR-NNN — TÍTULO DESCRITIVO

**Status**: Proposto | Aceito | Supersedido  
**Data**: AAAA-MM-DD  
**Decisores**: Nome1, Nome2  
**Supersede**: (se há ADR anterior, ex: ADR-001)  
**Supersedido por**: (se há ADR posterior que revoga esta)

---

## Contexto

Descreva o problema ou situação que levou a essa decisão. Inclua:

- Problema que está sendo resolvido
- Restrições (tempo, orçamento, conhecimento, arquitetura)
- Contexto histórico ou dependências
- Por quê a decisão é necessária agora

Exemplo:

> Precisávamos escolher um banco de dados que suportasse multi-tenancy nativa, RLS e autenticação real-time para o PDV offline. O projeto tinha orçamento limitado e prazo de 3 meses.

---

## Decisão

Declare claramente qual foi a decisão. Use imperative voice.

Exemplo:

> Vamos usar **Supabase** como plataforma de database, autenticação e realtime.

---

## Alternativas Consideradas

Liste alternativas avaliadas e por que foram descartadas.

### 1. Firebase (Firestore + Auth)

- **Prós**: Multi-tenancy simples, escalabilidade provada, auth built-in
- **Contras**: Vendor lock-in forte, preço pode subir, RLS limitado, sem SQL direto
- **Descartado porque**: RLS inadequado para multi-tenancy rígido; custo imprevisível em escala

### 2. PostgreSQL (RDS) + Cognito/Auth0

- **Prós**: Total controle, SQL direto, RLS nativo do PostgreSQL, open-source friendly
- **Contras**: Precisa gerenciar infraestrutura, escalabilidade = mais ops, custo de operação
- **Descartado porque**: Fase de bootstrap precisa de managed service; ops de infra seria overhead

### 3. MongoDB + custom auth

- **Prós**: Escalabilidade horizontal, schema-less
- **Contras**: Sem RLS, segurança multi-tenant manual, sem realtime nativo
- **Descartado porque**: RLS manual = risco de data leak, realtime custom = complexidade

---

## Consequências

### Positivas

- Multi-tenancy nativa + RLS automático = segurança garantida
- Auth real-time, 2FA, JWT out-of-box
- PostgreSQL full-featured: JOINs, indexes, transactions ACID
- Realtime subscriptions para PDV offline ↔ sync
- Pricing previsível (tier baseado em tokens/queries, não em dados armazenados)
- Comunidade ativa, documentação em português

### Negativas / Trade-offs

- Vendor lock-in do Supabase (mitigado: schema é PostgreSQL puro, exportável)
- Custo cresce com escala (mitigado: pricing está na faixa, documentado em restrictions.md)
- Aprox. 2 semanas de learning curve (Supabase + RLS)
- Realtime tem latência ~100-500ms (ok para PDV, não para jogos)

---

## Referências

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [ADR-001 — Autenticação: Clerk vs Auth0](./adr-001-autenticacao.md) — depende desta decisão
- `docs/04_MODELAGEM/multi-tenancy.md` — como RLS isolará tenants
- `memory/restrictions.md` — restrições de custo que influenciaram decisão

---

## Notas de Implementação

- Migrations de schema vivem em `supabase/migrations/`
- Toda table assume `tenant_id` + RLS policy
- Enable realtime em `supabase/config.yml` para tables que precisam
- Testes de RLS em `src/__tests__/security/rls.test.js`

---

## Como Usar Este Template

1. Copie este arquivo: `cp docs/08_DECISOES/adr-000-template.md docs/08_DECISOES/adr-NNN-novo-titulo.md`
2. Preencha **Status**, **Data**, **Decisores** no cabeçalho
3. Preencha todas as seções (Contexto, Decisão, etc.)
4. Submeta para revisão (pull request, discussão de time)
5. Quando aceita, mude Status para "Aceito"
6. Se depois for supersedida, crie novo ADR e linkee ambos com "Supersede"/"Supersedido por"
7. Nunca delete ADRs antigos — marca como histórico

