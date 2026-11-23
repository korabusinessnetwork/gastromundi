# Refatoração 3.1 e 3.3: um componente por arquivo na Delivery e nas Configurações

> Pedido do dono (2026-11-23): *"continue"*.

## A mudança

1. **3.1, Delivery.** Os 12 componentes que moravam em `DeliveryView.jsx` (2.706 linhas,
   70 `useState`) foram para `views/delivery/`, um por arquivo, e as cores de status para
   `delivery/corStatus.js`. A tela ficou com 355 linhas e 6 `useState`.
2. **3.3, Configurações.** As 15 abas e painéis de `ConfiguracoesView.jsx` (1.846 linhas)
   foram para `views/configuracoes/`, uma por arquivo, e as constantes que mais de uma
   aba usa para `configuracoes/apoio.jsx`. A tela ficou com 82 linhas. `UsuariosTab` e
   `UnidadesMedidaTab` continuam exportados por `ConfiguracoesView`, porque os testes os
   importam de lá.
3. Nenhum código mudou além de caminho e import: o recorte é feito por script, que copia
   cada componente inteiro e poda só os imports que o lint aponta como sem uso.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo das duas telas passa de 600 linhas | `wc -l` |
| 2 | Nenhum componente das duas telas passa de 15 `useState` | contagem por arquivo |
| 3 | Testes das telas passam sem alteração | suíte; diff vazio em `*.test.jsx` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

Critérios 1, 3, 4 e 5 em sim. O critério 2 vale para as Configurações (máximo 11) e falha
num arquivo da Delivery: o `ModalProduto.jsx` tem 18 `useState`. Ele já tinha 18 dentro do
arquivo antigo; separar não piorou nem resolveu. Fica para a próxima rodada da fase 3,
agrupando o estado do formulário.
