# Bugs — Backlog — GastroMundi

## Objetivo
Registrar todos os bugs reportados no GastroMundi, com descrição, severidade, passos para reprodução, status e responsável.

## Contexto
Bugs são comportamentos inesperados que divergem das regras de negócio documentadas ou causam experiência degradada ao usuário. Este arquivo é o registro central — ferramentas de gestão podem ser usadas em paralelo com referência cruzada.

## Regras Gerais
- Todo bug deve ter passos claros para reprodução
- Bugs de segurança ou perda de dados são prioridade máxima automática (🔴 Critical)
- Bug sem passos de reprodução é classificado como "Não reproduzível" até ter mais informação
- Bugs corrigidos devem ter a versão de correção registrada

## Validações
- Passos de reprodução devem ser verificados por um segundo membro antes de priorizar
- Bugs críticos devem ter assignee dentro de 2 horas da descoberta

## Permissões
- Qualquer membro pode reportar bugs
- Priorização de bugs é responsabilidade do product owner e tech lead
- Bugs de segurança devem ser reportados de forma privada (não em canal público)

## Exceções
- Bugs descobertos em produção que afetam dados de usuários ativam protocolo de incidente

## Auditoria
- Data de reporte, descoberta e correção devem ser registradas
- Bugs críticos geram post-mortem após resolução

## Eventos
- `bug.reported` — bug reportado
- `bug.confirmed` — bug confirmado e priorizado
- `bug.fixed` — bug corrigido em produção

## Configurações Futuras
- Integrar com sistema de monitoramento de erros (Sentry) para criação automática de bugs
- Criar canal privado para bugs de segurança

## Casos de Uso
- Triagem de bugs após release
- Planejamento de sprint de correções
- Comunicação com usuários afetados

## Critérios de Aceite
- [ ] Todo bug tem severidade, status e passos de reprodução
- [ ] Bugs críticos têm assignee
- [ ] Bugs corrigidos têm data e versão de correção

---

## Severidades

| Nível | Descrição | SLA |
|-------|-----------|-----|
| 🔴 Critical | Perda de dados, falha de segurança, sistema indisponível | Imediato |
| 🟠 High | Feature principal inutilizável, sem workaround | < 24h |
| 🟡 Medium | Feature degradada, workaround existe | < 1 semana |
| 🟢 Low | Problema visual ou menor | Próxima sprint |

---

## Bugs Ativos

| # | Título | Severidade | Status | Reportado por | Data | Assignee |
|---|--------|-----------|--------|---------------|------|---------|
| — | Nenhum bug reportado ainda | — | — | — | — | — |

## Template de Bug

```markdown
### [BUGXXX] Título do Bug

**Severidade:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  
**Status:** Reportado | Confirmado | Em correção | Corrigido | Fechado  
**Reportado por:** [nome]  
**Data de reporte:** YYYY-MM-DD  
**Assignee:** [nome]

**Ambiente:** Produção / Staging / Local  
**Browser/SO:** [se aplicável]

**Descrição:**
[Descreva o comportamento inesperado]

**Comportamento esperado:**
[O que deveria acontecer]

**Passos para reprodução:**
1. Acesse [URL]
2. Faça [ação]
3. Observe [resultado inesperado]

**Evidências:** [links para screenshots, vídeos, logs]

**Workaround:** [se existir]
```
