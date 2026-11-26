# Refatoração 6.4: o domínio caixa passa a morar em `src/features/caixa/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T15.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`regras/`**: `caixa.js` (conta do caixa), `caixaMovimentos.js` (retirada e reforço) e
  `vendas.js` (arredondamento, total e pagamentos da venda).
- **`dados/`**: `vendasRepo.js`, ao lado de `caixa.js` e `vendas.js` que já estavam lá.
- **`desktop/`**: as três janelas do caixa, que moravam em `src/components/modals/`: abrir o
  caixa, fechar o caixa e retirar ou colocar dinheiro. A pasta `modals/` deixa de existir.
- 16 arquivos movidos, 39 com import reescrito. O guarda de SQL das movimentações lê o código-fonte
  de `caixaMovimentos.js` pelo caminho; o caminho foi corrigido junto, e o guarda passa.

Fica fora: o `tef.js` (pagamento com cartão na maquininha), que vai com o PDV na 6.5.

## Diferenças

21 telas do domínio (abrir e fechar o caixa, movimentos, finalizar e pagar no PDV, fechamentos no
relatório) contra a 6.3: nenhuma diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Domínio caixa em `src/features/caixa/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e conferência dos caminhos lidos pelos guardas |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 74.
- Qualidade: nenhum crítico ou importante.
