# Refatoração 3: Mesas e Estoque em ganchos

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

| Tela | Antes | Tela depois | Gancho | Componentes novos |
|---|---|---|---|---|
| `mesas/MesasAdmin.jsx` | 727 linhas, 17 `useState` | 236 | `features/mesas/hooks/useMesasAdmin.js` (9), com o formulário em `useEstadoFormMesa` (7) | `CardMesaAdmin`, `ModalMesa`, `ConfirmarExclusaoMesa` |
| `EstoqueView.jsx` | 675 linhas, 16 `useState` | 359 | `features/estoque/hooks/useEstoque.js` (10), com a autorização em `useEstadoAutorizacaoEstoque` (6) | `estoque/PopupAutorizacaoEstoque` |

Constantes e funções do módulo foram para `mesas/apoio.jsx` e `estoque/apoio.js`. O
`EstoqueView` continua exportando `lerQuantidade` e `controlaEstoque`, que o teste da tela
importa de lá. O JSX de cada região foi copiado sem mudança. O carregando das Mesas, que
é um retorno antecipado com JSX, ficou na tela.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo das duas telas passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Testes existentes passam sem alteração | suíte |
| 3 | Mesas, que não tinha teste nenhum, ganha teste do caminho do gerente (abrir, criar, recusar número repetido, excluir com confirmação), provado por sabotagem | `mesas/MesasAdmin.test.jsx` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Arquivos acima de 600 linhas: 10 para 8.

Observação de uso, fora do escopo desta rodada: os botões de editar e remover do cartão
de mesa só aparecem com o mouse em cima. Em tela de toque o primeiro toque costuma
simular a passagem do mouse, mas não é garantido. Registrado como TD023.
