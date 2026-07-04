# Decisões do Projeto GastroMundi

## Objetivo
Registrar todas as decisões relevantes tomadas ao longo da vida do projeto, com contexto, justificativa e impacto. É o histórico permanente de "por que fizemos assim".

## Contexto
Decisões não documentadas se perdem com a rotatividade de equipe. Este arquivo complementa `docs/08_DECISOES/` (ADRs detalhados) com um resumo navegável de todas as decisões-chave.

## Regras Gerais
- Toda decisão arquitetural, de stack ou de produto deve ser registrada aqui
- Cada entrada deve conter: data, decisão tomada, alternativas consideradas e motivo da escolha
- Decisões reversas (mudanças de decisão anterior) devem referenciar a decisão original

## Validações
- Novas decisões não podem contradizer decisões ativas sem registro de revisão
- Decisões com impacto em segurança ou dados exigem aprovação de, no mínimo, dois membros sênior

## Permissões
- Qualquer membro da equipe pode propor uma decisão
- Decisões de arquitetura exigem aprovação do tech lead
- Decisões de produto exigem aprovação do product owner

## Exceções
- Decisões emergenciais (hotfix, incidente) podem ser tomadas por um único responsável, com registro retroativo obrigatório em até 48h

## Auditoria
- Cada entrada deve conter: autor, data, status (ativa | revisada | descontinuada)
- Revisões periódicas recomendadas: semestrais

## Eventos
- `decision.added` — nova decisão registrada
- `decision.revised` — decisão anterior substituída ou atualizada
- `decision.deprecated` — decisão marcada como descontinuada

## Configurações Futuras
- Automatizar linkagem entre este arquivo e os ADRs em `docs/08_DECISOES/`
- Criar template de proposta de decisão para uso em reuniões

## Casos de Uso
- Onboarding técnico de novos desenvolvedores
- Revisão de arquitetura
- Avaliação de refatorações ou migrações
- Auditoria pós-incidente

## Critérios de Aceite
- [ ] Formato padronizado para todas as entradas
- [ ] Referência cruzada com ADRs detalhados
- [ ] Status de cada decisão atualizado

---

## Registro de Decisões

> Resumo navegável das decisões-chave (arquiteturais iniciais). ADRs detalhados vivem em `docs/08_DECISOES/`.

| # | Data | Decisão | Alternativas | Motivo | Status | ADR |
|---|------|---------|--------------|--------|--------|-----|
| 001 | 2026-06-15 | Stack: React + Vite + Tailwind + Supabase | Next.js, Remix, Firebase, backend Express próprio | Velocidade no early stage, sem servidor próprio, PostgreSQL+RLS, ótima DX | Revisada (ver 011, 012) | [ADR-001](../docs/08_DECISOES/adr-001.md) |
| 002 | 2026-06-16 | Multi-tenancy por **tenant_id compartilhado** com isolamento via RLS | Schema por tenant; banco por tenant | Simplicidade operacional no MVP, isolamento garantido por RLS, custo controlado | Ativa | — |
| 003 | 2026-06-16 | Estado de servidor via camada de data-fetching com cache; estado global de UI via **Context API** | Redux, MobX | Context cobre as necessidades atuais sem boilerplate; evita over-engineering | Ativa | — |
| 004 | 2026-06-16 | **Event Bus** interno para comunicação desacoplada entre módulos | Acoplamento direto via chamadas | Reduz acoplamento, habilita auditoria e reações cross-módulo | Ativa | — |
| 005 | 2026-06-16 | **Feature Flags** desde o MVP | Deploy direto sem flags | Permite entregas graduais, testes A/B e kill-switch sem novo deploy | Ativa | — |
| 006 | 2026-06-16 | Validação de contratos com **Zod** em todas as fronteiras | Validação manual; sem validação | Segurança de tipos em runtime, contrato único front/back | Ativa | — |
| 007 | 2026-06-16 | Isolar acesso ao Supabase em **camada de serviços** | Chamadas diretas nos componentes | Reduz lock-in e facilita testes/migração futura | Revisada (ver 011) | — |
| 008 | 2026-06-16 | Papéis operacionais: **dono / gerente / caixa / atendente / cozinha**; planos: **free / pro / enterprise** | Papéis genéricos (member/admin/owner) | Refletem a operação real de restaurante-varejo; permissões por função | Ativa | — |
| 009 | 2026-06-16 | A **venda no PDV é a transação-fonte**: emite eventos consumidos por Caixa, Estoque, Financeiro, Relatórios e Jarvas | Atualização manual em cada módulo | Garante consistência automática entre módulos via Event Bus (decisão 004) | Ativa | — |
| 010 | 2026-06-16 | **Jarvas** é uma **camada transversal de IA** que observa eventos de todos os módulos | IA acoplada a um único módulo (chat) | Permite insights, detecção de padrões e sugestões cross-módulo | Ativa | — |
| 011 | 2026-06-16 | **Caminho A:** acesso a dados via **API Express (contract-first) + Drizzle**; Supabase passa a ser **apenas o PostgreSQL gerenciado** (sem SDK direto no frontend, sem Edge Functions por ora) | Caminho B (frontend → Supabase SDK + RLS + ponte Clerk→Supabase); Replit Postgres nativo | Aproveita o scaffold do monorepo (Express/Drizzle/Orval/Zod) e a tipagem ponta a ponta; centraliza regras na API; evita ponte JWT frágil. Revisa 001 e 007 | Revisada (ver 015 — roadmap) | [ADR-002](../docs/08_DECISOES/adr-002.md) |
| 012 | 2026-06-16 | **Autenticação via Clerk** (gerenciado pela Replit), cookie de sessão + middleware Express, no lugar do **Supabase Auth** | Supabase Auth; Replit Auth | Baixa fricção, gerenciado, sem necessidade de ponte JWT com Supabase. Revisa 001 | Revisada (ver 015 — roadmap) | [ADR-002](../docs/08_DECISOES/adr-002.md) |
| 013 | 2026-06-16 | Versões/ferramentas reais: **React 19 / Vite 7 / Tailwind 4 / wouter**; estado de servidor via **TanStack Query** (hooks gerados pelo Orval a partir do OpenAPI) | React Router; data-fetching a definir | Reflete o scaffold nativo do ambiente; corrige versões do ADR-001 | Revisada (ver 015 — app real usa React 18 / React Router v6) | [ADR-002](../docs/08_DECISOES/adr-002.md) |
| 014 | 2026-07-03 | **Rebrand: Kora → GastroMundi.** Produto, docs e memória renomeados globalmente; arquitetura e regras inalteradas; Jarvas mantém o nome por ora | Recomeçar do zero; manter dois nomes | Preservar a fundação documental sob a marca definitiva | Ativa | [ADR-003](../docs/08_DECISOES/adr-003.md) |
| 015 | 2026-07-03 | **Junção com o app em produção: stack real prevalece** — React 18 + Vite + Supabase direto (SDK, Auth, RLS) + React Router v6 + Vercel. ADR-002 (API Express + Drizzle + Clerk) rebaixado a roadmap; schema real em `supabase/` | Migrar o app para o monorepo; manter dois repositórios | Doc não pode contradizer a produção; migração grande e arriscada sem ganho imediato | Ativa | [ADR-004](../docs/08_DECISOES/adr-004.md) |

## Decisões em Aberto

| Tema | Status | Notas |
|------|--------|-------|
| Biblioteca de data-fetching/cache | Resolvida (ver 013) | TanStack Query via hooks gerados pelo Orval |
| Ferramenta de testes | Em avaliação | Vitest + Testing Library (provável) |
| Estratégia de SSR | Adiada | Reavaliar se SEO se tornar crítico (ver ADR-001) |
