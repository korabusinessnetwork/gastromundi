# 09 — BACKLOG · {{PRODUTO}}

> Features, bugs, MVP, runbooks, handoffs — tudo que está por fazer ou orientar.

## O que vive aqui

- **Features**: roadmap, user stories, acceptance criteria, prioridade
- **Bugs**: conhecidos, triagem, severidade, status
- **MVP**: escopo inicial, o que não entra v1, o que é "nice to have"
- **Runbooks**: "como fazer X", procedimentos operacionais, troubleshooting
- **Handoffs**: documentação para passar projeto/feature para outra pessoa
- **Dívida técnica**: refatoração, performance, segurança (registra, não ignora)

## O que NÃO vive aqui

- Código → `src/`
- Decisões formalizadas → `08_DECISOES/`
- Arquitetura → `01_ARQUITETURA/`
- Regras de negócio → `03_REGRAS_DE_NEGOCIO/`

## Arquivos sugeridos

- `features.md` — features planejadas, prioridade, esforço estimado, dono
- `bugs.md` — bugs conhecidos, status (aberto/em andamento/fechado), severity
- `mvp.md` — escopo de lançamento, o que entra/não entra v1
- `runbook-deploy.md` — procedimento passo-a-passo de deploy
- `runbook-incident.md` — como responder a incidente, escalação
- `handoff-para-equipe.md` — documentação técnica para transferência

## Como preencher

1. **MVP vem primeiro**: defina escopo de lançamento, o que espera para v1.1
2. **Features têm critério de aceitação**: como sabe quando está pronto?
3. **Bugs nunca morrem em silêncio**: registra, marca severidade/prioridade
4. **Runbooks salvam vidas**: procedimentos críticos, documentados, testados
5. **Dívida técnica é legítima**: registra, marca como "tech debt", prioriza
6. **Nada zumbi**: conteúdo vivo ou marcado obsoleto/posposto — zero ambiguidade

## Ligações

- Ferramenta de gestão (GitHub Issues, Jira, Linear) — puxe dados daqui pro backlog
- `memory/roadmap.md` — roadmap de produto (visão 3–6 meses)
- `05_FLUXOS/` — fluxos que features implementam
