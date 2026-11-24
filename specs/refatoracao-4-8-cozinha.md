# Refatoração 4.8: a Cozinha do computador e do celular com as mesmas regras

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava repetido, e o que divergia

| Regra | Antes | Agora |
|---|---|---|
| Itens que valem (não cancelados) | Filtro escrito 14 vezes pelo app: PDV, finalização, transferência, cozinha das duas telas, cupom, nota fiscal | `itensNaoCancelados` em `lib/comandaItens.js` |
| Status de cozinha, com "aguardando" quando não há | O celular normalizava; o **cartão** do computador usava o status cru | `statusCozinha` em `lib/cozinha.js` |
| Desde quando conta o tempo da etapa | Na regra de atraso e nos cartões das duas telas | `referenciaDaEtapa` em `lib/cozinha.js`; a regra de atraso usa ela |

## Defeito corrigido

No computador, o pedido sem status de cozinha entrava na coluna "Aguardando" (que já
normalizava), mas o cartão comparava o status cru e **não mostrava o botão "Iniciar
Preparo"**. O cozinheiro via o pedido e não tinha como começar. O roteiro de fotos sempre
teve um pedido assim (a Comanda 12): a foto da Cozinha do computador muda de propósito, só
pelo botão que aparece. A foto de referência dessa tela foi atualizada.

## Achado, fora do escopo

TD024: no computador, falha ao iniciar ou concluir o preparo só vai para o console; o
celular mostra a mensagem. Mudar a tela do computador é mudança de interface, para outra
rodada.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cada regra da tabela existe uma vez só | busca (`filter(... !x.cancelado)` só na definição) |
| 2 | As regras novas nascem com teste | `comandaItens.test.js`, `cozinha.test.js` |
| 3 | Pedido sem status mostra o botão de iniciar no computador, provado contra a versão anterior | `CozinhaView.test.jsx` |
| 4 | Testes existentes passam; a única foto que muda é a da Cozinha do computador, pelo botão | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim.
