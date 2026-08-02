# F018 — PDV, fatia 1: estados de bloqueio e cabeçalho (rodada 13)

## 1. Escopo

Mover as declarações **estáticas** de estilo do trecho de abertura do
`PDVView` — tela de carregamento, tela "Caixa Fechado" e toda a barra de
cabeçalho (linhas ~761 a ~1104 de `src/components/desktop/views/PDVView/index.jsx`)
— dos `style={{ }}` inline para `PDVView.css`, incluindo os efeitos de
**hover e foco hoje escritos em JavaScript**, sem nenhuma mudança visual ou
de comportamento.

O trecho tem hoje **33 `style={{ }}` e 16 handlers** (`onMouseEnter`,
`onMouseLeave`, `onFocus`, `onBlur`) que só mexem em `e.currentTarget.style`.

## 2. Fora de escopo

- **Tudo abaixo da linha 1104**: alertas de estoque/validade, abas
  Mapa/Lista/Comandas, busca, grade de produtos, carrinho, checkout,
  modais e o SaldoModal. São ~214 dos 247 inline styles do arquivo e
  entram em fatias seguintes.
- **Os componentes irmãos** da pasta (`CartPanel`, `ProductGrid`,
  `ComandaGrid`, `MesaMapView`, `CheckoutView`, …) — cada um tem seu
  próprio `.css` e sua própria fatia.
- **O sistema `sz.*` de padding/gap/grid.** O cabeçalho do próprio
  `PDVView.css` já registra a divisão: tamanho de fonte veio para o CSS,
  mas espaçamento continua vindo do JS por breakpoint. Esta rodada não
  mexe nisso.
- **Converter valor condicional em classe modificadora.** Onde a cor
  depende de estado (`barcodeInputOpen`, `caixaAberto`, `selected?.cliente_id`,
  `toast`, `barcodeFeedback`), o valor **continua inline** nesta rodada;
  só a parte estática da mesma regra desce para o CSS. Vira fatia própria.
- **Consequência direta da linha acima:** o hover do botão **Cliente**
  (linha 1034) é condicional — só acontece quando não há cliente vinculado.
  Convertê-lo exige a classe modificadora que está fora de escopo, então
  ele **permanece em JavaScript** nesta rodada, sozinho. Os outros 15
  handlers saem.
- **Criar token novo de tema.** `TOKENS_PERMITIDOS` (`src/lib/tema.js`) é
  uma allow-list fechada e não tem token para texto sobre a cor da marca.
  Onde o código hoje escreve `color: "#fff"` sobre `--gm-accent`
  (linhas 907 e 987), o literal é preservado com comentário, exatamente
  como já fazem `vitrine.css:462` e `KLogo.css:20`. A proposta do token
  `--gm-sobre-accent` segue pendente com o dono (rodada 12).
- Nenhum arquivo de teste é alterado.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`, prioridade 🟠 Alta, "Em andamento").
  A dívida medida é de **2068 `style={{` em 46 arquivos**; `PDVView/index.jsx`
  é o maior deles com 247.
- **Decisão 018** — CSS separado do JSX.
- **Decisão 023 / ADR-007** — `.css` puro co-localizado, cor sempre via
  CSS Custom Property `--gm-*`, blend com alfa via `color-mix`.
- **Decisão 017** (white-label) — nenhuma cor de cliente cravada; tudo
  resolve em runtime pelo tema do tenant.
- Continua a **leva anterior do F018** no mesmo arquivo, que migrou só
  `font-size`/`line-height`. As classes-alvo **já existem** no
  `PDVView.css` e **já estão penduradas** no JSX; esta fatia preenche
  essas mesmas classes com o resto.

## 4. Arquivos afetados

| Arquivo | O quê |
|---|---|
| `src/components/desktop/views/PDVView/PDVView.css` | Modificado — recebe as declarações estáticas e as regras `:hover` / `:focus`. Uma classe nova só quando o elemento não tiver nenhuma. |
| `src/components/desktop/views/PDVView/index.jsx` | Modificado — linhas ~761 a ~1104: `style={{ }}` enxutos, handlers de estilo removidos, `className` novo onde faltar. |

Nenhum arquivo novo: o `import "./PDVView.css"` já está na linha 24.

## 5. Critérios de aceite

1. Todo `style={{ }}` que sobra no trecho 761–1104 contém **pelo menos um
   valor dependente de runtime** (`sz.*`, `isCel`, ternário, estado). Um
   `style={{ }}` composto só de literais é critério não atendido.
2. Nenhum `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` **incondicional**
   que só escreve em `e.currentTarget.style` sobrevive no trecho — todos
   viraram `:hover` / `:focus` no CSS. Única exceção permitida e já
   justificada: o hover condicional do botão Cliente (linha 1034).
3. Toda cor no CSS novo sai de `var(--gm-*)` ou de
   `color-mix(in srgb, var(--gm-*) N%, transparent)`. Nenhum hex novo,
   com a única exceção do `#fff` sobre `--gm-accent`, que precisa de
   comentário ao lado apontando o motivo.
4. Cada `alfa(C.x, "NN")` convertido para CSS produz a **mesma
   porcentagem** que a função produziria: `Math.round(parseInt("NN",16)/255*100)`.
   Conferível caso a caso.
5. As classes preexistentes do `PDVView.css` **mantêm** suas regras de
   `font-size`/`line-height` — a fatia acrescenta, não substitui.
6. Nenhuma classe nova quebra o padrão de nomenclatura do arquivo:
   `.pdv__<elemento>` e `.pdv__<elemento>--<modificador>`.
7. Nenhuma linha fora do intervalo 761–1104 do `index.jsx` é modificada,
   e nenhum outro arquivo de `src/` é tocado além dos dois da tabela.
8. `npx vitest run` verde, com os **nove** arquivos de teste do PDV
   passando: `PDVView.smoke`, `PDVView.totais`, `PDVView.transferir`,
   `ComandaGrid`, `ImpressaoAcoes`, `MesaMapView`, `ModalCpfNota`,
   `useCancelarComanda`, `useFinalizarPagamento`.
9. Nenhum `console.log`, nenhum `TODO` sem justificativa escrita ao lado.
10. Mudança visual zero: para cada declaração movida, o valor computado
    final é idêntico ao de antes (mesma cor, mesma medida, mesma transição).

## 6. Edge cases conhecidos

- **Especificidade.** Diferente da rodada 12 (delivery), aqui não há
  concorrência: `.pdv__*` só é definida em `PDVView.css` e só é usada no
  `index.jsx` — verificado por busca em todo o `src/`. Seletor de uma
  classe basta. Mas duas armadilhas continuam valendo: (a) regra global
  com `!important` em `button`/`input` passaria a vencer assim que o
  inline sair — conferir antes; (b) base e modificador com a mesma
  especificidade dependem da ordem dentro do arquivo, então o modificador
  vem depois da base.
- **`fontFamily: "inherit"`** aparece em vários botões/inputs porque o
  navegador não herda fonte em controles de formulário. Precisa continuar
  existindo depois da migração, senão o texto do botão muda de fonte.
- **Shorthand que zera lado.** Ao escrever `padding`/`margin` no CSS,
  reproduzir exatamente os quatro lados que o inline definia.
- **`transition: "all 0.15s"`** no botão Scanner é mais largo que os
  `transition: "background 0.15s, color 0.15s"` dos demais. Copiar como
  está; unificar seria mudança visual.
- **Hover que hoje é JS não tem `:hover` equivalente no toque.** No PDV
  em tablet o `onMouseEnter` já não dispara; a regra CSS `:hover` também
  não. Comportamento equivalente, sem regressão — mas a conversão não
  pode introduzir `:active` ou `:focus-visible` que antes não existiam.
- **Botão desabilitado.** "Nova Comanda" alterna `background` e `cursor`
  por `caixaAberto`. Como conversão para modificador está fora de escopo,
  esses dois continuam inline; o resto da regra desce.
- **Toast.** `opacity` e `transform` dependem de `toast` e ficam inline; a
  `transition` que os anima é estática e desce para o CSS — se ela ficar
  para trás, o toast passa a aparecer sem animação.

## 7. Definição de "aprovado sem ressalvas"

Todos os dez critérios em **sim**, `npx vitest run` verde com os nove
testes do PDV passando, sem `TODO` pendente, sem `console.log` esquecido
e sem nenhuma diferença visual entre antes e depois no cabeçalho, na tela
de carregamento e na tela de caixa fechado.

---

## 8. Resultado da review (2026-08-02)

`npx vitest run` — **194 de 194 arquivos, 3080 de 3080 testes**, verde. Os nove
arquivos de teste do PDV rodados também isolados: **9 arquivos, 88 testes**,
verde. Nenhum arquivo de teste foi alterado.

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | Todo `style={{ }}` restante tem valor de runtime | **sim** | Sobraram 15 no trecho, cada um com `sz.*`, `isCel`, `toast`, `caixaAberto`, `barcodeFeedback`, `barcodeInputOpen`, `barcodeValue` ou `selected?.cliente_id` — `index.jsx:794, 810, 815, 834, 846, 849, 861, 883, 897, 924, 941, 952, 972, 979, 988` |
| 2 | Nenhum handler de estilo incondicional sobrevive | **sim** | Sobrou só o par condicional do botão Cliente (`index.jsx:958-959`), a exceção que o §2 já previa. Os outros 15 viraram `:hover`/`:focus` |
| 3 | Cor sempre por `var(--gm-*)` / `color-mix` | **sim** | Único literal é `#fff` sobre a marca, nos três pontos com comentário: `PDVView.css:146-152`, `:245`, `:420` |
| 4 | Porcentagem de alfa idêntica à que `alfa()` produziria | **sim** | `1a`→10% (`.pdv__lock-icone`), `18`→9% e `44`→27% (`.pdv__toast`), `55`→33% e `0f`→6% (cancelar), `22`→13% e `1e`→12% (os dois hovers). Todas conferem com `Math.round(parseInt(NN,16)/255*100)` |
| 5 | Classes preexistentes mantêm `font-size`/`line-height` | **parcial — desvio documentado** | Todas mantêm, menos `.pdv__lock-desc` (`PDVView.css:79-86`): o `line-height` foi fixado em `1.6`, o valor inline que vencia a classe e é o que a tela mostra hoje. Escrever `var(--lh-base)` (1.5) cumpriria o critério 5 e violaria o 10. Prevaleceu o 10, que o §7 repete como condição dura. Ver "decisão pendente" abaixo |
| 6 | Nomenclatura `.pdv__elemento--modificador` | **sim** | Classes novas: `.pdv__lock*`, `.pdv__raiz`, `.pdv__header-*`, `.pdv__subtitulo-mesa`, `.pdv__acoes-pedido`, `.pdv__acao-btn--*`, `.pdv__barcode-*` |
| 7 | Nada fora do intervalo, nenhum outro arquivo de `src/` | **sim** | `git diff` toca dois arquivos; os hunks do `index.jsx` vão de 766 a 1094, todos dentro de 761–1104 |
| 8 | Suíte verde com os nove testes do PDV | **sim** | Acima |
| 9 | Sem `console.log`, sem `TODO` órfão | **sim** | Busca no trecho: nenhuma ocorrência |
| 10 | Mudança visual zero | **sim** | Conferido declaração a declaração contra as 142 linhas removidas do JSX. Duas notas abaixo |

### Notas do critério 10

- **`.pdv__saldo-btn:hover` perdeu a borda de propósito** (`PDVView.css:188-195`).
  O hover em JavaScript montava `varColor(C.accent) + "66"` → `var(--gm-accent)66`,
  CSS inválido que o navegador descarta. Traduzir para `color-mix(… 40%, transparent)`
  faria a borda **aparecer** — mudança visual, justamente o que o critério proíbe. Ficou
  documentada e não traduzida.
- **O toast flutuante do celular não muda** (`index.jsx:1160`), apesar de `.pdv__toast`
  ter ganhado cor e caixa: ele declara inline todas essas propriedades (inclusive um
  fundo opaco proposital, diferente do translúcido do cabeçalho), e `pointer-events` /
  `transition` já vinham do próprio `--flutuante`, que no arquivo vem depois da base.
- **O foco do campo de código de barras trocou de dono, não de aparência**
  (`PDVView.css:393-409`): saiu do `onFocus`/`onBlur` e passou para
  `src/styles/inputs.css`, que já pinta borda accent no foco com especificidade maior
  que a classe. Fundo e borda de repouso continuam com os mesmos tokens.

### Achado fora do escopo (registrado, não corrigido)

O `var(--gm-*)` + sufixo hex do `.pdv__saldo-btn` não era caso isolado: **18 ocorrências
em 6 arquivos** montam cor inválida do mesmo jeito, e o efeito é a borda sumir em vez de
mudar de cor — inclusive a borda vermelha de senha errada na `Sidebar`. Registrado como
`BUG001` em `docs/09_BACKLOG/bugs.md`, em `memory/bugs.md` e como padrão em
`memory/patterns.md`. Corrigir está fora do §2 desta rodada.

### Decisão pendente do dono (não bloqueia)

`.pdv__lock-desc` ficou com `line-height: 1.6` para não mexer na altura do parágrafo da
tela "Caixa Fechado". A escala do design system pede `var(--lh-base)` (1.5). Alinhar é
uma linha de CSS e muda um pouco a altura desse texto — é decisão de design, não de
refatoração.
