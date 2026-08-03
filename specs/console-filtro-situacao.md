# CONSOLE-UX (rodada 6) — filtro por situação na lista

## 1. Escopo

Três atalhos acima da lista de estabelecimentos — **Todos**, **Precisam de
atenção** e **Em dia** — cada um com a contagem ao lado, filtrando a lista sem
consulta nova. Responde "quem eu preciso cobrar hoje", que a busca por nome
(rodada 29) não responde: ela serve para achar um estabelecimento conhecido.

## 2. Fora de escopo

- Filtro por plano, por add-on ou por data de criação.
- Filtro por status individual (um atalho para cada um dos seis estados) — a
  régua continua sendo a mesma do alerta e da ordem, em português do dia a dia.
- Persistir o filtro escolhido entre visitas (localStorage, URL).
- Paginação da lista.
- Mudar o comportamento da aba "Planos e assinaturas".
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 31 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- CLAUDE.md, princípio nº 1: "a próxima ação deve ser sempre a mais visível" e
  "nada de jargão técnico na tela" — os atalhos falam em "precisam de atenção",
  não em `bloqueado`/`carencia`.
- Rodada 28: a régua de urgência (`precisaAtencao`) já existe e ordena a lista.
  O filtro é a mesma régua, agora como recorte — sem uma segunda definição de
  "quem está com problema".
- Decisão 018: estilo dos atalhos vai para `ConsolePage.css`.

## 4. Arquivos afetados

- `src/lib/console.js` — função pura do recorte.
- `src/lib/console.test.js` — testes da função pura.
- `src/pages/console/ConsolePage.jsx` — os atalhos e o estado do filtro.
- `src/pages/console/ConsolePage.css` — estilo dos atalhos.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. Função pura exportada em `src/lib/console.js` que recebe a lista, o filtro
   escolhido e o conjunto de ids que precisam de atenção, e devolve o recorte —
   sem tocar no array recebido e sem ler nada do DOM.
2. Filtro desconhecido ou ausente devolve a lista inteira, na ordem recebida:
   um estado inválido nunca esconde estabelecimento.
3. Os três atalhos mostram a contagem de cada recorte, somando sempre o total
   da base ("Precisam de atenção" + "Em dia" = "Todos").
4. O atalho ativo é identificável por quem não enxerga cor (`aria-pressed`), e
   cada um tem rótulo em português sem jargão.
5. Filtro e busca (rodada 29) se combinam: o filtro recorta e a busca procura
   dentro do recorte; a legenda de urgência e o estado vazio continuam falando
   da lista que está na tela.
6. Sem resultado no cruzamento dos dois, a tela diz o que está filtrando e
   oferece voltar para "Todos" — distinto do vazio de base e do vazio de busca.
7. Com a leitura das assinaturas quebrada (`erroAssinaturas`), os atalhos não
   aparecem: sem situação confiável não há recorte honesto.
8. Nenhuma consulta nova ao banco; nenhuma cor hardcodada (tokens `--gm-*`);
   nenhum estilo inline novo.
9. As rodadas 28 a 31 seguem intactas (ordem por urgência, busca, cobrar e
   histórico pelo card).
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- `erroAssinaturas` verdadeiro (critério 7).
- Base vazia: os atalhos não aparecem — o vazio de base já resolve a tela.
- Recorte com zero itens (todos em dia, e o dono clica em "Precisam de
  atenção"): critério 6, com a contagem zero visível no próprio atalho.
- Trocar de filtro com busca ativa não pode limpar o termo digitado.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 5.

## 8. Resultado da review — 2026-08-02

**Aprovado sem ressalvas — 10 de 10 critérios.**
Suíte: `npx vitest run` — **198 arquivos / 3198 testes, verde** (eram 3180).

| # | Critério | Evidência |
|---|---|---|
| 1 | Função pura com a lista, o filtro e o conjunto de ids | `src/lib/console.js` → `filtrarPorSituacao(itens, filtro, idsAtencao)`; devolve `[...lista]` no caso amplo, `filter` nos recortes — não muda o array recebido, teste de pureza em `console.test.js` |
| 2 | Filtro desconhecido devolve tudo, na ordem | mesmo arquivo: só `"atencao"` e `"em_dia"` recortam, qualquer outro cai no `return [...lista]`; 4 testes (desconhecido, vazio, ausente, `"todos"`) |
| 3 | Contagens somam a base | `ConsolePage.jsx` → memo `contagens`, com `em_dia = total − atencao` por construção; teste "mostra os três atalhos com contagens que somam a base" |
| 4 | Ativo sem depender de cor, rótulo sem jargão | `aria-pressed={filtroSituacao === f}` e `ROTULOS_FILTRO` ("Todos", "Precisam de atenção", "Em dia"); teste "marca o atalho ativo com aria-pressed" |
| 5 | Filtro e busca se combinam | `tenantsDoFiltro` recorta, `tenantsVisiveis = filtrarEstabelecimentos(tenantsDoFiltro, busca)`; `quantosPrecisamAtencao` segue contando sobre o que está na tela; 2 testes |
| 6 | Vazio do cruzamento distinto e com volta | ramo `tenantsVisiveis.length === 0 && filtroSituacao !== "todos"` com botão "Ver todos"; testes checam ausência de "Criar o primeiro" e de "Limpar busca" |
| 7 | `erroAssinaturas` esconde os atalhos | `{!erroAssinaturas && (<div className="console__filtros" …>)}`; teste "com a leitura das assinaturas quebrada, os atalhos não aparecem" |
| 8 | Sem consulta nova, sem cor literal, sem inline | o recorte é memo sobre dado já carregado; `.console__filtros`/`.console__filtro` em `ConsolePage.css` só com `--gm-*`; `git diff` sem `style=` e sem hex |
| 9 | Rodadas 28 a 31 intactas | os 5 describes anteriores da `ConsolePage.test.jsx` seguem verdes (55 testes no arquivo) |
| 10 | Verde, sem `console.log`, sem `TODO` | varredura no diff sem achados |

**Fica para uma próxima rodada:** lembrar o filtro escolhido entre visitas (URL ou
localStorage); atalho por plano; paginação quando a base passar de algumas dezenas.
