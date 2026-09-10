# Log de execução

<!-- uma linha por tarefa: data · id · resultado · commit -->

- 2026-09-10 · T01 · ADR-013 escrito (PDV offline-first: outbox, dreno FIFO, carimbo de tenant, snapshot, os 8 tipos de op e 6 pendências nomeadas), indexado no `overview.md`, linha do F021 atualizada no `features.md`. Suíte 229 arquivos / 4067 testes verdes.
- 2026-09-10 · T02 · TD009 etapa 3 fechada: nenhum caminho do app grava em `sales`, `persistirVendaNormalizada` devolve desfecho em vez de engolir erro, cancelamento virou coluna em `vendas` (migration 20260920) em vez de apagar as filhas, e `jaExistia` fechou a pendência 6 do ADR-013. Review aprovada sem ressalvas nos 11 critérios. Suíte 230 arquivos / 4082 testes verdes. Commit `6e5523cd`.
