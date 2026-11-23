# Refatoração 3, lote: um componente por arquivo em oito telas

> Pedido do dono (2026-11-23): *"continue"*.

## A mudança

Oito telas do computador guardavam vários componentes num arquivo só. Cada componente foi
para o seu arquivo, numa pasta com o nome da tela, e o que mais de um usa (constantes,
formatadores) foi para um `apoio.jsx` na mesma pasta.

| Tela | Antes | Depois (arquivo da tela) | Componentes separados |
|---|---|---|---|
| `AdminView.jsx` | 1.145 | pasta `admin/` | 12 |
| `ImpostosAdmin.jsx` | 683 | pasta `impostos/` | 7 |
| `impressao/PontosImpressao.jsx` | 759 | mesma pasta | 5 |
| `CombosView.jsx` | 719 | pasta `combos/` | 2 |
| `ClientesView.jsx` | 690 | 330 | 2 |
| `relatorio/RelatorioView.jsx` | 1.604 | 1.321 | 7 |
| `NotasFiscaisTab.jsx` | 1.245 | 1.062 | 2 |
| `ProdutosView.jsx` | 988 | 879 | 3 |

O recorte é feito por script, que copia cada componente inteiro e poda só os imports que o
lint aponta como sem uso. Nenhum código mudou além de caminho e import.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Admin, Impostos, Pontos de impressão, Combos e Clientes sem arquivo acima de 600 linhas nem componente acima de 15 `useState` | `wc -l`, contagem |
| 2 | Testes das telas passam sem alteração | suíte; diff vazio em `*.test.jsx` |
| 3 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Fora deste lote, de propósito

Relatórios, Notas Fiscais e Produtos continuam acima de 600 linhas porque o componente
principal de cada uma é grande por si. Separar arquivo não resolve; elas precisam de
estado e efeitos extraídos para ganchos da feature, que é a próxima rodada.

## Resultado

4 de 4 critérios em sim. Suíte 255 arquivos / 4.357 testes verde, build limpo, lint 0
erros e os mesmos 26 avisos, 0 diferença nas 44 telas. Arquivos acima de 600 linhas: 20
para 15.
