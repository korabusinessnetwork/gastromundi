# Backlog — Visão Geral — GastroMundi

## Objetivo
Centralizar e organizar o backlog do produto GastroMundi: features planejadas, bugs reportados e débito técnico identificado.

## Contexto
O backlog é a lista viva de trabalho a ser feito. Este documento serve como referência de alto nível — itens detalhados podem viver em ferramentas como Linear, Jira ou GitHub Issues, com referência cruzada aqui.

## Regras Gerais
- Todo item do backlog deve ter: título, descrição, prioridade e status
- Features sem regras de negócio documentadas não entram no backlog de desenvolvimento
- Bugs críticos (que afetam segurança ou dados) têm prioridade máxima automática
- Débito técnico deve ser planejado junto com features, não negligenciado indefinidamente

## Validações
- Itens sem critérios de aceite não podem entrar em sprint
- Bugs devem ter passos para reprodução documentados

## Permissões
- Qualquer membro pode reportar bugs e propor features
- Priorização é responsabilidade do product owner
- Estimativas são responsabilidade do tech lead

## Exceções
- Hotfixes de segurança entram direto em produção, com registro retroativo no backlog

## Auditoria
- Revisão do backlog (grooming): quinzenal ou a cada ciclo
- Items bloqueados por mais de 30 dias devem ser revisados ou descartados

## Eventos
- `backlog.item.added` — novo item adicionado
- `backlog.item.prioritized` — item priorizado para próxima sprint
- `backlog.item.completed` — item concluído e fechado

## Configurações Futuras
- Integrar com ferramenta de gestão de projeto (Linear, GitHub Projects, Jira)
- Criar métricas de velocity e burn-down
- Automatizar criação de issues a partir de alertas de monitoramento

## Casos de Uso
- Planejamento de sprint
- Revisão de roadmap
- Priorização de trabalho com stakeholders
- Rastreamento de bugs em produção

## Critérios de Aceite
- [ ] Features, bugs e débito técnico estão em arquivos separados
- [ ] Todos os itens têm prioridade e status
- [ ] Backlog é revisado regularmente

---

## Índice

| Documento | Conteúdo | Itens |
|-----------|----------|-------|
| [features.md](./features.md) | Features planejadas | — |
| [bugs.md](./bugs.md) | Bugs reportados | — |
| [tech-debt.md](./tech-debt.md) | Débito técnico | — |

## Prioridades

| Nível | Descrição |
|-------|-----------|
| 🔴 Critical | Bloqueia usuários ou causa perda de dados |
| 🟠 High | Impacto significativo na experiência ou receita |
| 🟡 Medium | Melhoria relevante, mas workaround existe |
| 🟢 Low | Nice to have, sem impacto imediato |
