# CONSOLE-UX (rodada 10) — atalho por plano na lista

## 1. Escopo

A aba Estabelecimentos ganha uma segunda linha de atalhos, agora por **plano**
("Todos os planos", "Básico", "Avançado", … — o que existir no catálogo), cada
um com a contagem no próprio botão, recortando a lista sem consulta nova. O
recorte escolhido vive na URL (`/console?plano=basico`), no mesmo molde das
rodadas 33 a 35.

Responde a pergunta que o Console ainda não responde: **quem está no plano mais
barato** (candidato natural a upgrade) e **quantos estão em cada plano**. Hoje
só dá para saber abrindo card por card, ou olhando a distribuição na aba de
planos — que mostra o número, mas não diz quais são.

## 2. Fora de escopo

- Ação em massa (mudar o plano de vários de uma vez).
- Ordenar por plano, ou mudar a ordem por urgência que já existe.
- Guardar o termo da **busca** na URL (mesma razão das rodadas 33 a 35).
- Filtro por add-on, por layout ou por data de cadastro.
- Mudança visual no card, na aba de planos ou nos atalhos de situação.
- Qualquer migration ou mudança de schema.

## 3. Origem e decisões que este item honra

- Próximo item recomendado da rodada 35 no ledger (`specs/_loop.md`).
  Item de backlog: **F022**.
- Decisão 017 (white-label / multi-estabelecimento): os atalhos saem do
  **catálogo de planos do banco**, nunca de uma lista fixa no código — um
  plano novo aparece sozinho, e nenhum nome de plano fica cravado no JSX.
- CLAUDE.md, princípio nº 1: a contagem no próprio botão (clicar não é aposta)
  e o vazio do cruzamento explicando o que está filtrando, como na rodada 6.
- Rodadas 33 a 35 e `memory/patterns.md` ("Estado de tela que mora na URL"):
  normalizador puro, escrita a partir de `new URLSearchParams(atual)` com
  `replace`, e o valor padrão **apaga** o parâmetro.

## 4. Arquivos afetados

- `src/lib/console.js` — filtro por plano e normalização do parâmetro.
- `src/lib/console.test.js` — testes das duas funções puras.
- `src/pages/console/ConsolePage.jsx` — a linha de atalhos, o recorte e a URL.
- `src/pages/console/ConsolePage.css` — reuso do estilo dos atalhos que já
  existe; só o necessário para a segunda linha, com tokens de tema.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. Função pura exportada `filtrarPorPlano(itens, codigo)` em
   `src/lib/console.js`: `"todos"` devolve a lista inteira, um código devolve
   só quem tem aquele `plano_codigo`, e a ordem recebida é preservada.
2. Função pura exportada que normaliza o parâmetro da URL contra os códigos
   **do catálogo recebido** (não uma lista fixa): código inexistente, vazio,
   ausente, com caixa diferente ou repetido cai em `"todos"`.
3. Os atalhos são montados a partir de `planos` (catálogo do banco), com o
   rótulo do plano e a contagem de estabelecimentos naquele plano; a contagem
   é sobre a base inteira, não sobre o que a busca deixou na tela.
4. A linha de atalhos por plano só aparece quando há **mais de um** plano no
   catálogo — com um plano só, o recorte não recorta nada e seria ruído.
5. Abrir `/console?plano=basico` já mostra a lista recortada e o atalho
   marcado (`aria-pressed`), sem clique; "Todos os planos" **remove** o
   parâmetro; a escrita usa `replace` e não empilha histórico.
6. Plano, situação, aba e período convivem na mesma URL — nenhuma escrita
   apaga as outras.
7. Os três cortes se combinam na ordem situação → plano → busca, e o vazio do
   cruzamento diz que a lista está filtrada por plano, com um caminho de volta
   em um clique. O texto do vazio de situação sozinho não muda.
8. Nenhuma consulta nova ao banco; nenhuma cor hardcodada; nenhum estilo
   inline; nenhum nome de plano escrito no código.
9. As rodadas 28 a 35 seguem verdes — em especial o recorte por situação
   (rodada 32), a busca (rodada 30) e os três parâmetros de URL.
10. Suíte verde (`npx vitest run`), sem `console.log` e sem `TODO` novo.

## 6. Edge cases conhecidos

- Estabelecimento **sem plano** (`plano_codigo` nulo): aparece em "Todos os
  planos" e em nenhum recorte de plano — nunca some da tela sem filtro.
- Falha ao ler o catálogo de planos (`erroPlanos`): sem catálogo confiável não
  há atalho por plano; a linha não aparece e o parâmetro é ignorado, como o
  `?situacao=` é ignorado quando as assinaturas falham.
- Plano no catálogo sem nenhum estabelecimento: o atalho aparece com contagem
  zero (a informação "ninguém está nesse plano" é útil) e, clicado, cai no
  vazio explicado do critério 7.
- `?plano=BASICO`, `?plano=`, `?plano=xpto`, `?plano=a&plano=b` (critério 2).

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, `npx vitest run` verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nas rodadas 1 a 9.

## 8. Resultado da review — 2026-08-03

**Aprovado sem ressalvas — 10 de 10.** Suíte: `npx vitest run` — 198 arquivos,
**3271 testes**, verde (eram 3240 antes da rodada; +31).

| # | Critério | Evidência |
|---|---|---|
| 1 | `filtrarPorPlano` pura, preserva ordem | `src/lib/console.js` (JSDoc + `[...lista]`); `describe("filtrarPorPlano")` com 6 casos, inclusive "não muda o array recebido" |
| 2 | Normalizador contra o catálogo **recebido** | `normalizarFiltroPlano(bruto, planos)`; teste "valida contra o catálogo recebido, não contra lista fixa" aceita `food_truck` num catálogo e recusa no outro |
| 3 | Atalhos do catálogo, contagem sobre a base inteira | `contagensPlano = contarPorPlano(tenantsOrdenados)` (base ordenada, antes de situação e busca); teste das contagens `3/1/1/0` |
| 4 | Linha some com um plano só | `mostrarAtalhosPlano = !erroPlanos && planos.length > 1`; teste "com um plano só no catálogo a linha não aparece" |
| 5 | URL abre recortada, "Todos os planos" apaga o parâmetro, `replace` | testes "abrir /console?plano=basico…", "clicar num plano escreve o parâmetro…" e "não empilha histórico: 'voltar' sai do Console" |
| 6 | Plano, situação, aba e período convivem | teste "plano, situação, aba e período convivem no mesmo endereço" → `/console?situacao=em_dia&dias=90&plano=basico&aba=planos` |
| 7 | Ordem situação → plano → busca; vazio nomeia o plano; volta em um clique | cadeia `tenantsDoFiltro → tenantsDoPlano → tenantsVisiveis`; testes "os três cortes se combinam" (“Em dia e Avançado”), "o vazio do plano nomeia o plano" e "o 'Ver todos' limpa situação e plano de uma vez". Os textos do vazio de situação sozinha continuam idênticos — provados pelos testes da rodada 6, verdes |
| 8 | Sem consulta nova, sem cor/estilo inline, sem nome de plano no código | nenhuma chamada nova a `@/lib/console` de leitura; reuso de `.console__filtros`/`.console__filtro`; rótulos vêm de `p.nome`; teste "os rótulos saem do catálogo do banco" com planos fictícios |
| 9 | Rodadas 28 a 35 verdes | suíte completa verde; `ConsolePage.test.jsx` 89/89 |
| 10 | Suíte verde, sem `console.log`, sem `TODO` novo | `grep` nos dois arquivos: só a palavra "TODOS" em comentário e o `TODO estabelecimento` pré-existente |

### Correção durante a review

Sete testes das rodadas 6 e 7 quebraram no primeiro `vitest`: o helper
`atalho(nome)` procurava o botão em `screen` inteiro por prefixo, e
"Todos os planos" passou a casar com o `^Todos` do atalho de situação. Corrigido
escopando o helper ao grupo (`within(atalhos())`) — o rótulo da tela não mudou.
Registrado em `memory/learnings.md`.

### Ficou para depois

- Paginação da lista (a busca e os três recortes seguram bem até algumas
  dezenas de estabelecimentos; acima disso a rolagem volta a incomodar).
- Recorte por add-on contratado, no mesmo molde.
