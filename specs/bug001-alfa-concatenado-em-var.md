# BUG001 — Alfa concatenado em `var()` apaga a borda

> Rodada 14 do ciclo · 2026-08-02

## 1. Escopo

Trocar todas as **26 linhas / 27 declarações** de estilo que montam cor com alfa
concatenando dois dígitos hex ao fim de uma CSS Custom Property
(`varColor(C.red) + "88"`, `` `${varColor(cor)}55` ``, `` `${tipo.color}44` ``) pelo
helper `alfa(cor, "NN")` de `src/constants/colorAlfa.js`, que produz
`color-mix(in srgb, <cor> N%, transparent)` — a forma válida no ADR-007.

## 2. Fora de escopo

- **Não** extrair CSS para arquivo `.css` (isso é o F018; esta rodada só corrige a
  expressão de cor onde ela já está).
- **Não** mexer em nenhum estilo inline que não seja um dos 26 sites listados na
  seção 4 — nem no mesmo objeto `style={{}}`, nem na linha vizinha.
- **Não** trocar `varColor(...)` por `alfa(...)` onde não há sufixo de alfa.
- **Não** criar token novo, **não** mexer em `TOKENS_PERMITIDOS`, `tema.css` ou
  `colors.js`.
- **Não** unificar/refatorar `COR_SEVERIDADE`, `ACTION_TYPE_META`, `ROLE_MAP` ou
  `METODOS_COLOR` para guardar nome de token em vez de `varColor(...)` — funciona
  como está depois da correção; mudar isso é outra rodada.
- **Não** corrigir a borda do `.pdv__saldo-btn:hover` (rodada 13 já registrou que
  ela foi omitida de propósito no CSS; o hover em JS não existe mais lá).

## 3. Origem e decisões que este item honra

- **`docs/09_BACKLOG/bugs.md` → BUG001**, aberto na rodada 13 (🟡 Medium,
  confirmado). Esta rodada corrige o inventário do registro: eram **19** sites com
  `varColor` (não 18) e existem mais **7** declarações em que o token chega por
  variável — total **27 declarações em 26 linhas, 7 arquivos**.
- **ADR-007 / decisão 023** — cor sempre por CSS Custom Property; blend com alfa
  por `color-mix`. `alfa()` foi escrito exatamente para isso e o cabeçalho do
  arquivo já diz que ele "substitui o antigo truque `${C.accent}44`".
- **Decisão 017 (white-label)** — a correção mantém a cor vindo do token do tenant;
  nenhum hex de marca é introduzido.
- `memory/patterns.md` — padrão "Alfa sobre token: `alfa()` ou `color-mix`, nunca
  hex concatenado", escrito na rodada 13.

## 4. Arquivos afetados

Todos os 7 já importam `alfa` de `@/constants/colorAlfa` — nenhum import novo é
necessário. Conversão: `pct = Math.round(parseInt("NN",16)/255*100)`.

| hex | % |
|---|---|
| `99` | 60 |
| `88` | 53 |
| `66` | 40 |
| `55` | 33 |
| `44` | 27 |
| `22` | 13 |
| `18` | 9 |

### Grupo 1 — `varColor(C.x) + "NN"` (17 linhas)

| Arquivo | Linha | Hoje | Vira |
|---|---|---|---|
| `src/components/desktop/Sidebar.jsx` | 340 | `varColor(C.red) + "88"` | `alfa(C.red, "88")` |
| `src/components/desktop/Sidebar.jsx` | 359 | `varColor(C.red) + "88"` | `alfa(C.red, "88")` |
| `src/components/desktop/Sidebar.jsx` | 556 | `varColor(C.accent) + "66"` | `alfa(C.accent, "66")` |
| `src/components/desktop/views/mesas/MesasAdmin.jsx` | 521 | `varColor(C.red) + "88"` | `alfa(C.red, "88")` |
| `src/components/desktop/views/mesas/MesasAdmin.jsx` | 688 | `varColor(C.accent) + "66"` | `alfa(C.accent, "66")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1201 | `varColor(C.accent) + "88"` | `alfa(C.accent, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1541 | `varColor(C.accent) + "88"` | `alfa(C.accent, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1646 | `varColor(C.accent) + "66"` | `alfa(C.accent, "66")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1740 | `varColor(C.green) + "88"` | `alfa(C.green, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1749 | `varColor(C.green) + "55"` | `alfa(C.green, "55")` |
| `src/components/desktop/views/PDVView/index.jsx` | 1971 | `varColor(C.accent) + "88"` | `alfa(C.accent, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 2087 | `varColor(C.red) + "88"` | `alfa(C.red, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 2092 | `varColor(C.accent) + "88"` | `alfa(C.accent, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 2093 | `varColor(C.red) + "88"` | `alfa(C.red, "88")` |
| `src/components/desktop/views/PDVView/index.jsx` | 2119 | `varColor(C.accent) + "88"` | `alfa(C.accent, "88")` |
| `src/components/modals/FechamentoModal.jsx` | 238 | `(isPositive ? varColor(C.green) : varColor(C.red)) + "99"` | `alfa(isPositive ? C.green : C.red, "99")` |
| `src/components/modals/FechamentoModal.jsx` | 340 | `varColor(C.accent) + "66"` | `alfa(C.accent, "66")` |

### Grupo 2 — `` `${varColor(...)}NN` `` (4 linhas)

| Arquivo | Linha | Hoje | Vira |
|---|---|---|---|
| `src/components/desktop/views/PDVView/index.jsx` | 886 | `` `${bc === "ok" ? varColor(C.green) : varColor(C.red)}44` `` | `alfa(bc === "ok" ? C.green : C.red, "44")` |
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | 353 | `` `${varColor(corSituacao)}55` `` | `alfa(corSituacao, "55")` |
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | 1257 | `` `${c.origem === "Em aberto" ? varColor(C.accent) : varColor(C.green)}44` `` | `alfa(c.origem === "Em aberto" ? C.accent : C.green, "44")` |
| `src/components/modals/FechamentoModal.jsx` | 311 | `` `${varColor(corDiferenca)}55` `` | `alfa(corDiferenca, "55")` |

> `corSituacao` e `corDiferenca` guardam **nome de token** (`C.x`), não `var(...)` —
> conferir no build; se guardarem `varColor(...)`, `alfa()` resolve pelo ramo literal
> e o resultado é o mesmo.

### Grupo 3 — alfa colado numa variável que carrega o token (5 linhas, 6 declarações)

Aqui a variável recebe `varColor(C.x)` (string `var(--gm-x)`) na origem, então
`alfa()` resolve pelo **ramo literal** — `color-mix(in srgb, var(--gm-x) N%, transparent)`,
igualmente válido. Precedente já no código: `ConfiguracoesView.jsx:82` faz
`alfa(r.color, "18")` com `r.color = varColor(C.accent)`.

| Arquivo | Linha | Hoje | Vira | Origem da variável |
|---|---|---|---|---|
| `src/components/desktop/views/ConfiguracoesView.jsx` | 747 | `` `${color}18` `` | `alfa(color, "18")` | prop `color={varColor(C.accent)}` (l. 953) |
| `src/components/shared/JarvasPanel.jsx` | 301 | `` `${cor}22` `` | `alfa(cor, "22")` | `COR_SEVERIDADE` (l. 20): `info`/`danger` são token |
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | 1449 | `` `${tipo.color}18` `` | `alfa(tipo.color, "18")` | `ACTION_TYPE_META` (l. 37-46): 5 de 6 são token |
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | 1450 | `` `${tipo.color}44` `` | `alfa(tipo.color, "44")` | idem |
| `src/components/desktop/views/PDVView/index.jsx` | 2442 | `` `${M[m] ?? varColor(C.muted)}18` `` e `` `${M[m] ?? varColor(C.muted)}44` `` | `alfa(M[m] ?? varColor(C.muted), "18")` / `"44"` | `METODOS_COLOR` (l. 2253) é hex literal; **só o fallback quebra** |

## 5. Critérios de aceite

1. Nenhuma ocorrência sobra: `grep -rE '\+\s*"[0-9a-fA-F]{2}"' src --include=*.jsx --include=*.js`
   e `grep -rE '\}[0-9a-fA-F]{2}`' src --include=*.jsx --include=*.js` não retornam
   nenhuma linha de estilo (o único resultado tolerado é o comentário-documentação em
   `colorAlfa.js:3` e os testes de NFC-e, que não são cor).
2. As 26 linhas da seção 4 usam `alfa(...)` com a **mesma cor** e o **mesmo sufixo hex**
   que tinham antes — nenhuma cor trocada, nenhum alfa arredondado "no olho".
3. Nenhum `varColor` sobra dentro de um argumento de `alfa()` quando a cor é um `C.x`
   direto (grupo 1 e 2 passam o **nome do token**, não `var(...)`) — o ramo de token do
   helper é o caminho pretendido, e é ele que segue o tema do tenant.
4. Nenhum arquivo ganha import novo (todos os 7 já importam `alfa`) e nenhum import de
   `varColor` fica órfão: se um arquivo deixar de usar `varColor`, o import sai junto.
5. Zero mudança fora das 26 linhas: o `git diff` não mostra nenhuma linha alterada que
   não esteja na tabela da seção 4 (`--stat` restrito aos 7 arquivos).
6. Nada de cor hardcodada introduzida — nenhum `#rrggbb` novo no diff (decisão 017).
7. Suíte verde: `npx vitest run` com o mesmo número de arquivos e testes de antes
   (194 arquivos / 3080 testes), e os 9 arquivos de teste do PDV rodados por nome
   (fluxo crítico tocado, exigência do `CLAUDE.md`).
8. Nenhum `console.log`, `TODO` sem justificativa ou comentário morto adicionado.

## 6. Edge cases conhecidos

- **A borda de foco em JS (`Sidebar:556`, `PDVView:2092`, `PDVView:2093`) falha
  diferente das outras.** Numa declaração `border` (atalho), o valor inválido em
  tempo de valor computado leva as longhands a `unset` → `border-style: none` → a
  borda **some**. Já em `style.borderColor = "..."` só a cor cai para `unset` →
  `currentColor` → a borda fica **da cor do texto**, não some. Os dois casos param de
  mostrar a cor pretendida; a correção é a mesma. O spec registra a diferença para o
  `/review` não cobrar o sintoma errado.
- **`METODOS_COLOR` (PDVView:2442) é hex literal** — hoje funciona para os 4 métodos
  conhecidos e só quebra no fallback `?? varColor(C.muted)` (método fora do catálogo).
  Depois da troca, o ramo literal do `alfa()` produz `color-mix` com a mesma opacidade
  para os 4 conhecidos: **a aparência deles não muda**. Não converter para token nesta
  rodada.
- **`ACTION_TYPE_META.caixa` e `COR_SEVERIDADE.warning` são `"#f59e0b"` literal** —
  mesma situação: passam pelo ramo literal, opacidade preservada, aparência igual.
- **Esta rodada muda a aparência de propósito** — é o inverso do contrato da rodada 13.
  Bordas que hoje somem (ou aparecem na cor do texto) voltam a aparecer na cor
  pretendida: senha errada em vermelho na `Sidebar`, campo preenchido/em foco em accent
  no PDV, método selecionado em verde, chip de log/severidade com fundo translúcido.
  Isso **não** é regressão; é o bug sendo corrigido.
- **Nenhum teste cobre cor computada** (o jsdom não computa CSS), então a suíte verde
  não prova a correção — ela só prova que nada quebrou. A prova do critério 2 é a
  leitura linha a linha do diff.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde com a mesma contagem de antes, o
`git diff` restrito às 26 linhas da seção 4, nenhuma cor ou opacidade alterada em
relação à intenção original, sem `TODO` pendente e sem `console.log` esquecido.

---

## 8. Resultado da review (2026-08-02)

**Aprovado sem ressalvas — 8 de 8 critérios em "sim".** Nenhuma rodada de correção
foi necessária.

Suíte: `npx vitest run` — **194 arquivos / 3080 testes, verde**, mesma contagem de
antes da mudança. Os 9 arquivos de teste do PDV rodaram dentro dela.

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | Nenhuma ocorrência sobra | ✅ sim | `grep -rE '\+\s*"[0-9a-fA-F]{2}"' src` não retorna nada. ``grep -rE '\}[0-9a-fA-F]{2}`' src`` retorna só 3 linhas não-cor: o comentário-documentação em `colorAlfa.js:3` e dois `expect` de chave de NFC-e em `nfceEventoCancelamento.test.js` (20, 40) |
| 2 | Mesma cor e mesmo sufixo em cada ponto | ✅ sim | Diff lido linha a linha: `red 88` → `alfa(C.red,"88")`, `accent 66` → `alfa(C.accent,"66")`, `green 55` → `alfa(C.green,"55")`, `(green\|red) 99` → `alfa(isPositive ? C.green : C.red,"99")`, e assim por diante nos 26. Nenhuma cor trocada, nenhum sufixo alterado |
| 3 | Grupos 1 e 2 passam nome de token, não `var(...)` | ✅ sim | Todos os 21 passam `C.x` direto ou uma variável que guarda `C.x` — `corSituacao` (`RelatorioView:215`) e `corDiferenca` (`FechamentoModal:116`) são `situacao === "falta" ? C.red : C.green` |
| 4 | Nenhum import novo, nenhum import órfão | ✅ sim | Os 7 arquivos já importavam `alfa`; nenhum import adicionado. `varColor` continua em uso pesado em todos: Sidebar 82, MesasAdmin 33, PDVView 157, RelatorioView 127, FechamentoModal 21, ConfiguracoesView 62, JarvasPanel 31 |
| 5 | Zero mudança fora das 26 linhas | ✅ sim | `git diff --stat`: 7 arquivos, **26 inserções e 26 remoções**, uma troca por linha da tabela da seção 4 |
| 6 | Nenhuma cor hardcodada nova | ✅ sim | `git diff -U0 \| grep '^+' \| grep -oE '#[0-9a-fA-F]{3,8}'` não retorna nada |
| 7 | Suíte verde com a mesma contagem | ✅ sim | 194/194 arquivos, 3080/3080 testes, 76.25s |
| 8 | Sem `console.log`, `TODO` ou comentário morto | ✅ sim | O único casamento do grep de `TODO` foi o substring dentro de `METODOS_COLOR` |

### O que esta rodada corrigiu no próprio registro do bug

O reporte da rodada 13 dizia **18 ocorrências em 6 arquivos**. O real é **26 linhas /
27 declarações em 7 arquivos**. O número curto veio de um grep ancorado em
`varColor(`, que não pega:

- os pontos em que o token chega por variável — `` `${tipo.color}18` `` e
  `` `${tipo.color}44` `` (`RelatorioView`, alimentados por `ACTION_TYPE_META`, onde 5
  dos 6 tipos guardam `varColor(C.x)`), `` `${cor}22` `` (`JarvasPanel`, `COR_SEVERIDADE`
  com `info` e `danger` em token) e `` `${color}18` `` (`ConfiguracoesView`, `ToggleChip`
  recebendo `color={varColor(C.accent)}` na linha 953);
- os pontos em que o `}` fecha um **ternário** e não a chamada — `PDVView:886`,
  `RelatorioView:1257`;
- `FechamentoModal:238`, que embrulha o ternário em parênteses antes de concatenar.

`docs/09_BACKLOG/bugs.md` e `memory/bugs.md` foram atualizados com o inventário certo.

### Nota sobre `METODOS_COLOR` (PDVView:2442)

`METODOS_COLOR` guarda hex literal para os 4 métodos conhecidos, então só o fallback
`?? varColor(C.muted)` estava quebrado. Depois da troca, os 4 conhecidos passam pelo
ramo literal do `alfa()` e renderizam a **mesma** opacidade de antes; o fallback
passou a funcionar. O argumento ficou `alfa(METODOS_COLOR[metodo] ?? varColor(C.muted), "18")`
— manter o `varColor` aqui é intencional: a expressão precisa continuar servindo
também à propriedade `color` da mesma linha, e o ramo literal do helper produz string
byte a byte idêntica à do ramo de token.

### Fora de escopo, para uma próxima rodada

- **Os mapas de cor guardam `varColor(C.x)` em vez do nome do token.**
  `ACTION_TYPE_META` (`RelatorioView:37-46`), `COR_SEVERIDADE` (`JarvasPanel:20`),
  `ROLE_MAP` e `METODOS_COLOR` (`PDVView:2253`) misturam token resolvido e hex
  literal. Funciona, mas obriga todo consumidor a saber por qual ramo do `alfa()` a
  cor vai passar, e foi exatamente isso que escondeu 7 declarações do inventário.
  Guardar o nome do token (`C.blue`) e resolver na hora de usar deixaria o idioma
  único. Não feito aqui porque muda a interface de 4 mapas e vários consumidores.
- **`METODOS_COLOR` e `ACTION_TYPE_META.caixa` são hex de marca cravados no código**
  (`#10b981`, `#3b82f6`, `#8b5cf6`, `#f59e0b`) — cor fixa que não segue o tema do
  tenant. Roça a decisão 017 (white-label). Precisa de token novo em
  `TOKENS_PERMITIDOS`, o que é decisão de design e está fora desta correção.
