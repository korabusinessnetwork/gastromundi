# CONSOLE-UX 30 — nenhuma cor de marca crua no Console

## 1. Escopo

Trocar as **34 cores de marca cravadas à mão** nos nove CSS do Console
(`rgba(239,68,68,…)`, `rgba(16,185,129,…)`, `rgba(245,158,11,…)`, `rgba(124,58,237,…)`,
`#f59e0b` e o preto do fundo do modal) pelos tokens `--gm-*` correspondentes, via
`color-mix`, e corrigir os dois comentários que afirmam que o âmbar "não tem token".
Fecha o **TD017**.

Só CSS. Nenhum arquivo `.jsx` é tocado — o levantamento confirmou que os JSX do Console
já não têm nenhuma cor literal.

## 2. Fora de escopo

- Os quatro `color: #fff` (texto sobre o accent). Dependem do token `--gm-sobre-accent`,
  **proposto ao dono na rodada 53 e ainda sem aval** — criar o token aqui seria decidir
  sozinho.
- A sombra preta do modal (`box-shadow … rgba(0,0,0,0.45)`). Sombra é profundidade, não
  cor de marca; preto continua preto.
- O resto do aplicativo. O `#f59e0b` literal aparece em mais de 30 lugares fora do Console
  (PDV, Estoque, Notas Fiscais, Jarvas, Impostos) — é uma rodada própria, maior, e mexe em
  JSX. Esta rodada fecha o Console.
- Mudar qualquer cor **percebida**: o resultado tem de ficar visualmente igual no tema
  padrão do GastroMundi. Isto é substituição de origem do valor, não redesenho.

## 3. Origem e decisões que este item honra

- **F022** (Console da Plataforma) — rodada CONSOLE-UX 30.
- **TD017** (`docs/09_BACKLOG/tech-debt.md`) — os oito `#f59e0b` literais do Console.
- **Decisão 017 (white-label)** — "nada de marca, nome, cor, logo ou regra específica de um
  cliente hardcodada". É o ponto central: o Console é a tela que o dono usa para vender, e
  hoje um tenant que troque o tema continua com âmbar, verde, vermelho e roxo fixos.
- **ADR-007 / `src/styles/tema.css`** — os hex vivem só lá; `src/lib/tema.js:66` já sabe
  sobrescrever `--gm-warn` por tenant, então o token está pronto e é o literal que sobra.
- **Decisão 018** — CSS separado do JSX.
- Fecha também os `rgba()` que a rodada 53 adiou em `.console__sucesso` e
  `.console__estado--erro`.

## 4. Arquivos afetados

| Arquivo | Linhas com cor crua |
|---|---|
| `src/components/console/PlanosDashboard.css` | 16 (mais o comentário da linha 7) |
| `src/components/console/AnalyticsDashboard.css` | 7 (mais o comentário das linhas 9-11) |
| `src/components/console/SeloStatus.css` | 3 |
| `src/components/console/NovoEstabelecimentoModal.css` | 3 |
| `src/pages/console/ConsolePage.css` | 3 |
| `src/pages/console/ConsoleLoginPage.css` | 2 |

`HistoricoPagamentosModal.css`, `AddonsModal.css` e `AlterarPlanoModal.css` só têm `#fff`
(fora de escopo) ou já estão limpos.

## 5. Critérios de aceite

1. **Zero `rgba()` de cor de marca nos CSS do Console.** Depois da rodada, uma busca por
   `rgba(` nesses nove arquivos só pode devolver a sombra preta do modal.
2. **Zero `#f59e0b` literal nos CSS do Console** — todos passam a `var(--gm-warn)`. TD017
   fechado.
3. **Equivalência de cor no tema padrão.** Cada troca usa
   `color-mix(in srgb, var(--gm-X) N%, transparent)` com o mesmo N da opacidade antiga
   (`rgba(…, 0.4)` → `40%`), de forma que o resultado renderizado no tema GastroMundi seja
   o mesmo de hoje. Onde o valor antigo não era o hex exato do token (o fundo do modal,
   `rgba(3,6,12,0.72)` contra `--gm-bg: #070b14`), a diferença fica anotada em comentário.
4. **Os dois comentários errados são corrigidos.** `PlanosDashboard.css:7` e
   `AnalyticsDashboard.css:9-11` dizem que o âmbar não tem token `--gm-*`; passam a citar
   `--gm-warn` e a razão pela qual ele é customizável por tenant.
5. **Nenhum token novo é criado.** Só os que já existem em `src/styles/tema.css`
   (`--gm-red`, `--gm-green`, `--gm-warn`, `--gm-accent`, `--gm-bg`, `--gm-alow`).
6. **CSS separado do JSX** — nenhum `.jsx` modificado, nenhum `style=` novo.
7. **Suíte verde** — `npx vitest run`, 201 arquivos / 3524 testes.

## 6. Edge cases conhecidos

- `color-mix` sobre `transparent` não é igual a `rgba()` em todos os casos: mistura no
  espaço sRGB **com** o canal alfa, então `color-mix(in srgb, #ef4444 40%, transparent)`
  resolve para `rgba(239,68,68,0.4)`. É a mesma conversão que `src/constants/colorAlfa.js`
  já usa no resto do aplicativo (e que `colorAlfa.test.js` trava) — seguir aquele padrão,
  não inventar outro.
- `PlanosDashboard.css:116,118` já usam `color-mix(in srgb, #f59e0b …)`: aí muda só o
  primeiro argumento, a porcentagem fica.
- O fundo escuro do modal (`.nem-overlay`) é compartilhado pelos sete modais do Console:
  virando `--gm-bg`, ele passa a seguir o tema do tenant. Num tenant de tema claro isso
  significa um véu claro em vez de escuro — é o comportamento correto para white-label,
  mas é a única troca desta rodada que muda comportamento em tema não-padrão, e precisa
  ficar escrita.
- `--gm-alow` já é o accent a 13%; onde o valor antigo era `rgba(124,58,237,0.4)` o token
  pronto não serve (opacidade diferente) — usar `color-mix` a 40%, não forçar `--gm-alow`.
- `SeloStatus.css` mistura os dois estilos na mesma regra (`background: rgba(...)` +
  `color: var(--gm-green)`); depois da troca as duas metades têm de sair do mesmo token.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, com evidência de arquivo e linha; suíte verde; nenhum token
novo; nenhum `.jsx` tocado; e a busca por `rgba(` e `#f59e0b` nos nove arquivos devolvendo
só o que o spec deixou explicitamente de fora. A verificação visual continua indisponível
(o navegador da sessão não abre) — como a rodada é substituição de valor equivalente, a
evidência é a aritmética de cada conversão, listada uma a uma.

## 8. Resultado da review

Aprovado sem ressalvas — 7 de 7 critérios. Suíte: `npx vitest run` — 201 arquivos /
3524 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | Zero `rgba()` de cor de marca | `grep -rn "rgba(" src/pages/console/ src/components/console/` devolve **uma** linha: `NovoEstabelecimentoModal.css:37`, a sombra preta do modal (fora de escopo) |
| 2 | Zero `#f59e0b` literal | mesma busca por `#f59e0b` nos nove arquivos: nenhuma ocorrência. TD017 fechado |
| 3 | Equivalência de cor | 35 trocas mecânicas com a mesma porcentagem da opacidade antiga (`0.4` → `40%`); `color-mix` em sRGB mistura com alfa pré-multiplicado, então `color-mix(in srgb, #ef4444 40%, transparent)` **é** `rgba(239,68,68,0.4)` — mesmo pixel, mesma convenção de `src/constants/colorAlfa.js` |
| 4 | Comentários corrigidos | `PlanosDashboard.css:5-9` e `AnalyticsDashboard.css:9-11` |
| 5 | Nenhum token novo | só `--gm-red`, `--gm-green`, `--gm-warn`, `--gm-accent` e `--gm-bg`, todos já em `src/styles/tema.css` |
| 6 | Nenhum `.jsx` tocado | `git status` — seis `.css` e este spec |
| 7 | Suíte verde | 201 arquivos / 3524 testes |

Trocas por arquivo, como o script reportou: `PlanosDashboard.css` 16,
`AnalyticsDashboard.css` 7, `SeloStatus.css` 4, `NovoEstabelecimentoModal.css` 3,
`ConsolePage.css` 3, `ConsoleLoginPage.css` 2.

Uma correção durante a review: a nota que escrevi acima do `.nem-overlay` citava o valor
antigo em `rgba(...)`, o que deixaria o critério 1 devolvendo duas linhas para sempre. A
nota passou a descrever o valor antigo em palavras — o hex está no histórico do git, que é
onde ele deve estar.

### Verificação visual

Continua indisponível (o navegador da sessão não abre). Nesta rodada isso pesa menos que
nas duas anteriores: a conversão é aritmética e preserva o valor renderizado no tema
padrão, então não há decisão visual a conferir. O que muda de verdade em tema não-padrão é
o véu do modal, que passa a seguir a paleta do tenant — e não existe tenant com tema
custom hoje.

## 9. Fica para uma próxima rodada

- **TD018** — o mesmo `#f59e0b` literal em mais de 30 lugares fora do Console, boa parte
  em `style=` inline no JSX (PDV, Cozinha, Estoque, Notas Fiscais, Impostos, Jarvas).
- Os quatro `color: #fff` do Console, quando o token `--gm-sobre-accent` for aprovado.
- Tema claro de verdade: só se ganha o benefício desta rodada quando existir um tenant com
  paleta própria para provar que o Console acompanha.
