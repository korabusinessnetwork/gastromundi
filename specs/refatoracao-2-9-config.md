# Refatoração 2.9, primeira fatia: a configuração dona do próprio estado

> Pedido do dono (2026-11-23): *"pode prosseguir"*.

## Antes de mexer: a rede de proteção

`AppContext.offlinePontaAPonta.test.jsx`, com um banco falso em memória que se comporta
como o real onde importa (venda com id único, baixa idempotente pela chave da operação):

1. Sem internet, fechar a comanda (venda, duas baixas, comanda removida) e, com a rede de
   volta, cada coisa é gravada uma vez só e as pendências zeram; uma segunda oscilação
   não grava nada.
2. A baixa que o banco aplicou mas cuja resposta se perdeu não desconta duas vezes.
3. A venda que gravou mas cuja resposta se perdeu não é duplicada, nem as filhas.

O caso 2 foi conferido contra uma sabotagem do banco falso (ignorar a chave): o saldo cai
para 46 em vez de 48 e o teste reprova. A primeira versão não tinha esse caso, e a
sabotagem passou; foi isso que mostrou o buraco.

## A mudança

- `ConfigProvider` passa a ser dono dos oito estados da configuração e dos oito ajustes.
- A abertura do app hidrata pelo canal interno `useConfigCarga()` (`hidratarDaCarga`,
  `hidratarDoSnapshot`), que só o `AppProvider` usa.
- `AppProvider` monta o `ConfigProvider` por fora; a referência do estabelecimento atual
  nasce nele e é entregue aos dois lados.
- `gravarConfig` vira módulo compartilhado (`src/context/gravarConfig.js`), porque o caixa
  também grava em `config`.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os testes de ponta a ponta da fila offline existem e pegam a sabotagem da chave | suíte; sabotagem conferida |
| 2 | Nenhum estado nem ajuste de configuração mora mais no `AppContext.jsx` | `grep` |
| 3 | Os testes do contexto, inclusive os 11 da Ponte (carga, cópia offline e correção da cópia), passam sem alteração | suíte; diff |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
