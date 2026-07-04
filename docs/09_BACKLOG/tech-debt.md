# Débito Técnico — Backlog — GastroMundi

## Objetivo
Registrar e priorizar o débito técnico identificado no GastroMundi: código que funciona mas precisa ser melhorado, arquiteturas temporárias, testes ausentes e outras decisões de curto prazo que precisam ser revisadas.

## Contexto
Débito técnico é inevitável em produtos que evoluem rápido. O risco está em ignorá-lo indefinidamente. Este arquivo torna o débito visível e permite planejá-lo junto com as features — não como um projeto separado que nunca acontece.

## Regras Gerais
- Todo débito técnico identificado deve ser registrado aqui (não apenas "na cabeça")
- Débito técnico crítico (que afeta segurança ou estabilidade) tem prioridade automática alta
- Débito técnico deve ser planejado junto com features — reservar capacidade no sprint
- "Faremos depois" só é válido se tiver data ou milestone definida

## Validações
- Itens de débito sem contexto suficiente são marcados como "Necessita Investigação"
- Débito técnico com impacto em segurança deve ser resolvido antes de novas features da área afetada

## Permissões
- Qualquer dev pode registrar débito técnico
- Priorização é responsabilidade do tech lead em alinhamento com o product owner

## Exceções
- Débito técnico em código de prova de conceito marcado `[POC]` é esperado e não precisa ser registrado até a decisão de manter o código

## Auditoria
- Revisão do débito técnico: mensalmente ou a cada fim de ciclo
- Débito técnico resolvido deve ter data e PR/commit de referência

## Eventos
- `tech-debt.identified` — novo débito técnico registrado
- `tech-debt.resolved` — débito técnico resolvido

## Configurações Futuras
- Integrar análise estática de código (SonarQube, CodeClimate) para identificar débito automaticamente
- Criar métrica de "índice de saúde técnica" do projeto

## Casos de Uso
- Planejamento de sprint (reservar % de capacidade para débito)
- Decisões de refatoração
- Revisão de arquitetura
- Onboarding técnico (entender o estado atual do código)

## Critérios de Aceite
- [ ] Todo item tem impacto, esforço e prioridade estimados
- [ ] Items críticos têm assignee e data-alvo
- [ ] Itens resolvidos estão marcados com data e referência

---

## Categorias de Débito Técnico

| Categoria | Descrição |
|-----------|-----------|
| 🏗️ Arquitetura | Estruturas que precisam ser redesenhadas |
| 🧪 Testes | Cobertura de testes ausente ou insuficiente |
| 🔒 Segurança | Vulnerabilidades ou práticas de segurança inadequadas |
| ⚡ Performance | Gargalos de performance identificados |
| 📦 Dependências | Bibliotecas desatualizadas ou com vulnerabilidades |
| 🧹 Code Quality | Código duplicado, complexo ou mal documentado |

---

## Débito Técnico Ativo

| # | Título | Categoria | Impacto | Esforço | Prioridade | Status |
|---|--------|-----------|---------|---------|-----------|--------|
| — | Nenhum débito técnico registrado ainda | — | — | — | — | — |

---

## Template de Item de Débito Técnico

```markdown
### [TDXXX] Título do Débito

**Categoria:** Arquitetura / Testes / Segurança / Performance / Dependências / Code Quality  
**Impacto:** Alto / Médio / Baixo  
**Esforço estimado:** Alto / Médio / Baixo  
**Prioridade:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  
**Status:** Identificado | Em andamento | Resolvido  

**Descrição:**
[O que é o problema e onde está no código]

**Impacto atual:**
[Como isso afeta o produto, a equipe ou os usuários]

**Solução proposta:**
[Como poderia ser resolvido]

**Referências:**
[Arquivos, commits ou PRs relacionados]
```
