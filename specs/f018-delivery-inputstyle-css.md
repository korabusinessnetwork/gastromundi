# F018 — fatia 7: matar o helper `inputStyle(sz)` do DeliveryView

Rodada 20 do ciclo. Data: 2026-08-02.

## 1. Escopo

Apagar a função `inputStyle(sz)` de `src/components/desktop/views/DeliveryView.jsx`
(linha 2821) e os seus **20 usos**, movendo as três declarações que ela devolve
(`border`, `background`, `color`) para a regra base `.delivery-view__input,
.delivery-view__textarea` que já existe em `DeliveryView.css`, e transformando cada
propriedade extra que acompanha o helper (largura, `flex`, `padding-left`,
`text-align`, `font-weight`) em modificador BEM.

## 2. Fora de escopo

- **A cadeia de props `sz`.** Depois desta fatia, `sz` sobra em 13 assinaturas de
  componente e só é desreferenciado em **5 lugares** (linhas 298, 382, 397, 852, 865
  — todos `padding` derivado de `sz.pad`). Matar a cadeia inteira é mexer em
  assinatura e em chamada de 13 componentes; é uma fatia própria, a da rodada 21.
  Nesta rodada `sz` fica onde está, mesmo virando prop morta em mais componentes
  (`CardPedido`, na linha 664, já recebe `sz` sem usar hoje — dívida anterior).
- Os outros 124 `style={{` do arquivo que não passam pelo helper.
- `src/styles/inputs.css` — o baseline global fica intacto.
- Qualquer outro arquivo do projeto.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — separar CSS do JSX, "Em andamento".
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — `.css` puro co-localizado, cor sempre por token
  `--gm-*`, nunca hex literal.
- **Decisão 017 (white-label)** — nada de cor de cliente cravada; as três
  declarações movidas já são `var(--gm-input-border)`, `var(--gm-input-bg)` e
  `var(--gm-text)`, derivados da marca do tenant em `tema.css`.
- Continuação direta da rodada 19, que declarou este helper fora de escopo por ter
  usos espalhados pelo arquivo todo — "matá-lo pela metade deixa o arquivo em dois
  estados".

## 4. Arquivos afetados

| Arquivo | O quê |
|---|---|
| `src/components/desktop/views/DeliveryView.jsx` | remove a função e os 20 atributos `style` que a chamam; adiciona classes modificadoras |
| `src/components/desktop/views/DeliveryView.css` | três declarações na regra base + oito modificadores |

Nenhum outro arquivo. `grep -rl "delivery-view__" src` devolve só o `.jsx` e o
`.css`, então não há vazamento possível para fora do par.

## 5. Critérios de aceite

Cada alvo carrega o comando de medição **idêntico nas duas pontas** (regra aprendida
na rodada 19, quando "49 → 8" comparou dois padrões diferentes).

1. `grep -c "inputStyle" src/components/desktop/views/DeliveryView.jsx` sai de
   **21 → 0**. A função e todas as chamadas desaparecem.
2. `grep -c "style={{" src/components/desktop/views/DeliveryView.jsx` sai de
   **137 → 124** (os 13 usos no formato `style={{ ...inputStyle(sz), … }}`).
3. `grep -c "style={inputStyle" src/components/desktop/views/DeliveryView.jsx` sai de
   **7 → 0**.
4. `grep -ro 'style={{' src --include=*.jsx | wc -l` sai de **1762 → 1749**, e o
   número de arquivos segue **46** (nenhum arquivo zera nesta fatia).
5. A regra `.delivery-view__input, .delivery-view__textarea` do `DeliveryView.css`
   passa a declarar exatamente `border: 1.5px solid var(--gm-input-border)`,
   `background: var(--gm-input-bg)` e `color: var(--gm-text)` — os mesmos valores que
   o helper devolvia, com a **borda de 1.5px preservada** (o baseline global de
   `inputs.css` usa 1px; se a espessura cair para 1px é regressão visual).
6. Nenhuma cor literal (`#`, `rgb(`, `rgba(`) entra no CSS novo; toda cor sai de
   token `--gm-*`.
7. Cada propriedade extra que hoje acompanha o spread vira modificador BEM com o
   mesmo valor computado:

   | Linha hoje | Extra inline | Vira |
   |---|---|---|
   | 1254 | `textAlign: "center"` | `--centro` |
   | 1631, 2667 | `width: "100%"` | **nada** — a regra base já tem `width: 100%` |
   | 1706, 2352 | `width: "100%"`, `paddingLeft: 32` | `--com-icone` (`padding-left: 32px`) |
   | 2030 | `flex: 1`, `minWidth: 160`, `fontWeight: 700` | `--titulo` |
   | 2072 | `width: 56` | `--qtd` |
   | 2137 | `width: 96` | `--preco` |
   | 2799, 2801 | `flex: "1 1 160px"` | `--faixa` |
   | 2804, 2805 | `flex: "1 1 120px"` | `--faixa-cep` |
   | 2808 | `width: 110` | `--taxa` |

8. Os modificadores de largura vêm **depois** da regra base no arquivo. Base e
   modificador têm a mesma especificidade (0,1,0); quem vence é a ordem, e o
   `width: 100%` da base precisa perder para os `56px`/`96px`/`110px`.
9. Nenhum elemento que hoje não recebia essas três declarações passa a receber:
   `grep -c "delivery-view__input\|delivery-view__textarea"` no `.jsx` devolve
   **20**, e os 20 usos do helper são exatamente esses 20 elementos — usuário fora
   da fatia não existe. A conferência é feita lendo o disco, não de memória.
10. `npx vitest run` verde.
11. `npx vite build` conclui — único passo que prova que o CSS escrito à mão compila
    e que o JSX ainda parseia.
12. O markup permanece idêntico ignorando `style` e `className`: nenhum elemento
    somado, removido, reordenado, nenhum handler ou atributo alterado. Verificado
    com o normalizador por contagem de chaves (`/tmp/norm.js`), não por regex —
    regex não normaliza atributo JSX multi-linha nem template literal com `}`.
13. Sem `console.log`, sem `TODO` sem justificativa, sem segredo, sem arquivo fora
    dos dois listados.

## 6. Edge cases conhecidos

- **Foco vira accent — mudança visual deliberada e única.** Hoje o `border` inline
  (especificidade máxima) bloqueia a regra
  `input:not([aria-invalid="true"]):focus { border-color: var(--gm-accent) }` de
  `inputs.css`; esses 20 campos são os únicos do sistema que **não** acendem no
  foco. Ao virar classe, a regra global passa a vencer e eles acendem como todo o
  resto. É exatamente o que o cabeçalho do `inputs.css` prevê: "Esses poucos são
  migrados nos próprios componentes". Aceitar e registrar — é convergência com o
  sistema, não regressão. Nenhuma outra diferença visual é aceitável.
- **`width: 100%` da base convivendo com `flex: 1 1 160px`.** Já é o estado atual
  (a classe sempre teve `width: 100%`; o inline nunca definiu `width` nesses cinco
  campos), então mover o `flex` para modificador não muda nada: em eixo principal, o
  `flex-basis` manda.
- **`box-sizing: border-box`** já está na base, então `width: 56px` no modificador
  mede o mesmo total que o `width: 56` inline media.
- **`--titulo` carrega posição junto com aparência** (`flex`, `min-width` e
  `font-weight`). É o único caso e tem um usuário só; se ganhar um segundo usuário
  numa rodada futura, separar papel de posição — o padrão registrado na rodada 19.
- **`type="number"`** nos campos 1250, 2072, 2137, 2611, 2615, 2799, 2808: o
  baseline global exclui `checkbox`/`radio`/`range`/`color` do fundo, mas **não**
  exclui `number`. Continuam recebendo fundo e anel como hoje.
- **Campos `disabled`** (2072, 2030, 2611, 2615): `opacity: 0.6` vem do global e não
  é tocado.

## 7. Definição de "aprovado sem ressalvas"

Todos os 13 critérios em sim com evidência de arquivo e linha lida do disco,
`npx vitest run` verde, `npx vite build` concluído, markup idêntico pelo
normalizador, e a única diferença visual do sistema sendo a borda de foco em accent
descrita na seção 6.

## 8. Resultado da review (2026-08-02)

**Aprovado sem ressalvas — 13 de 13 critérios em sim, nenhuma rodada de correção.**

- `npx vitest run` — 194 arquivos, 3080 testes, todos passando (76.23s).
- `npx vite build` — concluído em 10.90s, PWA gerado com 52 entradas.

| # | Critério | Evidência lida do disco |
|---|---|---|
| 1 | `inputStyle` 21 → 0 | `grep -c "inputStyle" DeliveryView.jsx` → **0**; o arquivo agora termina em `}` na última função de componente, sem o helper |
| 2 | `style={{` 137 → 124 | `grep -c "style={{" DeliveryView.jsx` → **124** |
| 3 | `style={inputStyle` 7 → 0 | `grep -c "style={inputStyle" DeliveryView.jsx` → **0** |
| 4 | projeto 1762 → 1749, 46 arquivos | `grep -ro 'style={{' src --include=*.jsx \| wc -l` → **1749**; `grep -rl` → **46** |
| 5 | três declarações na base, borda 1.5px | `DeliveryView.css:535-538` — `border: 1.5px solid var(--gm-input-border)`, `background: var(--gm-input-bg)`, `color: var(--gm-text)` |
| 6 | nenhuma cor literal | `git diff` do `.css` filtrado por `#`/`rgb(`/`rgba(` nas linhas adicionadas → nenhuma |
| 7 | extras viraram modificador | 8 modificadores usados no `.jsx` (1254, 1703, 2026, 2068, 2133, 2347, 2793, 2795, 2798, 2799, 2802), 8 definidos no `.css` (550-562), correspondência exata; os dois `width: "100%"` de 1631 e 2667 sumiram sem modificador porque a base já os tinha |
| 8 | modificadores depois da base | base em `DeliveryView.css:530-541`, modificadores em `550-562` |
| 9 | nenhum usuário fora da fatia | `grep -c "delivery-view__input\|delivery-view__textarea"` → **20**, os mesmos 20 do helper; `grep -rl "delivery-view__" src` devolve só o `.jsx` e o `.css` |
| 10 | suíte verde | 3080 testes passando |
| 11 | build conclui | 10.90s |
| 12 | markup idêntico | normalizador por contagem de chaves: prefixo idêntico até o offset 76127 de 76127 — o arquivo novo **termina exatamente** onde os dois divergem, e o resto exclusivo do HEAD é literalmente o corpo de `inputStyle` |
| 13 | sem sujeira, sem arquivo extra | `git status` → só `DeliveryView.css`, `DeliveryView.jsx` e este spec; nenhum `console.log`/`TODO`/`FIXME` nas linhas adicionadas |

### O que ficou para a próxima rodada

A cadeia de props `sz`. Depois desta fatia ela sobrevive em 13 assinaturas de
componente e é desreferenciada em **5 lugares apenas** — 298, 382, 397 (padding do
header, das abas e da área) e 852, 865 (os dois `style` que a rodada 19 deixou de
pé). `CardPedido` (linha 664) já recebe `sz` sem usar desde antes desta rodada.
Converter os 5 `sz.pad` em CSS e apagar a prop de ponta a ponta é a fatia 8.
