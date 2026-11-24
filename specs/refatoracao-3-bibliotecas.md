# Refatoração 3: as bibliotecas de regras por assunto, e o fim da fase 3

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

As três bibliotecas que passavam de 600 linhas viram pastas com um arquivo por assunto. O
arquivo original continua no mesmo lugar e só reexporta, com exatamente os mesmos nomes de
antes. Nenhum import de fora muda, e os testes que substituem o módulo inteiro
(`vi.mock("@/lib/console")`) continuam valendo.

| Biblioteca | Antes | Partes |
|---|---|---|
| `lib/console.js` | 1.579 linhas, 53 nomes exportados | `console/`: leitura (93), lista (247), painéis (377), cadastro (287), erros (113), gravações (340), solicitações (135) |
| `lib/deliveryAdmin.js` | 724 linhas, 35 nomes | `deliveryAdmin/`: regras (348), dados (356) |
| `lib/delivery.js` | 664 linhas, 28 nomes | `delivery/`: carrinho, pedido, endereços |

Três nomes internos do Console (`URGENCIA_STATUS`, `precisaAtencao`, `EDGE_URL`) passaram a
ser exportados entre os arquivos irmãos, porque uma parte usa o que a outra define. Eles
não entram na lista pública do ponto de entrada.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo de código passa de 600 linhas | `npm run metricas` |
| 2 | Cada ponto de entrada exporta exatamente os mesmos nomes de antes | comparação dos conjuntos (53, 35 e 28, iguais) |
| 3 | Testes passam sem alteração | suíte |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. **A fase 3 está concluída**: 0 arquivos acima de 600 linhas
(eram 22) e nenhum acima de 15 `useState` (o máximo era 70).
