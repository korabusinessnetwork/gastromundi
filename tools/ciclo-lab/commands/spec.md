---
description: Transforma o item da rodada em especificação verificável antes de construir
---

Item escolhido: $ARGUMENTS

Não escreva código neste comando — só especifique. Salve em
`specs/<slug-do-item>.md`, com o título
`# <ITEM> (rodada N) — <título curto>`.

## 1. Escopo

O que exatamente será construído. Uma frase objetiva, sem ambiguidade.

## 2. Fora de escopo

O que explicitamente **não** entra nesta rodada. Esta seção é o que impede o
`/build` de crescer sozinho — seja generoso aqui.

## 3. Origem e decisões que este item honra

De onde veio (ledger, backlog, suíte vermelha) e quais regras já escritas ele
respeita: `docs/PDV.md`, `memory/patterns.md`, `memory/decisions.md`, o
princípio da intuitividade.

## 4. Arquivos afetados

Os arquivos que provavelmente serão criados ou modificados. Respeite as
convenções: JS em camelCase, componentes em PascalCase, `.css` co-localizado ao
lado do `.jsx`, função pura em `src/lib/`.

## 5. Critérios de aceite

Lista numerada, cada item respondível com sim/não depois do build, cada um com
evidência possível no código. Bons critérios:

- "O total é calculado em centavos inteiros, sem float em nenhum passo"
- "Com o carrinho vazio, o botão de finalizar está desabilitado e a tela diz o
  que fazer em seguida"
- "Recarregar a página preserva a venda em andamento"

Ruins: "funciona bem", "está organizado", "a UX melhorou".

Dois critérios são **obrigatórios em toda spec**:

- Suíte verde (`npm test`), sem `console.log` esquecido e sem `TODO` novo.
- Nenhuma regressão nas rodadas anteriores (os testes que já existiam seguem
  verdes).

## 6. Edge cases conhecidos

Os casos limite que o `/build` precisa tratar: lista vazia, quantidade zero,
pagamento maior que o total, storage indisponível, dois cliques seguidos.

## 7. Rota para smoke

**Obrigatório.** A rota que o `node tools/smoke.mjs --rota=<rota>` vai abrir
para provar que a tela sobe sem erro no navegador. Se o item não muda tela
nenhuma, escreva `/` — a raiz ainda tem que subir limpa.

## 8. Por que é intuitiva

**Obrigatório.** Duas ou três frases: por que quem nunca viu esta tela entende o
que fazer sem ninguém explicar. Se você não conseguir responder isso, o desenho
está errado — volte e mude o desenho, não o texto.

## 9. Definição de "aprovado sem ressalvas"

Uma frase fechando quando o `/review` pode declarar feito.

Ao terminar, informe apenas: `Spec salvo em specs/<slug>.md.`
