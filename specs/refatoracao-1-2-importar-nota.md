# Refatoração 1.2: importar nota fiscal numa transação só

> Pedido do dono (2026-11-23): *"começa a fase 1"*. Tarefa 1.2 de
> `docs/09_BACKLOG/plano_refatoracao.md`.

## O defeito

`NotasFiscaisTab.jsx` gravava a importação em quatro etapas soltas: nota, itens, histórico
de entradas e, produto por produto, a soma no saldo. Uma falha depois da primeira deixava a
nota gravada pela metade, sem itens ou sem saldo, e a reimportação era recusada como "nota
já importada". Só restava ajustar o estoque à mão.

## Escopo

- RPC `importar_nota_fiscal` (migration `20261124_importar_nota_fiscal_atomica.sql`),
  `SECURITY INVOKER`, que grava nota, itens e histórico e chama a `entrada_estoque`
  existente para cada item vinculado, tudo na mesma transação.
- Camada de dados `src/features/estoque/dados/notasEntrada.js`.
- A tela chama só a função de dados, relê o saldo e emite os mesmos eventos do Jarvas.

## Fora de escopo

- As outras chamadas diretas da tela (lista de notas, detalhe, fornecedor), que saem na 1.4.

## Mudança intencional de comportamento

1. A importação passa a ser tudo ou nada. A mensagem antiga "a nota foi salva, mas a
   entrada de X não foi somada" deixa de existir, porque esse estado deixou de ser possível.
2. Recusa de permissão vira frase que diz o que fazer.
3. O teste "entrada que falha diz qual produto não entrou no estoque" foi substituído por
   "recusa do banco não deixa nada gravado e diz o motivo". Os testes de valor (data de hoje
   à noite, quantidade sem dízima, arredondamento, fator apagado bloqueando) foram mantidos e
   passaram a ler os argumentos da RPC.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Confirmar a importação faz uma única chamada, à RPC, e nenhuma escrita direta nas tabelas da nota ou no saldo | `NotasFiscaisTab.test.jsx` |
| 2 | Falha em qualquer item desfaz a nota, os itens, o histórico e as somas já feitas | cenário SQL 3 |
| 3 | Depois de uma falha, a mesma nota pode ser reimportada | cenário SQL 4 |
| 4 | Chave duplicada é recusada e não soma o saldo de novo | cenário SQL 2; teste da tela |
| 5 | Só gerente e admin importam; caixa é recusado sem mudar nada; anônimo não executa | cenários SQL 7 e 10 |
| 6 | O saldo é somado pela `entrada_estoque`, nunca por escrita direta em `estoque` | guard |
| 7 | Custo do histórico e data de entrada iguais aos de antes | cenário SQL 1; guard; testes de dados |
| 8 | Item vinculado sem quantidade é recusado antes de gravar | cenário SQL 5; guard; teste da tela |
| 9 | A tela relê o saldo e emite `estoque.entrada` para o Jarvas por produto, como antes | teste da tela; diff |
| 10 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos e `grep` |
