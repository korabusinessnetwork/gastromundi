# Arquitetura Geral — GastroMundi

## Objetivo
Descrever a visão macro da arquitetura do sistema GastroMundi: camadas, responsabilidades, fronteiras e princípios que guiam todas as decisões técnicas.

## Contexto
GastroMundi é construído sobre React + Vite + Tailwind (frontend), uma **API Express contract-first** com **Drizzle ORM** (backend), **PostgreSQL hospedado no Supabase** (banco) e **Clerk** (autenticação). A arquitetura prioriza velocidade de desenvolvimento, escalabilidade progressiva e manutenibilidade a longo prazo. Ver [ADR-002](../08_DECISOES/adr-002.md) (revisa o ADR-001).

## Regras Gerais
- O frontend é responsável apenas por apresentação e interação; lógica de negócio vive na **API Express** (camada de serviços do servidor)
- Comunicação entre frontend e backend ocorre exclusivamente via **API HTTP do `api-server`** (contrato definido em OpenAPI, hooks gerados pelo Orval), documentada em `docs/07_APIS/`
- O frontend **nunca acessa o banco diretamente**; o acesso a dados é exclusivo da API (Drizzle)
- Toda camada deve ter responsabilidade única e bem definida
- Segurança por padrão: isolamento por `tenant_id` aplicado na API e, opcionalmente, via RLS (Row Level Security) no PostgreSQL

## Validações
- Credenciais de banco (`SUPABASE_DATABASE_URL`) e a `service_role`/chaves administrativas nunca podem ser expostas no frontend
- Toda nova rota ou endpoint deve ser definida no OpenAPI e documentada antes de ser implementada

## Permissões
- Mudanças na arquitetura de alto nível exigem ADR aprovado em `docs/08_DECISOES/`
- Acesso ao banco de dados de produção é restrito ao tech lead e ao Supabase dashboard

## Exceções
- Protótipos e provas de conceito podem temporariamente violar fronteiras arquiteturais, desde que marcados com `[POC]` e com prazo de refatoração definido

## Auditoria
- Diagrama de arquitetura deve ser atualizado a cada mudança estrutural relevante
- Revisão da arquitetura: semestral ou após mudança de stack

## Eventos
- `architecture.changed` — mudança estrutural relevante registrada
- `architecture.reviewed` — revisão periódica realizada

## Configurações Futuras
- Avaliar Edge Functions do Supabase para lógica sensível à latência
- Planejar estratégia de multi-tenancy conforme escala
- Definir estratégia de CDN para assets estáticos

## Casos de Uso
- Onboarding técnico
- Avaliação de novas tecnologias
- Planejamento de escalabilidade
- Decisões de infraestrutura

## Critérios de Aceite
- [ ] Diagrama de camadas está atualizado
- [ ] Responsabilidades de cada camada estão descritas
- [ ] Fronteiras de segurança estão mapeadas
- [ ] Stack principal está documentada com justificativas

---

## Diagrama de Camadas

```
┌─────────────────────────────────────────┐
│              Usuário (Browser)           │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│         Frontend (React + Vite)          │
│  • Componentes UI                        │
│  • Gerenciamento de estado               │
│  • Roteamento (wouter)                   │
│  • Auth no cliente (Clerk) + API client  │
└────────────────────┬────────────────────┘
                     │ HTTP (cookie de sessão Clerk) — hooks gerados pelo Orval
┌────────────────────▼────────────────────┐
│        API (Express 5 · api-server)      │
│  • Auth/sessão (Clerk middleware)        │
│  • Validação de contratos (Zod)          │
│  • Camada de serviços (regras + tenant)  │
│  • Acesso a dados (Drizzle ORM)          │
└────────────────────┬────────────────────┘
                     │ SQL (SUPABASE_DATABASE_URL)
┌────────────────────▼────────────────────┐
│   PostgreSQL gerenciado (Supabase host)  │
│  • Tabelas multi-tenant (tenant_id)      │
│  • RLS opcional por tenant               │
└─────────────────────────────────────────┘

Auth: Clerk (gerenciado pela Replit) — cookie de sessão no web; middleware no Express.
```

## Princípios Arquiteturais

1. **Separação de responsabilidades.** Apresentação (frontend) ≠ lógica de negócio (API Express) ≠ dados (PostgreSQL via Drizzle).
2. **Segurança por padrão.** RLS ativo em todas as tabelas; menor privilégio sempre.
3. **Contrato explícito.** Toda fronteira (API, formulário, evento) é validada por schema (Zod).
4. **Baixo acoplamento.** Módulos se comunicam por Event Bus e contratos, não por dependências diretas.
5. **Isolamento de fornecedor.** Acesso a dados concentrado na camada de serviços da API (Drizzle), reduzindo lock-in; o Supabase é só o host do Postgres e pode ser trocado alterando `SUPABASE_DATABASE_URL`.
6. **Escalabilidade progressiva.** Decisões simples no MVP, com caminho claro de evolução (multi-tenant, cache, CDN).
7. **Observabilidade.** Eventos de domínio auditáveis; erros nunca silenciados.

---

## Arquitetura Frontend

O frontend é uma SPA em React + Vite, organizada **por módulos/features** (ver `memory/patterns.md`).

```
┌──────────────────────────────────────────────┐
│                  App Shell                     │
│  Providers globais (Context API):              │
│  Auth (Clerk) · Tenant · Theme · FeatureFlags  │
└───────────────┬────────────────────────────────┘
                │
   ┌────────────┼────────────┐
   ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│ Módulo │  │ Módulo │  │ Módulo │   (PDV, Caixa, Pedidos,
│  (UI)  │  │  (UI)  │  │  (UI)  │    Cozinha, Estoque…)
└───┬────┘  └───┬────┘  └───┬────┘
    │           │           │
    ▼           ▼           ▼
┌────────────────────────────────┐
│   API client (hooks Orval)      │  ← único ponto de acesso a dados
│   TanStack Query (cache)        │
└───────────────┬─────────────────┘
                │  HTTP (cookie de sessão Clerk)
                ▼
        API Express (api-server) ──▶ Drizzle ──▶ PostgreSQL (Supabase)
```

**Responsabilidades por camada:**

| Camada | Responsabilidade |
|--------|------------------|
| App Shell / Providers | Estado global de UI: sessão (Clerk), tenant atual, tema, feature flags |
| Módulos (UI) | Componentes e telas de cada feature; apenas apresentação e interação |
| API client (hooks Orval + TanStack Query) | Chamadas à API, cache de estado de servidor, tipos/validação (Zod) |
| Roteamento | Navegação (wouter, com `base` por artefato), incluindo rotas protegidas por sessão/papel |

**Regras:**
- Componentes nunca chamam o banco diretamente — sempre via API client (hooks Orval); o acesso ao Postgres é exclusivo da API.
- Estado de servidor mora no TanStack Query (cache); estado global de UI mora em contextos; estado local mora no componente.

---

## Event Bus

Mecanismo interno de comunicação **desacoplada** entre módulos. Em vez de um módulo chamar outro diretamente, ele **publica um evento**; módulos interessados **assinam** e reagem.

**Por quê:** reduz acoplamento, habilita reações cross-módulo (ex.: faturamento reage a `user.invited`) e cria uma trilha de auditoria natural.

**Convenções:**
- Nomes de eventos em `dot.case`, no formato `dominio.acao` (ex.: `decision.added`, `user.invited`, `billing.upgraded`).
- Eventos descrevem **fatos que já aconteceram** (passado), não comandos.
- O catálogo canônico de eventos por domínio vive nos respectivos arquivos de `docs/03_REGRAS_DE_NEGOCIO/` e `docs/03_REGRAS_DE_NEGOCIO/` (seção "Eventos").

```
Módulo A ──publica──▶ [ Event Bus ] ──notifica──▶ Módulo B
                          │
                          └──notifica──▶ Auditoria / Analytics
```

**Limites:** o Event Bus é para reações assíncronas e desacopladas; fluxos que exigem resposta imediata e transacional usam chamadas diretas à camada de serviços.

---

## Context API

Gerencia o **estado global de UI** sem bibliotecas externas de estado (decisão 003). Cada contexto tem responsabilidade única e expõe um provider no App Shell.

| Contexto | Responsabilidade |
|----------|------------------|
| `AuthContext` | Sessão do usuário, login/logout, dados do usuário atual |
| `TenantContext` | Tenant ativo, papel do usuário no tenant, troca de tenant |
| `ThemeContext` | Tema (claro/escuro) e preferências visuais |
| `FeatureFlagsContext` | Flags ativas para o usuário/tenant atual |

**Regras:**
- Context API é para estado **global de UI**, não para cache de dados de servidor (esse fica na camada de data-fetching).
- Evitar "mega-contexto": preferir contextos pequenos e focados para limitar re-renderizações.
- Se o estado global crescer além do que a Context API suporta confortavelmente, reavaliar via ADR (alternativas como Zustand/Jotai estão registradas como decisão em aberto).

---

## Feature Flags

Permitem **ligar/desligar funcionalidades** sem novo deploy (decisão 005).

**Usos:** entregas graduais (rollout por %), testes A/B, *kill-switch* de emergência, e gating de recursos por plano (free/pro/enterprise).

**Modelo conceitual:**
- Uma flag tem: chave, descrição, estado (on/off) e regras de elegibilidade (por tenant, plano ou usuário).
- A avaliação acontece numa única fonte (`FeatureFlagsContext`), nunca espalhada em condicionais soltas pelo código.
- Flags temporárias (de rollout) têm prazo de remoção; flags permanentes (de plano) são parte do produto.

```
Flag definida ──▶ Regras (tenant/plano/usuário) ──▶ FeatureFlagsContext ──▶ UI decide o que mostrar
```

**Restrição:** nenhuma flag deve expor recurso pago no plano free sem decisão registrada (ver `memory/restrictions.md`).

---

## Arquitetura Multi-tenant

GastroMundi é **multi-tenant**: cada organização (tenant) tem seus dados isolados, compartilhando a mesma aplicação e banco.

**Estratégia adotada (decisão 002):** *shared database, shared schema* com coluna `tenant_id` e isolamento garantido por **RLS** no PostgreSQL.

| Estratégia | Isolamento | Custo/Operação | Decisão |
|-----------|-----------|----------------|---------|
| Banco por tenant | Máximo | Alto | Rejeitada (cara no MVP) |
| Schema por tenant | Alto | Médio | Rejeitada (complexa) |
| **`tenant_id` + RLS** | Alto (via políticas) | Baixo | **Adotada** |

**Garantias:**
- Toda tabela com dados de tenant possui `tenant_id` e políticas RLS que filtram pelo tenant da sessão.
- O `TenantContext` define o tenant ativo no frontend; o backend **nunca** confia apenas no cliente — o isolamento real é imposto por RLS.
- Vazamento de dados entre tenants é tratado como **incidente crítico** (ver `memory/restrictions.md`).

```
Usuário (sessão) ──▶ tenant_id ──▶ RLS no PostgreSQL ──▶ vê apenas dados do seu tenant
```

**Evolução futura:** se um tenant enterprise exigir isolamento físico, avaliar migração para schema/banco dedicado via ADR — sem quebrar o modelo padrão.
