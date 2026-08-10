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
| BUG001 | Borda some (em vez de mudar de cor) onde o JSX cola sufixo de alfa em `var(--gm-*)` — 26 linhas em 7 arquivos | 🟡 Medium | ✅ Corrigido (rodada 14) | Rodada 13 do ciclo (F018) | 2026-08-02 | — |

### [BUG001] Sufixo de alfa concatenado em `var()` produz CSS inválido

**Severidade:** 🟡 Medium
**Status:** ✅ Corrigido na rodada 14 (`specs/bug001-alfa-concatenado-em-var.md`)
**Reportado por:** Rodada 13 do ciclo (`specs/f018-pdv-header-css.md`)
**Data de reporte:** 2026-08-02
**Data de correção:** 2026-08-02
**Ambiente:** Produção

**Descrição:**
26 pontos do código montam cor com alfa concatenando dois dígitos hex ao fim de
uma custom property — `varColor(C.accent) + "66"` ou `` `${varColor(cor)}55` `` —
o que gera a string `var(--gm-accent)66`. Isso funcionava quando as cores eram
hex literal (`#7c3aed` + `66` = `#7c3aed66`) e passou a ser **CSS inválido**
quando o projeto migrou para CSS Custom Properties (ADR-007). Nenhuma ferramenta
acusa: o Vite não valida string de estilo, o jsdom não computa CSS e a suíte
fica verde.

**Comportamento esperado:**
A borda muda de cor (accent, vermelho ou verde translúcido) para sinalizar campo
em foco, campo preenchido, seleção ou erro de senha.

**Comportamento real:**
A declaração é substituída em tempo de valor computado, dá inválida, e as
longhands caem para `unset` — `border-style` volta a `none`. Ou seja: em vez de
mudar de cor, **a borda desaparece**. O caso mais visível é o campo de senha da
`Sidebar` (linhas 340 e 359): quando a senha está errada, a borda vermelha que
avisa do erro simplesmente some.

**Onde (inventário final, corrigido na rodada 14):**
`src/components/navegacao/Sidebar.jsx` (340, 359, 556) ·
`src/components/mesas/MesasAdmin.jsx` (521, 688) ·
`src/components/pdv/PDVView.jsx` (886, 1201, 1541, 1646, 1740,
1749, 1971, 2087, 2092, 2093, 2119, 2442) ·
`src/components/relatorios/RelatorioView.jsx` (353, 1257, 1449, 1450) ·
`src/components/caixa/modais/FechamentoModal.jsx` (238, 311, 340) ·
`src/components/configuracoes/ConfiguracoesView.jsx` (747) ·
`src/components/ui/paineis/JarvasPanel.jsx` (301)

> O reporte original dizia 18 ocorrências em 6 arquivos. O número saiu de um grep
> ancorado em `varColor(`, que perde os pontos onde o token chega por variável
> (`${tipo.color}44`, `${cor}22`, `${color}18`, alimentados por mapas que guardam
> `varColor(C.x)`) e os pontos onde o `}` fecha um ternário em vez da chamada. O
> real é **26 linhas / 27 declarações em 7 arquivos**.

**Correção aplicada (rodada 14):**
As 26 linhas passaram a usar `alfa(cor, "NN")` (`src/constants/colorAlfa.js`), que
produz `color-mix(in srgb, <cor> N%, transparent)` — a forma válida. Cada ponto
manteve a mesma cor e o mesmo sufixo hex de antes (diff de 26 inserções e 26
remoções, nenhuma outra linha tocada). O helper aceita tanto nome de token
(`C.red`) quanto string já resolvida (`varColor(C.blue)`) ou hex literal
(`"#f59e0b"`), então os mapas de cor mistos foram corrigidos sem ramificação.

**Nota — duas falhas, não uma:** em `border` (atalho) o valor inválido leva as
longhands a `unset` e a borda **some**; em `style.borderColor` (CSSOM, nos
`onFocus`/`onBlur` feitos à mão) só a cor cai para `unset` → `currentColor`, e a
borda fica **da cor do texto**. Os dois deixam de mostrar a cor pretendida.

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
