# Refatoração 4.4: o Estoque do computador e do celular com as mesmas regras

> Pedido do dono (2026-11-24): *"continue"*.

## O que divergia

| Regra | Antes | Agora |
|---|---|---|
| Situação do saldo (ruptura, baixo, ok) | A biblioteca, usada pelo alerta do PDV e pela contagem da tela de Estoque, chamava de ruptura o saldo **zero ou negativo**. A cor da tela de Estoque do computador e a etiqueta do celular, só o saldo **exatamente zero**. | `situacaoDoSaldo` em `lib/estoqueSituacao.js`; `situacaoEstoque`, a cor do computador e a etiqueta do celular usam ela |
| Leitura da quantidade digitada | O computador tratava negativo como inválido; o celular lia "-5" como número e a contagem gravava **zero** | `lerQuantidade` em `features/estoque/regras/quantidade.js`, a do computador, que já tinha teste |

## Mudanças deliberadas de comportamento

1. **Saldo negativo aparece como ruptura** na tela de Estoque do computador (cor vermelha) e
   no celular (etiqueta "Ruptura"). Saldo negativo acontece com venda feita sem internet. Antes
   o PDV avisava "sem estoque" e as duas telas de Estoque diziam "baixo" para o mesmo produto.
2. **Número negativo na contagem do celular não é mais gravado como zero.** Fica como campo
   não contado, igual ao computador (prevenção > erro).

## Junto, na fronteira de `features/`

A linha do lançamento manual de nota (`novoItemManual`) e o mínimo padrão do estoque saíram do
`apoio` das telas para `features/estoque/regras/` e `lib/estoqueSituacao.js`. Arquivos de
`features/` que importam da pasta do computador: 8 para 5.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Cada regra da tabela existe uma vez só | busca |
| 2 | Regras com teste: saldo negativo é ruptura; zero, mínimo e acima | `estoqueSituacao.test.js` |
| 3 | O celular mostra ruptura para saldo negativo e não grava contagem negativa, provados contra a versão anterior do arquivo | `EstoqueModulo.test.jsx` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. O roteiro de fotos não tem produto com saldo negativo, por isso
nenhuma foto mudou.
