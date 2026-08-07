---
name: loop-spec-build-review
description: Transforma o Claude Code num loop autocorretivo — entrevista até fechar o desenho, especifica, constrói, revisa contra a própria especificação e corrige até aprovar sem ressalvas, sem precisar de um novo prompt manual a cada rodada. Use SEMPRE que Matheus pedir para "criar um loop", "automatizar correção", "fazer o Claude revisar o próprio trabalho", ou quando for iniciar qualquer feature nova em GASTROMUNDI, Kora AI, Casa Coffee Colab ou qualquer venture da Kora que hoje segue o padrão manual "Claude propõe → Matheus roda → reporta → Claude revisa". Também trigger em pedidos como "monta os comandos /spec /build /review", "cria uma skill de loop baseada em [referência]", ou qualquer menção a ciclo spec→build→review no Claude Code.
---

# Loop: Spec → Build → Review

## O conceito

Um prompt único é um palpite: você pergunta, o Claude responde, você aceita. Um **loop** é
um sistema: o Claude fecha o desenho com você, especifica, constrói, revisa a própria
construção contra a especificação, corrige as falhas, e repete até a revisão passar sem
ressalvas — sem que você precise reescrever um prompt novo a cada rodada.

Isso substitui o padrão manual ("Claude propõe → Matheus roda → reporta → Claude revisa
antes de aprovar") por um ciclo que roda sozinho até bater o critério de aceite.

```
        ┌── /spec ──────────────────┐
        │   grilling → especificação │
        │                            ▼
REPITA  │                         /build
ATÉ     │                            │
LIMPAR  └──────── /review ◄──────────┘
                     │
                     ▼
           "feito" (sem ressalvas)
```

## Por que o loop começa com uma entrevista

A versão anterior deste loop abria escrevendo o spec direto. Isso é um palpite bem
formatado: o Claude preenche as lacunas com o que **acha** que você quer, você lê rápido,
aprova, e a divergência só aparece no `/review` — ou três rodadas depois, quando já virou
retrabalho.

Como diz o *Pragmatic Programmer*, **ninguém sabe exatamente o que quer**. A entrevista
(skill `grilling`) fecha essa distância antes da primeira linha: o Claude modela a tarefa
como uma **árvore de decisão**, pergunta a **fronteira inteira** numa rodada só — cada
pergunta com a recomendação dele — espera, recalcula a fronteira com as suas respostas, e
só escreve o spec quando não sobra nenhum galho suposto em silêncio.

A entrevista aparece em três pontos do loop, sempre no mesmo formato:

| Onde | O que muda |
|------|-----------|
| `/spec` | Abre entrevistando. O spec vira o **registro da árvore resolvida**, e cada resposta que restringe comportamento vira **critério de aceite** — senão a decisão se perde. |
| `/build` | Se esbarrar numa decisão que o spec não resolve, isso é falha do spec: para e pergunta em vez de adivinhar — e **escreve a resposta de volta no spec**. |
| `/review` | O que sobra para você deixa de ser lista de pendências e vira **rodada de perguntas** com recomendação em cada uma. |

Essa última troca resolve um problema real e visível: o ledger (`specs/_loop.md`) carrega
**cinco pendências de decisão herdadas desde a rodada 41** que atravessam rodada após
rodada intactas. Elas não estão paradas por serem difíceis — estão paradas porque são
**relistadas** a cada rodada, nunca **perguntadas** com uma recomendação para você aceitar
ou corrigir numa palavra.

**Quando pular a entrevista.** Se a fronteira já nasce vazia — item mecânico, já definido
integralmente pelo "próximo item recomendado" do ledger, ou mais uma fatia idêntica à da
rodada anterior — o `/spec` diz isso em uma frase e escreve direto. O teste é honesto:
*dá para escrever todos os critérios de aceite sem supor nada?* Se dá, não há o que
perguntar. A maioria das rodadas deste loop é continuação de roteiro fechado, e entrevista
sem pergunta real é só cerimônia.

## Quando usar

- Início de qualquer feature nova (ex.: Garçom Panel, relatório dia-a-dia, split de
  pagamento) em GASTROMUNDI, Kora AI ou Casa Coffee Colab.
- Qualquer tarefa com critério de aceite claro (schema, comportamento esperado, regras de
  negócio) contra o qual dá pra checar o resultado.
- **Não usar** para trabalho puramente exploratório/criativo sem critério de aceite (ex.:
  brainstorm de conteúdo Atmosfera Viral) — aí o loop não tem contra o que revisar. Para
  afiar uma ideia solta sem construir nada, use `/grill-me` sozinho.

## Os comandos

Os três são slash commands e já vivem em `.claude/commands/` neste repositório — no
GastroMundi funcionam direto, sem copiar nada. Para levar a outro projeto:

```bash
cp .claude/commands/{spec,build,review}.md <outro-projeto>/.claude/commands/
```

Leve junto `.claude/skills/grilling/` — os três comandos dependem dela.

### `/spec [ideia]`
Entrevista até a fronteira esvaziar e então transforma a ideia numa especificação
verificável: escopo, fora de escopo, origem e decisões honradas, arquivos afetados,
critérios de aceite, edge cases, e o que conta como "aprovado sem ressalvas". Salva em
`specs/<slug>.md`. Ver `.claude/commands/spec.md`.

### `/build`
Lê o spec mais recente (ou o indicado) e implementa, seguindo os padrões já estabelecidos
do projeto (SQL snake_case, JS camelCase, componentes PascalCase, migrations
`YYYYMMDD_descricao.sql`, RLS quando aplicável). Ver `.claude/commands/build.md`.

### `/review`
Relê o spec, relê o código, e audita um contra o outro: item por item do critério de
aceite, com evidência. Corrige sozinho o que é seguro corrigir, e leva o resto para você
como rodada de perguntas. Ver `.claude/commands/review.md`.

## O ciclo completo

1. Rode `/spec <descrição da feature>` e responda as rodadas de perguntas até fechar o
   desenho. Confirme o entendimento — o Claude não escreve o spec antes disso.
2. Rode `/build`.
3. Rode `/review`.
4. Se `/review` apontar falhas: ele corrige o que for seguro corrigir sozinho e refaz a
   auditoria do zero. Só te chama quando (a) terminou limpo, ou (b) tem perguntas de
   decisão — numeradas, com recomendação.
5. Aprovado, o spec e o resultado ficam registrados em `specs/<slug>.md` e a rodada entra
   no ledger `specs/_loop.md`.

## Adaptação por projeto

- **GASTROMUNDI**: o critério de aceite padrão inclui RLS, `SECURITY DEFINER` quando
  aplicável e consistência de schema. Na entrevista do `/spec`, quatro galhos nunca podem
  ficar supostos em silêncio quando a ideia os toca — **intuitividade** (princípio nº 1),
  **custo** (nada pago sem decisão do dono), **multi-tenant/white-label** (decisão 017) e
  **segurança**. Detalhe em `.claude/skills/grilling/SKILL.md`.
- **Kora AI**: nos sprints "documentado-primeiro" (sem código), o `/build` produz só os
  arquivos de `docs/` e `memory/` definidos no escopo do sprint — nunca código nem
  estrutura nova.
- **Casa Coffee Colab**: útil para specs operacionais (planilhas, formulários, loyalty)
  onde o critério de aceite é "todos os campos/casos cobertos", não código.

Se o projeto ainda não tem a fundação padrão Kora (`memory/`, `docs/`, ADRs), rode a skill
`fundacao-de-projeto` antes — o loop parte do princípio de que já existe base documentada
para especificar contra, e a entrevista levanta fato justamente aí.
