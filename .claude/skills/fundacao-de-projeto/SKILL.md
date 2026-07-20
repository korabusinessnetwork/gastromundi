---
name: fundacao-de-projeto
description: >-
  Monta a fundação completa de um app/produto novo no padrão GastroMundi —
  governança (memory/), documentação document-first (docs/ 00→11), ADRs, plano
  de segurança e a camada default da stack (React+Vite+Supabase, multi-tenant
  white-label). Use ao INICIAR um projeto novo ("montar a estrutura/fundação",
  "scaffold de app novo", "começar um SaaS novo"), ou para trazer um projeto
  existente para este padrão. Conduz um QUESTIONÁRIO de intake antes de gerar
  qualquer arquivo. NÃO dispara para tarefas dentro de um projeto já estruturado.
---

# Fundação de Projeto

Esqueleto opinativo para nascer um app novo já organizado. O que torna um
projeto sustentável **não é a stack** — é a camada de governança e documentação
que vive por cima dela. Esta skill codifica essa camada e a instala em minutos.

## Princípios inegociáveis (herdados do padrão)

1. **Document-first** — documentar identidade e arquitetura ANTES de codar.
2. **Esqueleto opinativo, nunca página em branco** — todo arquivo nasce com
   estrutura e um exemplo-guia; página vazia mata a documentação.
3. **Decisão relevante vira ADR** — nada de decisão de arquitetura implícita.
4. **Multi-tenant white-label desde a linha 1** — nada de marca/cor/regra de
   cliente hardcodada; identidade vem do tenant. (`references/multi-tenant-white-label.md`)
5. **Segurança e custo são parte da definição de pronto** — RLS obrigatório;
   na fase bootstrap, tudo gratuito por padrão. (`references/seguranca.md`)
6. **Intuitividade é o princípio nº1 de UX** — se o produto tem tela, o
   front-end deve ser compreensível sem treinamento.

## As 5 camadas que esta skill instala

| Camada | Onde | Papel |
|--------|------|-------|
| **1. Constituição** | `CLAUDE.md` | Princípio nº1, fonte de verdade, processo, custo, segurança, padrões, stack |
| **2. Memória** | `memory/` | identity · decisions · patterns · learnings · restrictions · bugs (meta-cabeçalho padrão) |
| **3. Documentação** | `docs/00_→11_` | visão → arquitetura → design system → regras → modelagem → fluxos → componentes → apis → **decisões (ADRs)** → backlog → prompts → **segurança** |
| **4. Dados** | `supabase/` (ou equiv.) | schema + migrations + functions + seeds; RLS como definition-of-done |
| **5. Código** | `src/` | organização por feature; camada de serviços isolando o backend; CSS separado do JSX |

## Fluxo — sempre nesta ordem

### Fase 1 — Descoberta (QUESTIONÁRIO, antes de criar qualquer arquivo)
Conduza a entrevista de intake com `AskUserQuestion` seguindo
`references/questionario-intake.md`. NÃO gere arquivos antes de ter as respostas
essenciais (produto, público, multi-tenant?, stack, segurança/compliance, custo).
Grave as respostas em `respostas-intake.md` (use `assets/templates/respostas-intake.template.md`).
O questionário mapeia cada resposta → qual arquivo ela preenche.

### Fase 2 — Fundação
Rode `scripts/scaffold.sh` (gera a árvore inteira e substitui os placeholders
`{{...}}` pelas respostas do intake) — ou copie os `assets/templates/` à mão se
precisar de mais controle. Preencha `memory/identity.md` e `docs/00_VISAO`
primeiro (document-first). Registre a stack escolhida em **ADR-001**.

### Fase 3 — Arquitetura
Escolha o modelo em `references/arquiteturas.md` (árvore de decisão: default
Supabase-direto × alvo API-própria-de-escala). Defina a camada de serviços e a
estratégia multi-tenant. Registre em `docs/01_ARQUITETURA` + ADR. Preencha o
plano de segurança em `docs/11_SEGURANCA` a partir de `references/seguranca.md`.

### Fase 4 — Validação
Rode o checklist final antes de considerar a fundação pronta:
- [ ] `memory/identity.md` preenchido com o produto real (não placeholder)
- [ ] ADR-001 registra a stack; toda decisão relevante virou ADR
- [ ] Multi-tenant modelado (tenant_id, isolamento) — ver checklist do guia
- [ ] **Segurança:** RLS previsto em toda tabela; sem `service_role` no front;
      inputs validados; sem log de dado sensível; auth antes de rota protegida
      (checklist completo em `references/seguranca.md`)
- [ ] **Custo:** tudo em tier gratuito; itens pagos listados e adiados/decididos
- [ ] Nenhum doc "zumbi": todo arquivo vivo ou marcado `[OBSOLETO]`
- [ ] Se tem UI: princípio nº1 (intuitividade) aplicado e justificado

## Referências (leia sob demanda)

- `references/blueprint.md` — a árvore completa comentada, pasta a pasta.
- `references/questionario-intake.md` — banco de perguntas + mapa resposta→arquivo.
- `references/arquiteturas.md` — modelos de arquitetura e como escolher.
- `references/seguranca.md` — plano de segurança por camada + checklists.
- `references/memory-schema.md` — o meta-cabeçalho padrão de `memory/`.
- `references/adr-guide.md` — quando e como escrever um ADR.
- `references/multi-tenant-white-label.md` — tenant/white-label desde a linha 1.

## Recursos

- `assets/templates/` — esqueletos opinativos prontos (CLAUDE.md, memory/, docs/).
- `scripts/scaffold.sh` — gera a árvore e injeta as respostas do intake.

## Regra de ouro

Uma tarefa dentro de um projeto **já estruturado** não usa esta skill — ela é
para **nascer** um projeto. Se a fundação já existe, vá direto aos arquivos.
