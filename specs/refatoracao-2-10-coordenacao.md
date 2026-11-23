# Refatoração 2.10: a coordenação no próprio arquivo e o fim da fachada

> Pedido do dono (2026-11-23): *"continue"*.

## A mudança

1. Os 11 arquivos de teste do contexto trocam a fachada `useApp()` por
   `useContextoCompleto()`, auxiliar que só existe em `src/test/` e junta os seis ganchos
   para a sonda do teste. Nenhuma asserção mudou.
2. A fachada sai: o objeto `value`, o `AppContext` interno e o `useApp`. A coordenação
   perdeu 66 nomes que só existiam para montá-la.
3. A coordenação (carga, dreno da fila, Jarvas, pontes de impressão) vai para
   `src/app/CoordenacaoDaCarga.jsx`. O `AppContext.jsx` passa a só montar os provedores e
   reexportar os ganchos: 63 linhas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | `useApp` não existe em arquivo nenhum, nem de teste, e o `AppContext` não o exporta | `telasSemUseApp.test.js` |
| 2 | O `AppContext.jsx` só compõe provedores e reexporta ganchos, com no máximo 150 linhas | `npm run metricas` |
| 3 | Os 119 testes do contexto passam sem alteração de asserção | suíte; diff |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
