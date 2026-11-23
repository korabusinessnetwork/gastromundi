# Refatoração 1.6: salvar subproduto numa transação só

> Achada na tarefa 1.4 (2026-11-23) e feita a pedido do dono: *"faça o recomendado e
> continue"*.

## O defeito

`SubprodutosView.jsx` gravava o subproduto e, numa segunda chamada, o saldo em
`estoque_subprodutos`. Na criação, se a segunda falhasse, o subproduto já existia e a tela
mostrava erro; o operador clicava de novo e criava um duplicado. Na edição, o cadastro
mudava e o saldo ficava o antigo.

## Escopo

- RPC `salvar_subproduto` (migration `20261126_salvar_subproduto_atomico.sql`),
  `SECURITY INVOKER`.
- `salvarSubproduto` em `src/features/cardapio/dados/subprodutos.js`, substituindo as três
  funções de gravação separadas.

## Mudança intencional de comportamento

1. Salvar subproduto passa a ser tudo ou nada.
2. Recusa de permissão vira frase que diz o que fazer.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Criar e editar fazem uma única chamada, à RPC, sem escrita direta | `SubprodutosView.test.jsx` |
| 2 | Falha no saldo depois do subproduto inserido desfaz o subproduto | cenário SQL 3b |
| 3 | Caixa é recusado ao criar e ao editar, sem nada mudar | cenários SQL 4 e 5 |
| 4 | Validações (inclusive `NaN`) recusam antes de gravar | cenários SQL 3 e 7; guard |
| 5 | Deixar de controlar estoque não apaga o saldo, como antes | cenário SQL 6; guard |
| 6 | Outro estabelecimento é invisível; anônimo não executa | cenários SQL 8 e 10 |
| 7 | Na recusa, o modal fica aberto e o motivo aparece | teste da tela |
| 8 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
