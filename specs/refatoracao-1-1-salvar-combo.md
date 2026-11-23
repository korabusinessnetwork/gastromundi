# Refatoração 1.1: salvar combo numa transação só

> Pedido do dono (2026-11-23): *"pode mesclar e começa a fase 1"*. Tarefa 1.1 de
> `docs/09_BACKLOG/plano_refatoracao.md`.

## O defeito

`CombosView.jsx` gravava o combo em até cinco chamadas soltas do navegador: atualiza o
combo, apaga os subprodutos, apaga os produtos, insere os subprodutos, insere os produtos.
Uma queda de rede depois dos deletes deixava o combo gravado sem itens, e o PDV passava a
vender o combo pelo preço cheio baixando só o estoque do item principal.

## Escopo

- RPC `salvar_combo` (migration `20261123_salvar_combo_atomico.sql`), `SECURITY INVOKER`.
- Primeira pasta da estrutura-alvo: `src/features/cardapio/dados/combos.js`.
- A tela chama só a função de dados.

## Fora de escopo

- O liga e desliga do combo, a carga da lista e a exclusão, que continuam chamando o
  Supabase direto da tela e saem na tarefa 1.4.
- Aplicar a migration `20260923` (policy aberta em `combo_produtos`), achada pendente em
  produção nesta rodada. É independente desta função e depende de decisão do dono.

## Mudança intencional de comportamento

1. Salvar o combo passa a ser tudo ou nada.
2. A recusa da RLS (`42501`) deixa de aparecer em inglês técnico e vira "Seu usuário não
   pode alterar combos. Peça a um gerente ou ao administrador."
3. Os três testes de edição B2 em `CombosView.test.jsx` cobravam a ordem das chamadas
   soltas (delete antes de insert, delete falho impede insert). Esse cenário deixou de
   existir no navegador. Eles foram substituídos por testes do contrato novo, e a garantia
   "tudo ou nada" passou para o banco, provada nos cenários SQL.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Salvar e editar combo fazem uma única chamada, à RPC, e nenhuma escrita direta nas três tabelas | `CombosView.test.jsx` |
| 2 | Falha no meio da gravação desfaz tudo, inclusive os deletes da edição | cenário SQL 3 |
| 3 | Gerente cria e edita; garçom é recusado nos dois casos | cenários SQL 1, 2, 7 e 8 |
| 4 | Combo de outro estabelecimento é invisível e a edição é recusada sem mudar nada | cenários SQL 6 e 9 |
| 5 | Combo sem item ou com quantidade menor que 1 é recusado antes de gravar | cenários SQL 4 e 5; guard |
| 6 | A função roda como quem chama, com `search_path` fixo, e anônimo não executa | guard; cenário SQL 10 |
| 7 | Cada recusa da função declara o próprio SQLSTATE, e a frase dublada no teste é a da migration | guard |
| 8 | O preço customizado é gravado como antes (zero e texto inválido viram `null`) | `combos.test.js` |
| 9 | A migration aplica duas vezes sem erro | cenários SQL, primeira linha |
| 10 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos e `grep` |
