# Refatoração 6.9c: a Área Admin passa a morar em `src/features/admin/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T20c.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`desktop/`**: a tela da Área Admin (`AdminView`, com CSS e teste) e a antiga pasta
  `views/admin/`: compras, fornecedores, fichas técnicas, os campos e janelas de apoio e o
  `apoio.jsx` com a data da compra corrigida na rodada anterior, junto com o teste dela.
- 18 arquivos movidos, 17 com import reescrito.
- Nota de atualização: a linha "Por dentro" de hoje passa a citar a Área Admin.

## Diferenças

22 telas da Área Admin contra a main: nenhuma diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Área Admin em `src/features/admin/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 272 arquivos e 4456 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 44.
- Qualidade: nenhum crítico ou importante.
