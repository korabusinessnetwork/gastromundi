# Decisões de Arquitetura — {{PRODUTO}}

## Objetivo
- Registrar todas as decisões arquiteturais e de produto relevantes
- Evitar re-discussão de problemas já resolvidos
- Documentar trade-offs e contexto de cada decisão

## Contexto
- Sistema vive em `/docs/08_DECISOES/` (ADRs em markdown)
- Cada ADR tem ID sequencial (ADR-001, ADR-002, etc.)
- ADRs são imutáveis após mergeados (novos ADRs superseden os antigos)

## Regras Gerais
- Toda decisão de arquitetura, tech stack ou produto vai para um ADR
- Decisão = mudança que afeta 2+ componentes ou ciclo de vida longo
- Pequenos bugs/refators não viram ADR
- ADR sobrescreve docs divergentes; ADR é fonte de verdade

## Validações
- ADR tem contexto claro (problema, alternativas, consequências)?
- Decisão foi discutida com stakeholders chave?

## Permissões
- Qualquer dev pode propor ADR (em `docs/08_DECISOES/ADR-XXX-titulo.md`)
- Dono/tech lead: aprova merge

## Exceções
- ADR de máxima urgência (segurança, compliance): pode ser escrito pós-deploy com tag [URGENT]

## Auditoria
- Revisar ADRs semestralmente vs. realidade da codebase

## Eventos
- `decision.proposed`, `decision.superseded`, `decision.reviewed`

## Configurações Futuras
- Bot para validar formato de ADR
- Acoplamento automático ADR ↔ issues/PRs

## Casos de Uso
- "Por que escolhemos Supabase e não Firebase?"
- "O que mudou de banco de dados e quando?"
- "Quem decidiu usar Context API e não Redux?"

## Critérios de Aceite
- [ ] Índice abaixo está em sync com arquivos em docs/08_DECISOES/
- [ ] Cada ADR tem Status e Data de revisão
- [ ] ADRs obsoletos têm link para sucessor

---

## O que é um ADR?

Architecture Decision Record (ADR) é um documento que captura uma escolha arquitetural significativa, as alternativas consideradas, e as consequências. Formato padrão (Michael Nygard):

- **Status**: Proposed / Accepted / Superseded / Rejected / Deprecated
- **Contexto**: Por que estamos fazendo isso? Qual problema?
- **Decisão**: O que decidimos?
- **Alternativas consideradas**: O que mais pensamos?
- **Consequências**: O que muda? Tradeoffs?

## Índice de ADRs

| ID | Título | Status | Data | Supersede/Supersedido por |
|---|---|---|---|---|
| ADR-001 | {{TITULO_PRIMEIRO_ADR}} | Accepted | {{DATA}} | — |
| ADR-001 (exemplo real) | Stack Inicial: React + Supabase + Vercel | Accepted | 2024-01-15 | — |

## Regra Principal

> Toda decisão de arquitetura/produto relevante que afeta 2+ sistemas ou tem ciclo de vida > 1 sprint vira um ADR. Sem exceção.

Propostas de ADR vão em `docs/08_DECISOES/` como `ADR-NNN-titulo-da-decisao.md`. Numeração é sequencial, única, e nunca reciclada.

## Template para novo ADR

```markdown
# ADR-NNN: {{TITULO}}

## Status
Proposed / Accepted / Rejected

## Contexto
{{PROBLEMA}} {{RESTRICOES}} {{POR_QUE_AGORA}}

## Decisão
{{O_QUE_DECIDIMOS}}

## Alternativas Consideradas
- {{ALT_1}}: {{PROS}}, {{CONTRAS}}
- {{ALT_2}}: {{PROS}}, {{CONTRAS}}

## Consequências
- {{IMPACTO_1}}
- {{IMPACTO_2}}
- {{RISCO_1}}

## Referências
- {{LINK_DISCUSSAO}}
- {{LINK_IMPLEMENTACAO}}
```

## Como Contribuir

1. Propor ADR em `docs/08_DECISOES/ADR-XXX-titulo.md`
2. Solicitar revisão ao tech lead / dono
3. Discutir alternativas (no PR)
4. Merge quando consenso atingido
5. Atualizar índice acima

## Decisões Supersedidas / Em Review

- ADR-001 supersedes: (nenhuma)
- Em revisão: {{LISTA_DE_PAUTAS}}
