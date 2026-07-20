# Registro de Bugs Conhecidos — {{PRODUTO}}

## Objetivo
- Documentar bugs conhecidos em produção
- Evitar re-report de problemas conhecidos
- Rastrear status e ETA de correções
- Post-mortems de bugs críticos

## Contexto
- Bugs em código (não user error) vão aqui
- Separados por severidade: CRÍTICA / ALTA / MÉDIA / BAIXA
- Estados: aberto / em análise / em correção / corrigido / reabierto

## Regras Gerais
- Apenas bugs que afetam produção (não dev)
- Toda bug CRÍTICA/ALTA tem ADR se deixar debt
- Reaberturas ganham tag [REABIERTO] com data nova

## Validações
- Bug tem repro steps claros?
- Impacto em usuário está quantificado?

## Permissões
- Dev: abre/atualiza status
- Tech lead: aprova "wontfix" ou prioriza

## Exceções
- Bug crítico (segurança, perda de dados): correção > documentação

## Auditoria
- Weekly triage de bugs abertas
- Bugs "em análise" > 7 dias = escalar

## Eventos
- `bug.reported`, `bug.reproduced`, `bug.fixed`, `bug.reopened`

## Casos de Uso
- "O caixa fecha sozinho? Já sabemos?"
- "Por que o relatório tá errado?"
- "Qual é a status dessa bug de integração?"

## Critérios de Aceite
- [ ] 1+ bug por severidade como exemplo preenchido
- [ ] Bugs > 30 dias abertas revisadas
- [ ] Bugs corrigidas têm referência a PR

---

## Registro por Severidade

### CRÍTICA (perda de dados, segurança, receita)

| ID | Data | Módulo | Descrição | Status | Correção/ADR | ETA |
|---|---|---|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{MODULO}} | {{DESCRICAO}} | {{STATUS}} | {{REF_PR/ADR}} | {{ETA}} |
| BUG-001 (exemplo) | 2024-02-10 | Caixa | Fechamento de caixa perde últimas transações quando realtime desconecta | em_correcao | PR #234 | 2024-02-20 |

**Critério de fechamento**: Merge de PR + deploy produção + validação com 2 usuários

---

### ALTA (impacto operacional, muitos usuários, workaround existe)

| ID | Data | Módulo | Descrição | Status | Correção/ADR | ETA |
|---|---|---|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{MODULO}} | {{DESCRICAO}} | {{STATUS}} | {{REF_PR/ADR}} | {{ETA}} |
| BUG-002 (exemplo) | 2024-02-05 | Relatório | Vendas por item não soma promocional corretamente | em_analise | — | 2024-02-25 |

**Critério de fechamento**: PR + 1 aprovação + teste manual

---

### MÉDIA (impacto limitado ou raridade)

| ID | Data | Módulo | Descrição | Status | Correção/ADR | ETA |
|---|---|---|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{MODULO}} | {{DESCRICAO}} | {{STATUS}} | {{REF_PR/ADR}} | {{ETA}} |

---

### BAIXA (cosmético, niche scenario)

| ID | Data | Módulo | Descrição | Status | Correção/ADR | ETA |
|---|---|---|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{MODULO}} | {{DESCRICAO}} | {{STATUS}} | {{REF_PR/ADR}} | {{ETA}} |

---

## Estados

- **aberto**: Reportado, não confirmado
- **em_analise**: Dev investigando
- **em_correcao**: PR aberto, em review
- **corrigido**: Merge em main, aguardando deploy
- **reabierto**: Volta ao status anterior, causa raiz não foi (tag [REABIERTO] + data)
- **wontfix**: Descartado, motivo documentado

## Template para Reportar

```markdown
## Bug Report: {{TITULO}}

**Severidade**: CRÍTICA / ALTA / MÉDIA / BAIXA

**Módulo**: {{MODULO}}

**Descrição**:
O que acontece / O que deveria acontecer

**Repro Steps**:
1. ...
2. ...
3. ...

**Impacto**:
{{QUANTOS}} usuários / {{QUANTO}} de receita / {{QUAL}} operação bloqueada

**Contexto**:
- Browser: {{BROWSER}}
- SO: {{OS}}
- Data/hora: {{DATA_HORA}}

**Logs**:
{{LOGS_ESTRUTURADOS}}

**Workaround** (se existe):
{{WORKAROUND}}
```

## Bugs Corrigidas (últimos 30 dias)

| ID | Data Fechamento | Módulo | Referência |
|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{MODULO}} | PR #NNN |

---

## Post-Mortems (Bugs Críticas)

| Bug | Data | Causa Raiz | Ação Preventiva | ADR |
|---|---|---|---|---|
| {{BUG_ID}} | {{DATA}} | {{CAUSA}} | {{ACAO}} | {{ADR_REF}} |
| BUG-001 (exemplo) | 2024-02-20 | Sem retry em desconexão realtime | Implementar auto-reconnect + buffering | ADR-XX |

---

## SLA de Resposta

- CRÍTICA: 1h análise, 4h correção
- ALTA: 1 dia análise, 2 dias correção
- MÉDIA: 1 semana
- BAIXA: Backlog (sem ETA)
