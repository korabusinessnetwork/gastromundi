# Refatoração 4.6: o Financeiro do celular vê as contas vencidas

> Pedido do dono (2026-11-24): *"continue"*.

## O defeito achado ao comparar as duas telas

O Financeiro do computador, ao abrir, grava como `vencido` as contas atrasadas
(`processarVencidos`). O painel do celular buscava só contas com status `previsto` e só
chamava de vencida a `previsto` com data passada. Depois que o computador abria o
Financeiro uma vez, as contas atrasadas **sumiam** da seção "Vencidos" do celular, que
passava a dizer que não havia nada vencido justamente quando havia. É a mesma classe de
erro que a regra `contaEmAberto` existe para evitar.

## A mudança

1. `listarLancamentos` aceita uma lista de status; o celular busca as contas em aberto pela
   regra (`STATUS_EM_ABERTO`: previsto e vencido), agora exportada.
2. `resumirContasEmAberto` em `lib/financeiro.js`, pura e com teste: vencidas (já marcadas
   `vencido` ou `previsto` com data passada), o total vencido em centavos, e as próximas a
   vencer. O painel do celular usa ela em vez das contas que fazia por conta própria.

O computador já carregava todos os lançamentos e marcava os vencidos; não muda.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | O celular busca previsto e vencido | teste de tela |
| 2 | Conta já marcada `vencido` aparece em "Vencidos" no celular, provado contra a versão anterior do arquivo | `FinanceiroModulo.test.jsx` (arquivo novo; o módulo não tinha teste) |
| 3 | A regra nova nasce com teste (vencidas, próximas, conta paga fora) | `financeiro.test.js` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim.
