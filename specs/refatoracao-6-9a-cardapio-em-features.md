# Refatoração 6.9a: as telas do cardápio passam a morar em `src/features/cardapio/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T20a (rodada acrescentada
> na 6.3, porque o "pronto quando" da fase 6 exige `components/desktop/views/` vazio).

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`regras/`**: `combos.js` (conta do combo) e `categoriasProduto.js`, ao lado de `produto.js`.
- **`desktop/`**: as telas de Produtos, Subprodutos e Combos, cada uma com seu CSS e seu teste, e
  as pastas de apoio `produtos/` e `combos/` como subpastas (as duas têm um `apoio.jsx`).
- 24 arquivos movidos, 29 com import reescrito. O guarda de SQL do combo lê o teste da tela de
  Combos pelo caminho; o caminho foi corrigido junto, e o guarda passa.

Fica fora: `busca.js`, a busca sem acento usada por sete telas de domínios diferentes (utilidade
compartilhada).

## Diferenças

22 telas do domínio (produtos, subprodutos, combos, categorias, cardápio do celular e cardápio
público) contra a 6.9: nenhuma diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Telas e regras do cardápio em `src/features/cardapio/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 46.
- Qualidade: nenhum crítico ou importante.
