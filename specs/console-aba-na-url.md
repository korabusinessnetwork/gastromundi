# CONSOLE-UX (rodada 8) — a aba aberta fica na URL

## 1. Escopo

A aba do Console (`estabelecimentos` | `planos` | `uso`) passa a viver na URL
(`/console?aba=planos`), do mesmo jeito que o recorte de situação da rodada 33.
Recarregar a página, favoritar o endereço ou abrir o Console em outra aba do
navegador volta na mesma seção; hoje qualquer recarga cai em "Estabelecimentos".

## 2. Fora de escopo

- Guardar o termo da **busca** na URL (mesma razão da rodada 33: texto digitado
  é transitório e nome de cliente no histórico é dado de terceiro).
- Guardar estado de modal aberto, ordenação ou qualquer outro estado da tela.
- Mudança visual nas abas, nos rótulos ou no conteúdo delas.
- Filtros novos ou mudança na régua de urgência.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 33 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "Estados sempre visíveis" e consistência entre
  telas — se um controle da tela sobrevive à recarga, o outro ao lado dele não
  pode se comportar de forma diferente sem motivo.
- Rodada 33: reusar `normalizarFiltroSituacao` como molde, e o mesmo desenho de
  escrita (valor padrão **remove** o parâmetro, `{ replace: true }`).

## 4. Arquivos afetados

- `src/lib/console.js` — normalização do valor de aba vindo da URL.
- `src/lib/console.test.js` — testes da normalização.
- `src/pages/console/ConsolePage.jsx` — ler e escrever o parâmetro `aba`.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. Constante exportada com as abas válidas e função pura exportada em
   `src/lib/console.js` que recebe o valor cru do parâmetro e devolve sempre uma
   aba válida — sem ler `window`, sem tocar no roteador.
2. Valor desconhecido, vazio, ausente, com caixa diferente ou repetido cai em
   `"estabelecimentos"`: URL editada à mão nunca deixa o Console sem conteúdo.
3. Abrir `/console?aba=planos` já mostra a aba de planos aberta e marcada, sem
   clique nenhum; `/console?aba=uso` idem.
4. Clicar numa aba escreve o parâmetro na URL; voltar para "Estabelecimentos"
   **remove** o parâmetro, deixando o endereço limpo.
5. A navegação não empilha histórico: trocar de aba várias vezes e apertar
   "voltar" sai do Console, não desfaz aba por aba.
6. Aba e recorte de situação convivem na mesma URL: `?aba=planos&situacao=atencao`
   é válido, trocar de aba não apaga o `situacao` e trocar de recorte não apaga
   a `aba`.
7. O comportamento da rodada 33 segue intacto, inclusive o `erroAssinaturas`
   ignorando `?situacao=`.
8. Nenhuma consulta nova ao banco; nenhuma cor hardcodada; nenhum estilo inline
   novo; nenhuma mudança em `ConsolePage.css`.
9. As rodadas 28 a 33 seguem verdes (ordem, busca, cobrar, histórico, recorte e
   recorte na URL).
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `?aba=PLANOS`, `?aba=`, `?aba=xpto`, `?aba=a&aba=b` (critério 2).
- `?aba=planos` com `erroAssinaturas` verdadeiro: a aba abre e mostra o estado
  de erro que ela já mostra hoje — não cai para "Estabelecimentos".
- Outros parâmetros já presentes na URL precisam sobreviver à escrita.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 7.

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 10 de 10 critérios.**
Suíte: `npx vitest run` — verde, 198 arquivos / 3226 testes (+12 nesta rodada).

| # | Critério | Evidência |
|---|---|---|
| 1 | Constante e função pura | `src/lib/console.js` — `ABAS_CONSOLE` e `normalizarAba`, sem `window` e sem roteador |
| 2 | Desconhecido/vazio/ausente/caixa diferente/repetido → primeira aba | `src/lib/console.test.js` — `describe("normalizarAba")`, 6 testes |
| 3 | `?aba=planos` e `?aba=uso` abrem direto na seção | `ConsolePage.test.jsx` — "abrir com ?aba=planos…" e "abrir com ?aba=uso…", ambos checando `console__aba--ativa` |
| 4 | Clique escreve; "Estabelecimentos" remove | `ConsolePage.jsx` — `escolherAba` com `proximo.delete("aba")` quando é `ABAS_CONSOLE[0]`; teste assere `/console` limpo |
| 5 | Não empilha histórico | `{ replace: true }`; teste "trocar de aba não empilha histórico" — 3 trocas e o "voltar" cai em `/inicio` |
| 6 | Aba e recorte convivem | teste "aba e recorte de situação convivem": abre em `?situacao=em_dia`, troca de aba (o `situacao` sobrevive) e volta para Estabelecimentos (a `aba` some, o `situacao` fica). As duas escritas partem de `new URLSearchParams(atual)` e mexem só na própria chave |
| 7 | Rodada 33 intacta | `describe("ConsolePage — o recorte escolhido fica na URL")` segue verde, inclusive o caso do `erroAssinaturas` |
| 8 | Sem consulta nova, sem CSS, sem cor/estilo inline | diff toca só em 4 arquivos (`console.js`, `console.test.js`, `ConsolePage.jsx`, `ConsolePage.test.jsx`) |
| 9 | Rodadas 28 a 33 verdes | as 10 describes de `ConsolePage.test.jsx` passam |
| 10 | Verde, sem `console.log`, sem `TODO` novo | auditoria do diff |

**Fica para uma próxima rodada:** o período da aba "Uso e faturamento" (hoje estado
local do `AnalyticsDashboard`) também na URL; atalho por plano; paginação.
