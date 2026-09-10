# TAREFAS

Legenda: `[ ]` pendente, `[~]` em andamento, `[x]` concluída e verificada, `[!]` travada com diagnóstico.

Base verificada em 2026-09-10: suíte `npm test` com 229 arquivos e 4067 testes verdes, commit `8513a1c2`.

Toda tarefa roda pela skill `/ciclo`. Critério de pronto sempre inclui a suíte verde.

| # | Tarefa | Critério de pronto | trilha | depende |
|---|--------|--------------------|--------|---------|
| [x] T01 | F021, escrever o ADR do PDV offline-first (outbox, replay da cascata, idempotência, limites conhecidos) e atualizar a linha do F021 no backlog | `docs/08_DECISOES/adr-013.md` existe, está listado no `overview.md`, o F021 no `features.md` deixa de dizer "sem o ADR", suíte verde | docs | , |
| [x] T02 | TD009 etapa 3, encerrar a escrita dupla de venda no `AppContext.jsx` (`from("sales")` mais `persistirVendaNormalizada`), deixando só o caminho normalizado | nenhuma escrita direta em `sales` no `AppContext.jsx`, testes do fluxo de venda cobrindo o caminho único, suíte verde, TD009 marcado resolvido | contexto | , |
| [x] T03 | TD008, mover o bloqueio de tentativas de login para o servidor, no padrão do `senha_admin_tentativas`, mantendo o contador local só como feedback | migration nova com a RPC de tentativas, `LoginPage`/`AppContext` consultando o servidor, teste da regra, suíte verde, pendência de aplicar a migration registrada | auth | , |
| [ ] T04 | TD015, trocar `key={i}` por chave estável nas listas React (40 ocorrências) | nenhuma ocorrência de `key={i}`/`key={index}` sobrando sem justificativa escrita, suíte verde, TD015 marcado resolvido | ui | , |
| [ ] T05 | F021 fatia 2, trocar o `localStorage` da fila offline por IndexedDB com storage injetável preservado | `src/lib/offline/fila.js` gravando em IndexedDB, fallback para memória em ambiente sem IDB, testes da fila verdes, suíte verde | offline | T01 |
| [ ] T06 | F018 fatia, extrair o CSS inline dos arquivos com mais `style={{`, começando pelos 5 maiores | contagem de `style={{` medida antes e depois, queda registrada no F018, nenhum teste de componente quebrado, suíte verde | ui | T04 |
| [ ] T07 | Console do dev, próxima fatia da fila do dono: analytics operacional | aba nova no console lendo por RPC agregada, testes da tela, suíte verde | console | , |
