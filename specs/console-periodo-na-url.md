# CONSOLE-UX (rodada 9) — o período do uso fica na URL

## 1. Escopo

O período da aba "Uso e faturamento" (últimos 7 / 30 / 90 dias) passa a viver na
URL (`/console?aba=uso&dias=90`), fechando o último estado do Console que a
recarga ainda apaga. Hoje o período é estado interno do `AnalyticsDashboard`:
recarregar volta para 30 dias sem avisar, e não dá para mandar a si mesmo o
link do trimestre.

## 2. Fora de escopo

- Períodos novos (hoje, 180 dias, intervalo livre) ou mudança no conjunto
  `PERIODOS_ANALYTICS`.
- Guardar o termo da **busca** na URL (mesma razão das rodadas 33 e 34).
- Mudança visual nos botões de período, nos números ou na tabela de uso.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 34 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: consistência entre telas — depois das rodadas 33 e
  34, o período seria o único controle do Console que não sobrevive à recarga.
- Rodadas 33 e 34: mesmo molde — normalizador puro, o valor padrão **remove** o
  parâmetro, e a escrita usa `{ replace: true }`.

## 4. Arquivos afetados

- `src/lib/console.js` — normalização do período vindo da URL.
- `src/lib/console.test.js` — testes da normalização.
- `src/pages/console/ConsolePage.jsx` — ler e escrever o parâmetro `dias`.
- `src/components/console/AnalyticsDashboard.jsx` — o período vira propriedade
  controlada pela página, em vez de estado interno.
- `src/components/console/AnalyticsDashboard.test.jsx` — ajuste ao componente
  controlado.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. Função pura exportada em `src/lib/console.js` que recebe o valor cru do
   parâmetro (texto) e devolve sempre um período de `PERIODOS_ANALYTICS` —
   sem ler `window`, sem tocar no roteador.
2. Valor desconhecido, vazio, ausente, não numérico, fora do conjunto (ex.:
   `45`) ou repetido cai em **30 dias**, o padrão de hoje.
3. Abrir `/console?aba=uso&dias=90` já carrega o uso dos últimos 90 dias, com o
   botão de 90 marcado (`aria-pressed`), sem clique nenhum.
4. Clicar num período escreve o parâmetro; escolher **30 dias** (o padrão)
   **remove** o parâmetro, deixando o endereço limpo.
5. A navegação não empilha histórico: trocar de período várias vezes e apertar
   "voltar" sai do Console.
6. Período, aba e recorte convivem na mesma URL — nenhuma das três escritas
   apaga as outras duas.
7. O `AnalyticsDashboard` recarrega o uso quando o período muda por
   propriedade, exatamente como recarregava quando o período era estado
   interno (a leitura continua sendo dele, não da página).
8. Nenhuma consulta nova ao banco (a mesma `listarAnalitico`, só com outro
   argumento); nenhuma cor hardcodada; nenhum estilo inline novo.
9. As rodadas 28 a 34 seguem verdes, incluindo os testes próprios do
   `AnalyticsDashboard`.
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `?dias=90.0`, `?dias=abc`, `?dias=`, `?dias=-30`, `?dias=45`, `?dias=7&dias=90`
  (critério 2).
- `?dias=90` com a aba de estabelecimentos aberta: o parâmetro fica na URL sem
  efeito visível e volta a valer quando a aba de uso abrir.
- `?dias=90` com `erroAssinaturas` verdadeiro: a aba de uso segue mostrando o
  estado de erro que já mostra hoje.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 8.

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 10 de 10 critérios.**
Suíte: `npx vitest run` — verde, 198 arquivos / 3240 testes (+14 nesta rodada).

| # | Critério | Evidência |
|---|---|---|
| 1 | Função pura exportada | `src/lib/console.js` — `normalizarPeriodo` e `PERIODO_PADRAO`, sem `window` e sem roteador |
| 2 | Desconhecido/vazio/ausente/não numérico/fora do conjunto → 30 | `src/lib/console.test.js` — `describe("normalizarPeriodo")`, 7 testes, incluindo `"90.0"`, `" 90"`, `"-30"` e `45` |
| 3 | `?aba=uso&dias=90` abre em 90 dias marcado | `ConsolePage.test.jsx` — "abrir com ?aba=uso&dias=90…" checa `aria-pressed`; `AnalyticsDashboard.test.jsx` — "abre no período que a página mandou" checa a chamada `listarAnalitico(90)` |
| 4 | Clique escreve; 30 dias remove | `ConsolePage.jsx` — `escolherPeriodo` com `proximo.delete("dias")` quando é `PERIODO_PADRAO`; teste assere `/console?aba=uso` limpo |
| 5 | Não empilha histórico | `{ replace: true }`; teste com 3 trocas e o "voltar" caindo em `/inicio` |
| 6 | Período, aba e recorte convivem | teste "período, aba e recorte convivem": as três chaves sobrevivem, e sair da aba de uso mantém `dias=90` guardado |
| 7 | Recarrega quando o período muda, e a leitura continua no componente | `AnalyticsDashboard.jsx` — `listarAnalitico(dias)` dentro do `useCallback([dias])`; teste "recarrega do banco ao trocar de período" assere `listarAnalitico(90)` |
| 8 | Sem consulta nova, sem cor hardcodada, sem estilo inline | diff toca 6 arquivos e nenhum `#hex`/`style=` novo |
| 9 | Rodadas 28 a 34 verdes, incluindo os testes do AnalyticsDashboard | as 11 describes de `ConsolePage.test.jsx` e as 6 de `AnalyticsDashboard.test.jsx` passam |
| 10 | Verde, sem `console.log`, sem `TODO` novo | auditoria do diff |

**Fica para uma próxima rodada:** atalho por plano no Console; paginação da
lista quando a base crescer.
