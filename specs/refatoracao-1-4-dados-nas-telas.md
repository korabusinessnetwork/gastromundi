# Refatoração 1.4: nenhuma tela fala com o Supabase direto

> Pedido do dono (2026-11-23): *"faça o recomendado e continue"*. Tarefa 1.4 de
> `docs/09_BACKLOG/plano_refatoracao.md`.

## Objetivo

Mover para `src/features/<domínio>/dados/` toda chamada ao Supabase que ainda está numa
tela. Eram 45 no começo da tarefa, em 14 arquivos.

## Como

- Mudança de lugar, não de comportamento. Cada função de dados devolve o mesmo
  `{ data, error }` que o Supabase devolvia, e a tela continua decidindo a frase de erro.
- A consulta é a mesma. Única exceção: a leitura de unidades de medida, que era `select *`
  no computador e lista de colunas no celular, virou a lista de colunas nas duas telas e
  ganhou o desempate por nome que o celular já usava. Nas outras tabelas a consulta foi
  movida como estava; trocar `*` por colunas sem conhecer cada uso é risco sem ganho agora.
- Lógica que aparecia copiada no computador e no celular vira uma função só.
- Três fatias, para o diff de cada uma continuar revisável:
  - **1.4a** unidades de medida e mesas (os pares computador e celular);
  - **1.4b** cardápio: combos, subprodutos, produtos, notas, impostos;
  - **1.4c** o resto: área admin, PDV, relatórios, clientes.

## Fora de escopo

- O contexto (`AppContext.jsx`), que é a tarefa 1.5.
- Os módulos de `src/lib/` que já falam com o Supabase, que mudam de pasta na fase 6.
- Mudar regra ou mensagem de tela.

## Critérios de aceite (valem para cada fatia, sobre os arquivos dela)

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo da fatia chama nem importa o Supabase | `npm run metricas`; `grep` |
| 2 | Os testes de tela existentes passam sem alteração de asserção | `npm test`; diff dos testes |
| 3 | Lógica copiada entre computador e celular virou uma função, com teste | diff; teste novo |
| 4 | Nenhum `select *` novo | `grep` |
| 5 | As telas da fatia ficam idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 6 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

E, ao fim da 1.4c: a regra de lint `no-restricted-imports` de tela vira **erro**.
