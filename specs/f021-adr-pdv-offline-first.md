# F021 — ADR do PDV offline-first: outbox, replay da cascata e limites conhecidos

## 1. Escopo

Registrar em ADR a arquitetura offline-first que já está rodando em produção e que
o código construiu sem decisão escrita. O `features.md` diz, com todas as letras,
que o F021 está parcial "sem o ADR que o item exigia". Este spec fecha essa lacuna.

O ADR precisa cobrir quatro coisas:

1. **O que foi decidido de fato**, lendo o código: outbox local com `uid` por
   operação, storage injetável, dreno FIFO com parada no primeiro erro de rede,
   descarte de erro definitivo, isolamento multi-tenant por carimbo `__tenant`,
   snapshot de bootstrap para o app abrir sem internet.
2. **Por que o replay não é reenvio de `pedidos`**, e sim reprodução da cascata
   inteira: a venda é transação-fonte pela decisão 009 e dispara caixa, estoque,
   financeiro, vendas normalizadas e Jarvas.
3. **Como a idempotência foi resolvida em cada tipo de operação**, porque é o que
   impede o replay de debitar estoque duas vezes ou emitir duas notas.
4. **Os limites conhecidos**, cada um nomeado como pendência, para que a próxima
   fatia do F021 parta daqui em vez de reabrir a discussão.

## 2. Fora de escopo

- **Implementar qualquer coisa.** Esta tarefa é documentação. Nenhuma linha de
  código de produção muda, nenhum teste novo nasce. Trocar `localStorage` por
  IndexedDB é a tarefa T05 e depende deste ADR, não o contrário.
- **Decidir o que ainda não foi decidido.** Conflito multi-dispositivo, realtime
  degradado e contingência fiscal entram no ADR como pendência aberta com o
  problema descrito, não como decisão tomada. Fingir decisão que ninguém tomou é
  pior que não ter ADR.
- **Superseder o ADR-007 ou o ADR-005.** O offline convive com eles, não os
  substitui.

## 3. Arquivos afetados

- `docs/08_DECISOES/adr-013.md` (novo)
- `docs/08_DECISOES/overview.md` (modificado, linha no índice de ADRs)
- `docs/09_BACKLOG/features.md` (modificado, a linha do F021 deixa de acusar a
  falta do ADR e passa a apontar para ele)

## 4. Solução

ADR-013, status Aceito e implementado, data 2026-09-10, no mesmo template dos
ADRs 005 a 012: Contexto, Decisão, Consequências, Alternativas consideradas,
Pendências.

A Decisão descreve o que o código faz hoje, com o arquivo e a linha de cada
mecanismo, para o ADR ser conferível e não uma redação bonita:

- `src/lib/offline/fila.js`, a fila e o `drenarFila`.
- `src/lib/offline/filaApp.js`, a instância única compartilhada entre o provider
  e a tela de notas emitidas.
- `src/lib/offline/rede.js`, a separação entre queda de rede e erro definitivo.
- `src/lib/offline/snapshot.js`, o snapshot de bootstrap com carimbo de tenant.
- `src/context/AppContext.jsx`, o `executarOpOffline` com os oito tipos de
  operação e o `enfileirarOffline` como porta única de entrada.
- `supabase/migrations/20260830_idempotencia_baixa_estoque.sql`, o `p_op_id` que
  torna a baixa de estoque repetível.

## 5. Critérios de aceite

| # | Critério | Como conferir |
|---|----------|---------------|
| 1 | `docs/08_DECISOES/adr-013.md` existe, com status, data e as cinco seções do template | abrir o arquivo |
| 2 | Cada mecanismo citado no ADR aponta para um arquivo que existe, e o que o ADR diz que o arquivo faz é o que ele faz | conferir arquivo por arquivo contra o código |
| 3 | Os oito tipos de operação do `executarOpOffline` estão descritos, nenhum a menos | comparar com `AppContext.jsx` |
| 4 | A idempotência de cada tipo está explicada, incluindo os dois casos em que ela ainda não existe | ler a seção de idempotência |
| 5 | As seis pendências herdadas do `features.md` aparecem nomeadas na seção de pendências | comparar com a nota do F021 |
| 6 | `overview.md` lista o ADR-013 no índice, com título e status batendo com o arquivo | abrir o índice |
| 7 | A linha do F021 no `features.md` não diz mais "sem o ADR" e aponta para o ADR-013 | abrir o backlog |
| 8 | `npm test` continua com 229 arquivos e 4067 testes verdes | rodar a suíte |

## 6. Casos de borda

- **O ADR não pode inventar decisão.** Onde o código resolveu por omissão, o ADR
  diz que foi por omissão. O `reenviarVendaOffline` tem uma dívida escrita no
  próprio comentário do código, o evento e a escrita dupla podem reemitir no
  dreno, e isso vai para o ADR como está, sem maquiagem.
- **Numeração de ADR é permanente.** O 013 precisa estar livre. Se algum ADR-013
  já existir, o novo vira 014 e o índice acompanha.
- **A tarefa é de documentação, mas a suíte roda mesmo assim**, porque o critério
  de pronto do modo automático exige verificação de verdade e não confiança.

## 7. Aprovado sem ressalvas quando

Os oito critérios da tabela passam, a suíte fica verde, e nenhuma afirmação do
ADR contradiz o código lido na conferência.
