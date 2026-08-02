# F018 — fatia 11: os primitivos e o modal de fechamento do Relatório saem do inline

> Rodada 24 do ciclo. Primeira fatia do `relatorio/RelatorioView.jsx`, o maior arquivo
> que sobrou no F018 (202 inline em 1671 linhas).

## 1. Escopo

Trocar os **46 `style={{}}` das linhas 1 a 384** de `relatorio/RelatorioView.jsx` por regras em
`RelatorioView.css`. São duas coisas, e as duas ficam antes do componente principal:

- os **seis componentes-primitiva** que o resto do arquivo consome dezenas de vezes — `KpiCard`
  (12 usos), `Th` (44), `Td` (44), `Empty` (11), `ChipBtn` (2) e `ExportBar` (5);
- o **`FechamentoDetalheModal`** inteiro (linhas 205–381), incluindo o cabeçalho, a tabela por
  método de pagamento, a observação e o quadro de resumo com a diferença de caixa.

Ao fim da fatia, `style={{}}` no arquivo cai de **202 para 159**, e no trecho 1–384 sobram
exatamente **3**, os três carregando valor que só existe em runtime (critério 2).

## 2. Fora de escopo

- **O componente `RelatorioView` (linhas 385–1671)** e seus ~156 inline. É o corpo da tela, com seis
  abas; sai em fatias próprias, do mesmo jeito que o `PDVView/index.jsx` e o `DeliveryView.jsx`.
- **A cadeia de props `sz`.** Quatro dos seis primitivos (`Td`, `Empty`, `ChipBtn`, `ExportBar`)
  declaram `sz` e **não usam**, e o arquivo tem 74 `sz={sz}`. Limpar isso é fatia própria (é o que a
  rodada 21 fez no `DeliveryView.jsx`), porque os pontos de chamada estão todos fora deste trecho.
  Aqui as assinaturas ficam **como estão** — remover o parâmetro sem remover os 74 argumentos seria
  meia limpeza.
- **Criar `--gm-pad-sm`.** O `KpiCard` é o único primitivo que usa `sz` de verdade
  (`padding: ${sz.padSm + 4}px ${sz.pad - 4}px`). `--gm-pad` já existe desde a rodada 21, mas
  `padSm` não tem token, e criar um mexe em `src/styles/tema.css`, que vale para todas as telas.
  Fica para a fatia do `sz`.
- **`DesempenhoReport.jsx`** (47 inline) e os quatro relatórios de 13 linhas. Arquivos diferentes.
- **Redesenho.** Nenhum espaçamento, cor, tamanho ou ordem muda de valor.
- **Refatorar lógica.** Nenhum handler, cálculo, consulta ou texto de tela muda. `esperadoEmCaixa`,
  `diferencaCaixa` e `situacaoCaixa` continuam sendo a conta única de `@/lib/caixa`.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — "separar CSS do JSX", 🟠 alta.
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — `.css` co-localizado, cor sempre por token `--gm-*`, mistura por
  `color-mix`, nunca hex com sufixo de alfa.
- **Decisão 017 (white-label)** — nenhuma cor de cliente cravada.
- Continuação direta da rodada 23 (fatia 10), commit `85ed313`, que fechou o `DeliveryView.jsx`.

## 4. Arquivos afetados

| Arquivo | O quê |
|---|---|
| `src/components/desktop/views/relatorio/RelatorioView.jsx` | remove os 46 `style={{}}` das linhas 1–384 e aplica as classes |
| `src/components/desktop/views/relatorio/RelatorioView.css` | ganha as regras estruturais dos primitivos e do modal, e o cabeçalho do arquivo é corrigido |

Nenhuma migration, nenhuma tabela, nenhum dado novo — logo, nada de RLS, tenant, dinheiro ou consulta
a especificar nesta rodada.

## 5. Critérios de aceite

1. `sed -n '1,384p' RelatorioView.jsx | grep -c 'style={{'` retorna **3**, e
   `grep -c 'style={{' RelatorioView.jsx` no arquivo inteiro retorna **159** (era 202).

2. **Os 3 que sobram carregam valor de runtime** e não podem virar CSS estático. Os três seguem o
   mesmo desenho: entram como custom property no elemento, e o CSS lê:
   - `KpiCard` — `--kpi-pad-y`/`--kpi-pad-x`, que dependem de `sz.padSm`/`sz.pad` (a cadeia `sz`
     está fora de escopo), e `--kpi-cor`, a cor do número escolhida por quem chama;
   - `Td` — `--td-cor`, definida **só** quando quem chama passa `color` (a cor do tipo de log, que
     vem de `tipoLog()`); sem ela vale o texto padrão, ou o apagado quando `muted`;
   - `FechamentoDetalheModal` — `--cor-situacao` no quadro de diferença de caixa.

3. **A cor da diferença de caixa vira custom property local** (padrão da rodada 18, registrado em
   `memory/patterns.md` → "Cor calculada em runtime: custom property local no ancestral").
   `corSituacao` é escolhida em JavaScript (`C.red` quando falta, `C.green` quando bate ou sobra) e
   hoje aparece **três vezes** no mesmo bloco: dois `alfa()` e um `varColor()`. Passa a entrar
   **uma vez** como `--cor-situacao` no contêiner, e fundo, borda e valor leem `var(--cor-situacao)`
   pelo CSS.

4. **Nenhuma cor literal nova**, exceto `#fff` sobre a cor cheia do tenant (convenção do arquivo) e
   o `rgba(0, 0, 0, 0.75)` do scrim do modal, que é o mesmo valor de `AdminView.css:59` e
   `ClientesView.css:161` — overlay é preto, não cor de marca. Toda chamada `varColor(C.x)` vira
   `var(--gm-x)`, `var(${C.border})` vira `var(--gm-border)`, e cada `alfa(C.x, "hh")` vira
   `color-mix(in srgb, var(--gm-x) P%, transparent)` com esta conversão exata:

   | chamada no JSX | vira |
   |---|---|
   | `alfa(C.accent, "0c")` | `color-mix(in srgb, var(--gm-accent) 5%, transparent)` |
   | `alfa(C.accent, "18")` | `color-mix(in srgb, var(--gm-accent) 9%, transparent)` |
   | `alfa(C.accent, "33")` | `color-mix(in srgb, var(--gm-accent) 20%, transparent)` |
   | `alfa(C.accent, "44")` | `color-mix(in srgb, var(--gm-accent) 27%, transparent)` |
   | `alfa(corSituacao, "14")` | `color-mix(in srgb, var(--cor-situacao) 8%, transparent)` |
   | `alfa(corSituacao, "55")` | `color-mix(in srgb, var(--cor-situacao) 33%, transparent)` |

   São as 6 chamadas de `alfa()` do trecho. As outras 7 do arquivo estão fora da fatia e ficam.

5. **O `#f59e0b` cravado sai.** `ACTION_TYPE_META.caixa.color` (linha 38) é o único hex literal do
   arquivo e está no meio de quatro irmãos que já usam token. Vira `varColor(C.warn)` —
   `--gm-warn` existe em `src/constants/colors.js:24` e é sobreponível pelo tenant (decisão 017).
   É a mesma correção que a rodada 17 fez nas faixas de alerta do PDV.

6. **O cabeçalho do `.css` deixa de mentir.** Ele hoje declara, em letras maiúsculas, que "Cor,
   font-weight, padding, gap, border PERMANECEM inline no JSX" (linha 13) — o arquivo era uma
   migração só de tipografia. Depois desta fatia isso é falso para os primitivos e para o modal, e o
   comentário tem que dizer o que passou a valer, e o que ainda não valeu (o corpo da view).

7. **A tipografia já migrada não é duplicada nem movida.** As 9 classes que já existem no `.css`
   (`__kpi-label`, `__kpi-valor`, `__th`, `__td`, `__empty-icon`, `__empty-msg`, `__chip`,
   `__export-btn` e as 12 do modal) recebem as declarações estruturais **na mesma regra** ou em
   regra própria, mas nenhum `font-size`/`line-height` é reescrito, e o
   `font-variant-numeric: tabular-nums` das colunas de dinheiro continua exatamente onde está.

8. **`Th` e `Td` alinham por modificador, não por ternário em `style`.** As duas recebem a prop
   `right` e hoje calculam `textAlign` dentro do objeto de estilo; passam a aplicar o modificador
   `--direita` quando `right` é verdadeiro. Idem para `muted` e `nowrap` no `Td`. A precedência
   original — `color ?? (muted ? muted : text)` — tem que continuar valendo: cor passada por quem
   chama ganha do `muted`.

9. **Toda regra nova é precedida de comentário que diz o papel dela na tela** — por que aquele valor
   existe, não a repetição do nome do seletor.

10. **Nada de nome genérico.** Os contêineres do modal ganham nome do que contêm
    (`__modal-overlay`, `__modal-caixa`, `__modal-header`, `__modal-metodo-linha`,
    `__modal-obs`, `__modal-resumo`, `__modal-dif`), nunca `__div1`, `__linha-flex` ou `__wrapper`.

11. **A migração é feita por script que conta antes de gravar** (padrão de `memory/patterns.md`):
    cada substituição declara quantas ocorrências espera, nada é escrito se qualquer contagem
    divergir, e divergência se resolve estreitando a âncora — nunca subindo o esperado. Vale
    especialmente aqui: o arquivo repete `display: "flex", justifyContent: "space-between"` em
    blocos parecidos dentro e fora do trecho.

12. **Ao final, conferir se algum helper ficou órfão** (aprendizado da rodada 23): se a contagem de
    `alfa(`, `varColor(` ou `getSizes` no arquivo cair a zero, o import correspondente é apagado.
    Nem o `vitest` nem o `vite build` reclamam de import não usado.

13. `npx vitest run` verde. `RelatorioView.test.jsx` (189 linhas) e `DesempenhoReport.test.jsx`
    existem e cobrem esta tela — a suíte prova que nenhum seletor usado por teste sumiu.

14. `npx vite build` verde, rodado **depois da última edição do `.css`**. É o único passo que compila
    o CSS escrito à mão. Avisos de `css-syntax-error` do minificador tropeçando em `*` e crase
    **dentro de comentário** são pré-existentes no repositório e não contam como falha.

15. Sem `console.log`, sem `TODO`, sem segredo, sem `select *`. `git diff --stat` mostra apenas
    `RelatorioView.jsx`, `RelatorioView.css` e os arquivos de registro do ciclo. A métrica global
    `grep -ro 'style={{' src --include=*.jsx | wc -l` cai de **1627 para 1584** (queda de exatamente
    43 — os 46 do trecho menos os 3 de runtime do critério 2).

## 6. Edge cases conhecidos

- **`f.conferidoPorMetodo` ausente** (fechamento antigo, anterior à conferência por método) esconde a
  tabela inteira e cai no `METODOS_DETALHE.map`. As classes da tabela precisam existir no `.css`
  mesmo quando esse render não acontece — regra sem usuário naquele render não é regra morta.
- **`f.observacao` vazia** esconde o bloco de observação. Mesma regra.
- **`f.fundo > 0`** acrescenta "(inclui fundo …)" dentro da linha do dinheiro, com peso de fonte
  diferente do rótulo ao lado. O `font-weight: 400` dessa nota é o que a separa visualmente do
  `600` do rótulo — não normalizar os dois.
- **Diferença exatamente zero** cai em `situacao === "conferido"`, que usa `C.green`, e o valor sai
  sem sinal. O `"+"` só aparece em `"sobra"`. O critério 3 não pode mudar isso.
- **`Empty` recebe `Icon` como string ou como componente** — o ramo da string usa
  `.relatorio-view__empty-icon`, que já existe; o ramo do componente renderiza `<Icon size={48} />`,
  com o tamanho em prop de JavaScript, que **não** vira CSS (é atributo do SVG, não estilo).
- **O modal é `createPortal` para `document.body`**, fora da árvore da view. Ele já carrega
  `fontFamily: "'Inter',system-ui,sans-serif"` inline **duas vezes** justamente por isso — a regra
  nova precisa manter a fonte no portal, senão ele herda a do `body`.

## 7. Definição de "aprovado sem ressalvas"

Todos os 15 critérios em **sim** com evidência de arquivo e linha, `npx vitest run` verde,
`npx vite build` verde rodado depois da última edição de CSS, nenhum `TODO` ou `console.log`
adicionado, e o trecho 1–384 do `RelatorioView.jsx` com exatamente **3** `style={{}}`, os três de
runtime e nomeados no critério 2.
