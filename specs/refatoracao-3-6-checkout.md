# Refatoração 3.6: o Checkout em gancho e regiões próprias

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`CheckoutView.jsx` tinha 1.374 linhas e 24 `useState` num componente só.

1. Formatação e catálogo de métodos do módulo (`fmtComanda`, `valorRecebido`,
   `METODOS_CATALOG`) vão para `PDVView/checkout/apoio.js`.
2. Estado e ações vão para `src/features/pdv/hooks/useCheckout.js` (8 `useState`), com o
   desconto e acréscimo em `useEstadoAjusteCheckout` (9) e a remoção de item em
   `useEstadoRemocaoCheckout` (7).
3. Quatro regiões viram componentes em `PDVView/checkout/`: o resumo do pedido, o painel de
   pagamento, a janela de desconto e acréscimo e a janela de remover item. O JSX foi
   copiado sem mudança.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo do Checkout passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Os testes do PDV passam sem alteração | suíte |
| 3 | A janela de desconto, que não tinha teste de tela, ganha teste do caminho inteiro (senha certa muda o total, senha recusada não aplica), provado por sabotagem | teste novo |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Tela com 116 linhas, gancho com 388, maior componente (painel de
pagamento) com 368. A janela de remover item já tinha teste de ponta a ponta.
