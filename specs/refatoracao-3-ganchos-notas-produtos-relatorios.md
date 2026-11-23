# Refatoração 3: ganchos em Notas Fiscais, Produtos e Relatórios

> Pedido do dono (2026-11-23): *"continue"*.

## A mudança

As três telas ainda passavam de 600 linhas depois de separar um componente por arquivo,
porque o componente principal de cada uma era grande por si. O método da fase 3 é tirar o
estado e as ações para um gancho da funcionalidade e cada região da tela para um
componente que lê desse gancho.

| Tela | Antes | Tela depois | Gancho | Componentes novos |
|---|---|---|---|---|
| Notas Fiscais | 1.062 linhas, 30 `useState` | 21 | `features/estoque/hooks/useNotasFiscais.js`, com o estado em `useEstadoImportacaoXml` (12) e `useEstadoNotaManual` (13) | lista, detalhe, assistente do XML, lançamento manual |
| Produtos | 879 linhas, 22 `useState` | 167 | `features/cardapio/hooks/useProdutos.js` (14), com as categorias em `useEstadoCategorias` (8) | cadastro, categorias, duas confirmações de exclusão |
| Relatórios | 1.321 linhas | 187 | `features/relatorios/hooks/useRelatorios.js` (11) | abas Vendas, Cancelamentos, Fechamentos, Logs, Credenciais e Admin |

O JSX de cada região foi copiado sem mudar uma linha. Cada componente desestrutura do
gancho só os nomes que usa; o lint confere os dois lados (nome sem origem e nome sobrando).
Os efeitos que passaram a usar setters de outro gancho declaram esses setters nas
dependências; eles são estáveis, então o efeito roda as mesmas vezes.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo das três telas passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Testes existentes das telas passam sem alteração | suíte; diff dos `*.test.jsx` só acrescenta |
| 3 | As abas dos Relatórios sem teste (Cancelamentos, Logs, Credenciais, Admin) ganham um que abre cada uma, provado por sabotagem | teste novo |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Arquivos acima de 600 linhas: 15 para 12.

Pendência registrada para a fase 6: os três ganchos importam constantes dos `apoio.jsx` que
ficam na pasta do computador (`components/desktop/views/...`). A funcionalidade depender da
tela é a seta invertida; resolve quando o `apoio` mudar para a pasta da funcionalidade.
