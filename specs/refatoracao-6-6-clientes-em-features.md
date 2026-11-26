# Refatoração 6.6: o domínio clientes passa a morar em `src/features/clientes/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T17.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`dados/clientes.js`**: cadastro, busca, histórico e fiado do cliente (fala com o Supabase).
- **`desktop/`**: a tela de Clientes (`ClientesView`) com o detalhe e a edição do cliente.
- 7 arquivos movidos, 11 com import reescrito. O comentário do módulo de Clientes do celular e
  `docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md` apontam para o caminho novo.

Ficam fora: `telefone.js`, que é a máscara e a validação de telefone usada também pelo delivery,
pelo console e pelo site da Kora (utilidade compartilhada); e `leads.js` e `solicitacoes.js`, que
são do site institucional e vão com a apex na 6.9.

## Diferenças

14 telas do domínio (Clientes no computador e no celular, fiado no PDV) contra a 6.5: nenhuma
diferença.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Domínio clientes em `src/features/clientes/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo | busca no repositório |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 66.
- Qualidade: nenhum crítico ou importante.
