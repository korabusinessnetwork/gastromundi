# Refatoração 1.3: excluir unidade de medida numa transação só

> Pedido do dono (2026-11-23): *"começa a fase 1"*. Tarefa 1.3 de
> `docs/09_BACKLOG/plano_refatoracao.md`.

## O defeito

Excluir uma unidade de medida, no computador e no celular, rodava quatro passos soltos:
limpa a unidade de estoque dos produtos, a de consumo, a da lista de compra, e só então
apaga a unidade. Além da queda de rede no meio, havia um caso certo de dano: em produção o
gerente pode alterar produto, mas só o admin pode apagar unidade, e um DELETE barrado pela
RLS não dá erro. Com um gerente, os produtos perdiam a unidade, a unidade continuava
cadastrada e a tela dizia "excluída". As duas telas mostram o botão para o gerente.

## Escopo

- RPC `excluir_unidade_medida` (migration `20261125_excluir_unidade_medida_atomica.sql`),
  `SECURITY INVOKER`, que confere que o DELETE apagou a unidade.
- Camada de dados `src/features/estoque/dados/unidadesMedida.js`, usada pelas duas telas.

## Fora de escopo

- A contagem de produtos afetados antes de confirmar, que continua lendo `products` da
  tela e sai na tarefa 1.4.
- Esconder o botão de excluir para quem não é admin. É decisão de produto; hoje a recusa
  chega com uma frase que diz o que fazer.
- A busca por abreviação sem olhar o tipo da unidade, mantida de propósito (TD022).

## Mudança intencional de comportamento

1. A exclusão passa a ser tudo ou nada, e o gerente recebe a recusa em vez de um falso
   "excluída" com os produtos já alterados.
2. As mensagens por passo do computador ("não deu para desvincular a unidade de estoque" e
   as outras três) deixam de existir, porque os passos deixaram de existir no navegador.
   Os testes de cada passo foram substituídos pelo contrato novo.
3. O celular deixa de dizer "confira a conexão" para qualquer falha e passa a mostrar o
   motivo que o banco deu.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | As duas telas excluem com uma única chamada, à RPC, sem escrita direta em `products` ou `unidades_medida` | `UnidadesMedidaTab.test.jsx`, `SecaoUnidades.test.jsx` |
| 2 | Gerente e caixa recebem recusa, e nenhum produto é alterado | cenários SQL 1 e 2 |
| 3 | Admin exclui, e a unidade sai de estoque, consumo e compra dos produtos do próprio estabelecimento | cenários SQL 3 e 4 |
| 4 | Unidade inexistente ou de outro estabelecimento é recusada sem mudar nada | cenários SQL 5 e 6 |
| 5 | Anônimo não executa; a função roda como quem chama, com `search_path` fixo | cenário SQL 7; guard |
| 6 | O DELETE é conferido e a falha dele desfaz os UPDATE | guard; cenário SQL 1 |
| 7 | A frase dublada nos testes das duas telas é a da migration | guard |
| 8 | Na recusa, a unidade continua na tela e o motivo aparece | testes das duas telas |
| 9 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos e `grep` |
