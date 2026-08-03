---
description: Grava em memory/ o que esta rodada ensinou — a única coisa que atravessa para a próxima
---

Seu contexto morre no fim desta rodada. O que não estiver em `memory/` some.
Escreva pensando em quem vai ler daqui a cem rodadas sem nenhum contexto seu.

Os arquivos de `memory/` são **CRLF**: edite pela ferramenta de edição, nunca por
script procurando `\n`.

## `memory/learnings.md`

Uma linha por lição, no fim da tabela:

```
| YYYY-MM-DD | o que aconteceu, com arquivo:linha | a lição acionável |
```

A terceira coluna tem que ser uma instrução que muda o que a próxima rodada faz.
"Tomar cuidado com estado" não serve. "Estado de venda vive só em
`src/lib/venda.js`; componente que guardar cópia local dessincroniza ao
recarregar" serve.

**Só escreva o que esta rodada de fato ensinou.** Rodada tranquila que não
ensinou nada não precisa de linha — inventar lição polui a memória e a próxima
rodada perde tempo lendo.

## `memory/patterns.md`

Quando a rodada estabeleceu (ou confirmou pela terceira vez) um jeito de fazer
que vale repetir:

```
### <nome do padrão>
<quando usar, em uma frase>
<como fazer, com o exemplo de onde já está no código>
```

Se você seguiu um padrão que já estava escrito e ele funcionou, não duplique —
no máximo acrescente a referência do novo uso.

## `memory/bugs.md`

Todo erro que custou tempo nesta rodada, mesmo que você tenha resolvido:

```
### <sintoma como ele apareceu>
- Causa: <a causa real, não o sintoma>
- Como resolver: <o passo concreto>
- Como evitar: <o que fazer diferente da próxima vez>
```

Rodada revertida no portão 1 ou 2 **sempre** gera entrada aqui — é o registro
mais valioso que o laboratório produz.

## `memory/decisions.md`

Só quando a rodada fixou algo que amarra as próximas (formato de dado,
estrutura de pasta, biblioteca escolhida). Uma linha de data, a decisão, e o
porquê. Decisão que precisa do dono **não** entra aqui — vai para "Pendente de
decisão" no ledger.

Ao terminar, liste em uma linha quais arquivos de `memory/` você tocou.
