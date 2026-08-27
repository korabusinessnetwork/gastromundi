---
description: Entrevista até fechar o desenho, e só então escreve a especificação verificável
---

Você recebeu uma ideia de feature ou tarefa: $ARGUMENTS

Este comando **não implementa nada**. Ele produz uma especificação verificável — e antes
disso, produz o **entendimento** de onde a especificação sai.

## Fase 1 — Grilling (a entrevista)

Não escreva o spec de cara. Um spec escrito de cara é um palpite: você preenche as lacunas
com o que **acha** que o dono quer, ele lê rápido, aprova, e a divergência só aparece no
`/review` — ou pior, três rodadas depois.

Rode uma sessão de `/grilling` sobre a ideia. Em resumo, e a skill `grilling` tem o detalhe:

1. **Levante fato antes de perguntar qualquer coisa.** Achar fato é seu trabalho, nunca do
   dono. Nesta ordem: `specs/_loop.md` (o que a rodada anterior recomendou e por quê) →
   `memory/` (decisões, padrões, restrições) → `docs/03_REGRAS_DE_NEGOCIO/` e
   `docs/08_DECISOES/` → `supabase/schema.sql` e `supabase/migrations/` → `src/`. Nunca
   pergunte o que já está escrito em algum desses.
2. **Monte a árvore de decisão** da ideia e calcule a **fronteira** — as perguntas que dá
   pra fazer agora sem chutar respostas que você ainda não ouviu.
3. **Pergunte a fronteira inteira numa rodada só**, numerada, **cada pergunta com a sua
   recomendação**:

```
❓ **Q1** — **<título>**: <corpo, com alternativas quando houver>

➡️ <o que você faria, e por quê>
```

4. **Pare e espere.** As respostas empurram a fronteira; recalcule e faça a rodada seguinte.
5. Acabou quando a **fronteira esvazia** e o dono confirma o entendimento.

**Quando pular a entrevista:** se a fronteira já nasce vazia — item mecânico, já
integralmente definido pelo "próximo item recomendado" do ledger, ou uma fatia idêntica à
da rodada anterior (ex.: mais um arquivo do mesmo TD, mesmo roteiro) — diga isso em uma
frase e vá direto para a Fase 2. Entrevista sem pergunta real é cerimônia, e a maioria das
rodadas deste loop é continuação de um roteiro já fechado. O teste é honesto: **você
consegue escrever todos os critérios de aceite sem supor nada?** Se sim, não há fronteira.

**O que nunca pode ficar suposto em silêncio** — se a ideia toca nisso e o dono não falou,
está na fronteira:

- **Intuitividade** (princípio nº 1 do CLAUDE.md): qual é a próxima ação óbvia na tela,
  como ficam carregando/erro/vazio/sucesso, e como o erro é **prevenido** em vez de avisado.
- **Custo**: se exige algo pago, é decisão do dono — traga custo aproximado, alternativa
  gratuita, impacto e recomendação de investir agora ou depois.
- **Multi-tenant / white-label** (decisão 017): o que é do tenant e o que é da plataforma;
  nada de nome, cor, logo ou regra de um cliente cravada no código.
- **Segurança**: o que passa por RLS, o que é segredo que não pode chegar ao frontend, quem
  enxerga o quê por papel.

Se uma resposta do dono **contrariar** algo em `memory/decisions.md` ou num ADR, não engula:
diga qual decisão ela revisa e registre isso no spec — pode ser caso de decisão nova.

## Fase 2 — Escrever o spec

Só agora. O spec é o **registro da árvore resolvida**, não um palpite. Salve em
`specs/<slug-da-feature>.md` com esta estrutura:

### 1. Escopo
O que exatamente será construído. Uma frase objetiva, sem ambiguidade.

### 2. Fora de escopo
O que explicitamente NÃO será feito nesta rodada (evita scope creep no `/build`). Tudo que
a entrevista cortou entra aqui, com o motivo.

### 3. Origem e decisões que este item honra
De onde o item veio (ledger, backlog, pedido do dono) e quais decisões/ADRs/padrões ele
respeita. **Cada resposta da entrevista que virou restrição entra aqui, com o "porquê" que
o dono deu** — é isso que impede a rodada seguinte de redecidir a mesma coisa.

### 4. Arquivos afetados
Os arquivos que provavelmente serão criados ou modificados, baseado na estrutura real do
projeto (SQL snake_case, JS/TS camelCase, componentes PascalCase, migrations
`YYYYMMDD_descricao.sql`).

### 5. Critérios de aceite
Lista numerada e verificável — cada item respondível com sim/não depois do build.

**Toda resposta da entrevista que restringe comportamento vira critério.** É essa a
tradução: a decisão que o dono tomou na Fase 1 tem que virar algo que o `/review` consegue
conferir, senão ela se perde. Exemplos de bom critério:

- "RLS ativa na tabela X permitindo apenas leitura do próprio tenant"
- "Split de pagamento usa aritmética inteira (centavos), nunca float"
- "Endpoint retorna 400 com mensagem clara quando o payload está incompleto"

Evite critérios vagos como "funciona bem" ou "está organizado".

### 6. Edge cases conhecidos
Casos limite que o `/build` precisa tratar (ex.: mesa sem comanda aberta, split com valor
zero, reserva concorrente).

### 7. Definição de "aprovado sem ressalvas"
Uma frase que resume quando o `/review` pode declarar "feito" — geralmente: "todos os
critérios de aceite marcados como sim, sem TODOs pendentes, sem `console.log` esquecido,
sem regressão nos fluxos existentes (suíte verde)".

Ao terminar, mostre o spec resumido no chat e informe: "Spec salvo em `specs/<slug>.md`.
Rode /build quando estiver de acordo."
