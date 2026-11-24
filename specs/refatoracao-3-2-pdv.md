# Refatoração 3.2: o PDV em ganchos e janelas próprias

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`PDVView/index.jsx` tinha 2.190 linhas e 50 `useState`, a maior tela do sistema.

1. A janela de saldo do dia (`SaldoModal`), que já era um componente no fim do arquivo,
   vai para `PDVView/pdv/SaldoModal.jsx`.
2. A transferência de itens entre comandas sai em duas peças. O estado vai para
   `features/pdv/hooks/useEstadoTransferencia.js` e é chamado no começo, como antes,
   porque um efeito da tela lê `transferindo` na hora de desenhar. As duas ações vão para
   `features/pdv/acoesTransferencia.js`, chamada onde as funções estavam, recebendo os 10
   nomes de que dependem.
3. O resto da lógica vai para `features/pdv/hooks/usePdv.js` (14 `useState`), com o
   estado agrupado em três ganchos: janelas (11), cancelamento de comanda (7), mesa e
   cliente (9).
4. Sete regiões viram componentes em `PDVView/pdv/`: cabeçalho com as abas, área do
   pedido, nova comanda, cancelar comanda, transferir itens, confirmar cancelamento do
   pedido e escolher mesa. O JSX foi copiado sem mudança. O carregando e o caixa fechado
   ficaram na tela.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo do PDV passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Os testes do PDV passam sem alteração | suíte |
| 3 | A mesa pedida ao abrir comanda vazia e o cancelamento da comanda inteira ganham teste de tela, provado por sabotagem | `PDVView.janelas.test.jsx` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Tela com 332 linhas, gancho com 599, maior janela (transferir)
com 264. O gancho ficou rente ao limite, como o do Console.

Para a fase 4: a verificação de senha do cancelamento de comanda está escrita duas vezes
dentro do JSX da janela (Enter e botão), em vez de ser uma ação do gancho. Nesta rodada o
JSX é copiado sem mudança; juntar as duas é trabalho de quando a lógica for unificada.
