# CONSOLE-UX (rodada 7) — o recorte escolhido fica na URL

## 1. Escopo

O atalho de situação escolhido na rodada 32 passa a viver na URL
(`/console?situacao=atencao`), para que recarregar a página, favoritar o
endereço ou abrir o Console em outra aba do navegador devolva a mesma lista.
Hoje qualquer recarga volta para "Todos" sem avisar.

## 2. Fora de escopo

- Guardar o termo da **busca** na URL — texto digitado é transitório, e
  endereço com nome de cliente dentro é dado de terceiro no histórico.
- Guardar a **aba** (`estabelecimentos` | `planos` | `uso`) na URL.
- `localStorage` ou qualquer persistência por usuário no banco.
- Filtros novos (plano, add-on, data) ou mudança na régua de urgência.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 32 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "Estados sempre visíveis" — a URL é o único
  lugar onde o estado da tela sobrevive à recarga, e é o que o dono manda
  para si mesmo quando quer voltar amanhã na mesma lista.
- Rodada 32: a régua e os rótulos continuam os mesmos; muda só de onde o
  estado inicial vem.

## 4. Arquivos afetados

- `src/lib/console.js` — normalização do valor vindo da URL.
- `src/lib/console.test.js` — testes da normalização.
- `src/pages/console/ConsolePage.jsx` — ler e escrever o parâmetro.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. Função pura exportada em `src/lib/console.js` que recebe o valor cru do
   parâmetro e devolve sempre um filtro válido — sem ler `window`, sem tocar
   no roteador.
2. Valor desconhecido, vazio, ausente, com caixa diferente ou repetido cai em
   `"todos"`: URL editada à mão nunca esconde estabelecimento nem quebra a
   tela.
3. Abrir `/console?situacao=atencao` já mostra a lista recortada, com o atalho
   correspondente marcado (`aria-pressed`), sem clique nenhum.
4. Clicar num atalho escreve o parâmetro na URL; escolher "Todos" **remove** o
   parâmetro, deixando o endereço limpo.
5. A navegação não empilha histórico: trocar de recorte cinco vezes e apertar
   "voltar" sai do Console, não desfaz filtro por filtro.
6. O termo da busca não vai para a URL, e trocar de recorte continua sem
   apagar o que está digitado (rodada 32, critério 5).
7. Com a leitura das assinaturas quebrada, os atalhos continuam sumindo — e um
   `?situacao=atencao` na URL nesse estado **não** recorta a lista: sem
   situação confiável não há recorte honesto, e o dono veria uma lista curta
   sem nenhum controle na tela para explicar por quê.
8. Nenhuma consulta nova ao banco; nenhuma cor hardcodada; nenhum estilo
   inline novo.
9. As rodadas 28 a 32 seguem intactas (ordem, busca, cobrar, histórico e o
   recorte por situação).
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `?situacao=ATENCAO`, `?situacao=`, `?situacao=xpto`, `?situacao=a&situacao=b`
  (critério 2).
- `?situacao=atencao` com `erroAssinaturas` verdadeiro (critério 7).
- `?situacao=atencao` com a base vazia: o vazio de cadastro continua mandando.
- Outros parâmetros já presentes na URL precisam sobreviver à escrita.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 6.

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 10 de 10 critérios.**
Suíte: `npx vitest run` — verde, 198 arquivos / 3214 testes (+16 nesta rodada).

| # | Critério | Evidência |
|---|---|---|
| 1 | Função pura normalizando o valor cru | `src/lib/console.js` — `normalizarFiltroSituacao`, sem `window` e sem roteador |
| 2 | Desconhecido/vazio/ausente/caixa diferente/repetido → `"todos"` | `src/lib/console.test.js` — `describe("normalizarFiltroSituacao")`, 7 testes |
| 3 | `/console?situacao=atencao` já abre recortado | `ConsolePage.test.jsx` — "abrir com ?situacao=atencao já mostra a lista recortada, sem clique" |
| 4 | Clique escreve o parâmetro; "Todos" o remove | `ConsolePage.jsx` — `escolherFiltro` com `proximo.delete("situacao")`; teste "clicar num atalho escreve o parâmetro" assere `/console` limpo |
| 5 | Não empilha histórico | `{ replace: true }` em `setSearchParams`; teste "trocar de recorte não empilha histórico" — 4 trocas e o "voltar" cai em `/inicio` |
| 6 | Busca fora da URL e preservada ao trocar de recorte | teste "o termo da busca não vai para a URL, e trocar de recorte não o apaga" |
| 7 | Com `erroAssinaturas` o parâmetro é ignorado | `ConsolePage.jsx` — `erroAssinaturas ? "todos" : normalizar…`; teste "com a leitura das assinaturas quebrada, o parâmetro da URL é ignorado" |
| 8 | Sem consulta nova, sem cor hardcodada, sem estilo inline | diff não toca em `ConsolePage.css` nem em `listar*`; auditoria do diff sem `style={{` e sem hex |
| 9 | Rodadas 28–32 intactas | as 8 describes anteriores de `ConsolePage.test.jsx` seguem verdes |
| 10 | Verde, sem `console.log`, sem `TODO` novo | auditoria do diff |

**Fica para uma próxima rodada:** guardar também a aba (`estabelecimentos`/`planos`/`uso`) na URL;
atalho por plano; paginação quando a base crescer.
