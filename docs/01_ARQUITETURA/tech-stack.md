# Tech Stack — GastroMundi

## Objetivo
Documentar todas as tecnologias utilizadas no projeto GastroMundi, com justificativas, versões e responsabilidades de cada camada.

## Contexto
A stack foi escolhida para maximizar velocidade de entrega no early stage, com path claro de escalabilidade. O acesso a dados passa pela **API Express (contract-first) + Drizzle**; o **Supabase atua apenas como o PostgreSQL gerenciado**; a autenticação é feita pelo **Clerk**. React + Vite + Tailwind garantem DX e performance no frontend. Ver [ADR-002](../08_DECISOES/adr-002.md) (revisa o ADR-001).

## Regras Gerais
- Mudanças de stack exigem ADR registrado em `docs/08_DECISOES/`
- Bibliotecas novas devem ser avaliadas por: manutenção ativa, tamanho do bundle, licença e popularidade
- Versões de dependências críticas devem ser fixadas (não usar `latest`)

## Validações
- Toda nova dependência deve ser aprovada pelo tech lead antes de entrar em produção
- Dependências com vulnerabilidades conhecidas não podem ser adicionadas

## Permissões
- Devs podem propor mudanças de bibliotecas secundárias
- Mudanças de stack principal exigem decisão coletiva

## Exceções
- Ferramentas de desenvolvimento (linters, formatters) podem ser adicionadas sem ADR

## Auditoria
- Versões devem ser revisadas a cada ciclo de manutenção (recomendado: trimestral)
- Dependências sem uso devem ser removidas

## Eventos
- `stack.updated` — dependência adicionada, atualizada ou removida
- `stack.vulnerability` — vulnerabilidade identificada em dependência

## Configurações Futuras
- Avaliar migração para Bun como runtime
- Avaliar TanStack Router como alternativa ao React Router
- Planejar estratégia de SSR se SEO se tornar crítico

## Casos de Uso
- Onboarding técnico
- Avaliação de upgrade de versões
- Auditoria de segurança de dependências
- Decisões de refatoração

## Critérios de Aceite
- [ ] Todas as tecnologias principais estão listadas com versão e justificativa
- [ ] Responsabilidade de cada ferramenta está descrita
- [ ] Path de upgrade ou substituição está indicado

---

## Frontend

| Tecnologia | Versão | Responsabilidade | Justificativa |
|------------|--------|-----------------|---------------|
| React | 19.x | UI e estado | Ecossistema maduro, team familiarity |
| Vite | 7.x | Build e dev server | Velocidade de HMR, simplicidade |
| Tailwind CSS | 4.x | Estilização | Utility-first, consistência visual |
| wouter | 3.x | Roteamento | Router minimalista do monorepo; usado com `base` por artefato (decisão 013) |
| Context API (React) | 19.x | Estado global de UI | Cobre sessão/tenant/tema/flags sem boilerplate (decisão 003) |
| TanStack Query | 5.x | Estado de servidor (cache) | Hooks gerados pelo Orval a partir do OpenAPI (decisão 013) |
| Zod | 3.x | Validação de contratos | Type-safe em runtime, contrato único front/back (decisão 006) |
| @clerk/react | — | Autenticação no cliente | SSO + e-mail/senha, gerenciado pela Replit (decisão 012) |

## Backend / Dados

| Tecnologia | Versão | Responsabilidade | Justificativa |
|------------|--------|-----------------|---------------|
| Express | 5.x | API HTTP (`artifacts/api-server`) | Contract-first via OpenAPI; centraliza regras e validação (decisão 011) |
| Drizzle ORM | — | Acesso a dados tipado | Migrations e queries type-safe sobre o Postgres (decisão 011) |
| PostgreSQL (hospedado no Supabase) | 15.x | Banco de dados relacional | RLS nativo; conexão via `SUPABASE_DATABASE_URL` (decisão 011) |
| Clerk (@clerk/express) | — | Autenticação/sessão no servidor | Gerenciado pela Replit; cookie de sessão + middleware (decisão 012) |
| Orval | — | Geração de cliente | Gera hooks React Query + schemas Zod a partir do OpenAPI |

> **Nota:** Supabase é usado **apenas como Postgres gerenciado**. Auth, Storage, Realtime e Edge Functions do Supabase **não** estão em uso nesta fase — reavaliáveis via novo ADR.

## Ferramentas de Desenvolvimento

| Ferramenta | Responsabilidade |
|------------|-----------------|
| TypeScript | Tipagem estática |
| ESLint | Linting |
| Prettier | Formatação |
| Vitest + Testing Library | Testes (unitário e de componente) — provável, a confirmar via ADR |
