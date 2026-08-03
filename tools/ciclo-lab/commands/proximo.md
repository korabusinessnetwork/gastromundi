---
description: Escolhe o único item desta rodada, por prioridade fixa
---

Escolha **um** item. A prioridade é fixa — não invente critério novo, não
escolha o mais interessante, escolha o primeiro que existir:

1. **Suíte vermelha.** Rode `npm test`. Se algo estiver quebrado, o item da
   rodada é consertar isso. Nada mais.
2. **`backlog/bugs.md`** — o primeiro item não riscado.
3. **`backlog/features.md`** — o primeiro item não riscado.
4. **`backlog/tech-debt.md`** — o primeiro item não riscado, **desde que** as
   últimas três rodadas do ledger não tenham sido todas de tech-debt. Se
   tiverem, pule para o passo 5: o laboratório existe para melhorar a aplicação,
   não só para se arrumar por dentro.
5. **Backlog vazio.** Releia as regras de negócio do PDV em `docs/PDV.md`,
   compare com o que a aplicação já faz, e proponha **três** candidatos que
   fechem uma lacuna real. Escolha o mais simples dos três e escreva os outros
   dois em `backlog/features.md` para as próximas rodadas.

## Antes de fechar a escolha

- Confira a seção "Próximo item recomendado" da rodada mais recente do ledger.
  Se ela apontar para outro item e a prioridade acima não contradisser, siga a
  recomendação: seu antecessor tinha contexto que você não tem.
- Confira `memory/bugs.md`. Se este item já falhou antes, leia por que antes de
  tentar de novo — repetir o mesmo erro queima a rodada inteira.
- O item tem que caber em **uma** rodada. Se for grande, recorte a primeira
  fatia que funcione sozinha na tela e deixe o resto no backlog.

## Saída

Quatro linhas, nada mais:

```
Item: <identificador do backlog ou slug proposto>
De onde veio: <suíte vermelha | bugs | features | tech-debt | proposto do PDV.md>
Por quê: <uma frase>
Recorte desta rodada: <o que entra e o que fica para depois>
```
