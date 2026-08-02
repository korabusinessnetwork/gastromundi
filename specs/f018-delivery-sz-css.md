# F018 — fatia 8: matar a cadeia de props `sz` do DeliveryView

Rodada 21 do ciclo. Data: 2026-08-02.

## 1. Escopo

Apagar a prop `sz` de ponta a ponta em
`src/components/desktop/views/DeliveryView.jsx` — as 13 assinaturas de componente
que a declaram, os pass-downs que a repassam e o `const sz = getSizes(width)` da
linha 153 — convertendo os **5 usos reais** (todos `sz.pad`) para o token CSS
`--gm-pad`, criado em `src/styles/tema.css`.

Com isso o `DeliveryView` deixa de dimensionar espaçamento em JavaScript e fecha o
último `style` estrutural do arquivo.

## 2. Fora de escopo

- **Os outros 119 `style={{` do arquivo.** Nenhum deles depende de `sz`: são cor por
  `varColor(C.*)`, `display/flex/gap` locais e larguras pontuais. Vão em fatias
  próprias.
- **Os outros 15 arquivos que chamam `getSizes`** (`Sidebar`, `AdminView`, `PDVView/*`,
  `RelatorioView`, `DesktopLayout`, `LoginPage`…). O token `--gm-pad` nasce nesta
  rodada e fica disponível para eles, mas nenhum é tocado aqui.
- **`src/constants/sizes.js`.** A função `getSizes` continua existindo e servindo os
  outros 15 arquivos. Só some quando o último consumidor sair — não é esta rodada.
- **As demais propriedades de `sz`** (`padSm`, `gap`, `sidebarWidth`, `cartWidth`,
  `comandaCardMin`, `productCardMin`, `gridCols`, `isMini`). O `DeliveryView` não usa
  nenhuma delas; criar token para todas agora é abstração para o futuro, que o
  `CLAUDE.md` proíbe.
- `src/styles/tipografia.css` e `src/styles/inputs.css` — intactos.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — separar CSS do JSX, "Em andamento".
  A fatia 8 é a que o spec da fatia 7 nomeou como próxima.
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — `.css` puro co-localizado; token global sobrescrevível
  pelo tenant em runtime.
- **Decisão 017 (white-label)** — `--gm-pad` entra na família `--gm-*`, então um
  estabelecimento pode afinar a densidade da tela como já afina cor e fonte.
- **Precedente direto:** `src/styles/tipografia.css` já fez exatamente esta migração
  para o tamanho de fonte. O cabeçalho dele diz, literalmente, que as telas "deixam de
  dimensionar fonte inline via `sz.*`" e que `clamp()` entrega a responsividade fluida
  "que antes era computada em JS por largura de tela". Esta fatia aplica a mesma
  decisão ao espaçamento — não inventa abordagem nova.

## 4. Arquivos afetados

| Arquivo | O quê |
|---|---|
| `src/styles/tema.css` | cria o token `--gm-pad` no `:root` + a exceção do breakpoint mini |
| `src/components/desktop/views/DeliveryView.jsx` | apaga `sz` (30 linhas), os 2 imports e os 5 `style` |
| `src/components/desktop/views/DeliveryView.css` | 3 regras existentes ganham `padding`; 1 modificador estrutural novo |
| `src/components/desktop/views/DeliveryView.test.jsx` | **só o comentário da linha 34**, que cita `sz` e fica mentindo |

Nenhum outro arquivo. O teste não muda de comportamento: o `vi.mock` de `@/utils/hooks`
espalha `importOriginal()`, então `useResponsive` já era real e continua real —
o `DeliveryView` é que para de chamá-lo.

## 5. Onde o token vai morar, e por quê no `tema.css`

`--gm-pad` entra no `:root` do `tema.css`, não em arquivo novo. Três razões:

1. O nome já existe no projeto com esse prefixo: `CozinhaView.css:109` escreve
   `margin: 0 var(--gm-pad, 16px)` — uma rodada anterior já assumiu que este token
   seria da família `--gm-*`. Hoje ele **não está definido em lugar nenhum** e aquela
   regra vive do fallback de 16px.
2. `tipografia.css` só existe porque a escala de fonte tem 9 tokens de tamanho, 9 de
   altura de linha e 3 de tracking. Aqui é **um** token.
3. Criar `espacamento.css` para uma declaração é a abstração-para-o-futuro que o
   `CLAUDE.md` proíbe. Quando `padSm` e `gap` migrarem e o bloco crescer, promovê-lo a
   arquivo próprio é um recorte mecânico — mais barato de fazer depois do que de
   desfazer agora.

## 6. A curva do `--gm-pad`

`getSizes(width).pad` hoje, por breakpoint:

| Largura | `pad` |
|---|---|
| < 360 (mini) | 12 |
| 360–767 (mobile) | 18 |
| 768–1023 (tablet) | 20 |
| 1024–1279 (sm) | 20 |
| 1280–1439 (md) | 24 |
| 1440–1919 (lg) | 28 |
| 1920–2559 (xl) | 32 |
| 2560–3839 (xxl) | 40 |
| ≥ 3840 (4K) | 48 |

Vira `clamp(12px, 14.9px + 0.86vw, 48px)`, a reta que passa exatamente pelos dois
extremos da curva (18px em 360, 48px em 3840). A conferência nos pontos intermediários:

| Largura | `getSizes` | `clamp` | Diferença |
|---|---|---|---|
| 768 | 20 | 21,5 | +1,5 |
| 1280 | 24 | 25,9 | +1,9 |
| 1440 | 28 | 27,3 | −0,7 |
| 1920 | 32 | 31,5 | −0,5 |
| 2560 | 40 | 37,0 | −3,0 |
| 3840 | 48 | 48,0 | 0 |

Aproximação aceita de propósito: é a mesma troca que a `tipografia.css` já fez, e o
ganho é o degrau sumir — hoje o padding salta 4px de uma vez quando a janela cruza
1280, o que faz a tela "pular" ao redimensionar.

**A única exceção é o mini.** Abaixo de 360px o `getSizes` cai de 18 para 12 — um
degrau de 33%, não um ponto da reta, e existe porque em celular muito pequeno cada
pixel de conteúdo conta. `clamp()` não reproduz degrau, então esse fica em uma
media query literal. É a única.

## 7. O mapeamento dos 5 usos

| Linha hoje | Inline | Vai para |
|---|---|---|
| 298 | `padding: ${sz.pad - 4}px ${sz.pad}px` | `.delivery-view__header { padding: calc(var(--gm-pad) - 4px) var(--gm-pad) }` |
| 382 | `padding: 0 ${sz.pad}px` | `.delivery-view__abas { padding: 0 var(--gm-pad) }` |
| 397 | `padding: sz.pad` | `.delivery-view__area { padding: var(--gm-pad) }` |
| 852 | `padding: 10px ${sz.pad}px` | modificador estrutural novo |
| 865 | `padding: 10px ${sz.pad}px` | o mesmo modificador |

**A armadilha das linhas 852 e 865, e por que o padding NÃO vai no modificador de
cor.** Elas são `.delivery-view__btn--importar` e `.delivery-view__btn--primario`.
Mas `--primario` tem **3 usuários** no arquivo (852 é `--importar`; 865 e 1364 são
`--primario`), e o botão "Salvar" da linha 1364 nunca teve esse padding: ele vive
dentro de `.delivery-view__modal-botoes > button`, que já declara `padding: 11px 0`.
Pendurar o padding em `--primario` mudaria um botão que não está nesta fatia.

Vai portanto para um modificador **estrutural** novo, `--acao-topo`, aplicado só em
852 e 865, ao lado das classes de cor que já estão lá. É a aplicação direta do padrão
"Modificador de cor não carrega espaçamento" registrado em `memory/patterns.md` na
rodada 19.

## 8. Critérios de aceite

Cada alvo carrega o comando de medição **idêntico nas duas pontas**.

1. `grep -c "\bsz\b" src/components/desktop/views/DeliveryView.jsx` sai de **30 → 0**.
2. `grep -c "getSizes" src/components/desktop/views/DeliveryView.jsx` sai de **2 → 0**
   (o import e a chamada) e `grep -c "useResponsive"` sai de **2 → 0**. O import
   `usePedidosDelivery`, que vinha do mesmo módulo `@/utils/hooks`, permanece.
3. `grep -c "style={{" src/components/desktop/views/DeliveryView.jsx` sai de
   **124 → 119** (os 5 usos de `sz.pad`).
4. `grep -ro 'style={{' src --include=*.jsx | wc -l` sai de **1749 → 1744**, e o número
   de arquivos segue **46**.
5. `grep -c -- "--gm-pad:" src/styles/tema.css` sai de **0 → 2** (a declaração base no
   `:root` e a exceção do mini na media query).
6. O token vale `clamp(12px, 14.9px + 0.86vw, 48px)` no `:root` e `12px` dentro de
   `@media (max-width: 359.98px)`. Nenhum outro breakpoint entra — os degraus
   intermediários viram a reta, conforme a seção 6.
7. As três regras de layout declaram o padding com o token, sem px cravado além do
   `- 4px` da linha 298: `.delivery-view__header`, `.delivery-view__abas` e
   `.delivery-view__area`.
8. O modificador `--acao-topo` existe no `.css`, é usado em **exatamente 2** lugares
   no `.jsx`, e **nenhum `padding` novo entra em `.delivery-view__btn--primario` nem
   em `--importar`**. Verificado lendo as duas regras no disco.
9. O botão da linha 1364 continua com o padding que já tinha
   (`.delivery-view__modal-botoes > button`, `11px 0`) — nenhuma regra nova alcança
   ele. Conferido listando os usuários da classe no disco, não de memória.
10. `grep -c "sz" src/components/desktop/views/DeliveryView.test.jsx` sai de **1 → 0**:
    o comentário da linha 34 passa a dizer a verdade (o hook segue real por causa do
    `importOriginal()`, não por causa de `sz`). Nenhuma outra linha do teste muda.
11. Nenhuma cor literal (`#`, `rgb(`, `rgba(`) entra no CSS novo.
12. `npx vitest run` verde.
13. `npx vite build` conclui — único passo que prova que o `clamp()` escrito à mão
    compila e que o JSX ainda parseia depois de mexer em 13 assinaturas.
14. O markup permanece idêntico ignorando `style` e `className`: nenhum elemento
    somado, removido ou reordenado, nenhum handler alterado. Verificado com o
    normalizador por contagem de chaves. **Atenção:** como a fatia apaga props de
    assinatura, a saída esperada **não** é "DIFF VAZIO" — é a divergência exata das
    assinaturas e dos pass-downs, provada linha a linha (aprendizado da rodada 20).
15. Sem `console.log`, sem `TODO` sem justificativa, sem segredo, sem arquivo fora
    dos quatro listados.

## 9. Edge cases conhecidos

- **`CozinhaView.css:109` muda de comportamento — efeito declarado, não acidente.**
  A regra `.cozinha-view__erro { margin: 0 var(--gm-pad, 16px) }` hoje cai no fallback
  de 16px porque o token nunca existiu. A partir desta rodada ela passa a resolver o
  token e a faixa de erro da Cozinha ganha margem responsiva — que é exatamente o que
  quem escreveu aquela linha quis. É a única tela fora do Delivery afetada, e a
  mudança é de 16px fixo para 12–48px conforme a janela. Aceitar e registrar.
- **`window.innerWidth` vs. viewport da media query.** O `getSizes` lia
  `window.innerWidth` (que inclui a barra de rolagem); `vw` e `@media` medem o
  viewport. A diferença é a largura da barra (~15px) e só aparece na vizinhança de um
  breakpoint. Em padding isso é sub-pixel de consequência — não é regressão.
- **`calc(var(--gm-pad) - 4px)` no header.** Reproduz o `sz.pad - 4` de hoje. No mini
  dá `8px`, igual ao que o JS já entregava (12 − 4).
- **Componente que fica sem nenhuma prop.** Se algum dos 13 tinha `sz` como única
  prop, a assinatura vira `function X()` — não inventar props para "manter a forma".
- **`CardPedido` (linha 664)** recebe `sz` sem usar desde antes desta rodada. Sai
  junto, sem cerimônia: é a dívida que a fatia 7 já tinha nomeado.
- **Ordem no `tema.css`.** A media query do mini precisa vir **depois** do `:root`
  base. Mesma especificidade, quem decide é a ordem — o mesmo cuidado dos
  modificadores da rodada 20.

## 10. Definição de "aprovado sem ressalvas"

Todos os 15 critérios em sim com evidência de arquivo e linha lida do disco,
`npx vitest run` verde, `npx vite build` concluído, e a única diferença visual fora do
Delivery sendo a margem da faixa de erro da Cozinha descrita na seção 9.

---

## Resultado da review — 2026-08-02

**Aprovado sem ressalvas. 15 de 15 critérios em sim.**

Portões:

- `npx vitest run` — **194 arquivos, 3080 testes, verde** (84,84s). Inclui os 9 testes de
  `DeliveryView.test.jsx`, que montam a tela de verdade.
- `npx vite build` — **verde, 10,98s**, rodado *depois* da última edição de CSS. É o único
  passo que prova que o `tema.css` e o `DeliveryView.css` compilam: o vitest não lê CSS.

Critérios, com a evidência:

| # | Critério | Evidência |
|---|---|---|
| 1 | Nenhuma ocorrência de `sz` no DeliveryView | `grep -c '\bsz\b'` → **0** (era 30) |
| 2 | `getSizes` não é mais importado | `grep -c 'getSizes'` → **0** (era 2) |
| 3 | `useResponsive` não é mais importado nem chamado | `grep -c 'useResponsive'` → **0** (era 2) |
| 4 | Os 5 usos viram classe CSS | `--header`, `--abas`, `--area` sem `style`; os dois botões com `--acao-topo` |
| 5 | `style={{` cai 5 no arquivo | **124 → 119** |
| 6 | Token `--gm-pad` definido no `tema.css` | `tema.css:96` e `:107` — 2 declarações |
| 7 | Degrau do mini em `@media` depois do `:root` | `tema.css:105-109`, posterior ao bloco `:root` |
| 8 | Modificador de forma separado dos de cor | `--primario` (l. 272) e `--importar` (l. 283) seguem só com `background`/`color` |
| 9 | `--acao-topo` nos dois botões do topo | JSX linhas 846 e 858; CSS 1 regra |
| 10 | Nenhuma cor literal nas linhas novas | varredura de `#`, `rgb(`, `rgba(` nas linhas adicionadas → 0 |
| 11 | Nenhum `console.log`, `TODO`, `FIXME` novo | varredura nas linhas adicionadas → 0 |
| 12 | `style={{` do projeto cai 5 | **1749 → 1744**, ainda 46 arquivos |
| 13 | Suíte verde | 3080 testes |
| 14 | Nada além das transformações previstas | normalizador com as 4 regras mecânicas → **DIFF VAZIO** |
| 15 | Build verde | `✓ built in 10.98s` |

### Duas correções que a própria review fez, antes de fechar

**1. O piso do `clamp()` nunca entrava em jogo — virou `min()`.** O spec (critério 6) dizia
que o token seria `clamp(12px, 14.9px + 0.86vw, 48px)`. Escrito assim, o primeiro argumento
é CSS morto: para `12px` vencer seria preciso `14.9 + 0.86vw < 12`, ou seja, viewport
negativo. O piso de 12px de verdade mora na media query do `<360`, que é onde o degrau
existe. Isso é exatamente o aprendizado que a rodada 20 registrou — declaração que não
surte efeito e "tem cara de intencional" para quem lê depois. Aplicado dentro da mesma
fatia em que foi aprendido: o token foi para `min(14.9px + 0.86vw, 48px)`, com o motivo
escrito no comentário do `tema.css`. **Desvio deliberado do critério 6, e melhor que ele.**

**2. Nome vizinho de uma classe que já existia.** O modificador novo
`.delivery-view__btn--acao-topo` fica ao lado da classe pré-existente
`.delivery-view__acao-topo`, que é a *linha* onde um dos botões mora — e o outro botão
(o "Importar") nem vive lá dentro. O nome continua correto (os dois são ações do topo da
aba), então ficou; o comentário do CSS ganhou a frase que desfaz a confusão para quem
chegar depois.

### Uma correção de contagem

O spec falava em "13 assinaturas" a limpar. São **12**. O número veio da estimativa da
rodada 20 e nenhum critério dependia dele — o critério 1 conta linhas com `sz` (30 → 0),
não assinaturas. Registrado para não propagar o número errado.

### O que ficou fora, para uma próxima fatia

- As outras **119** ocorrências de `style={{` no DeliveryView.
- Os outros **15 arquivos** que ainda chamam `getSizes` — cada um pode agora trocar
  `sz.pad` por `var(--gm-pad)` sem criar nada.
- As demais propriedades do `sz` (`padSm`, `gap`, `sidebarWidth`, `fontXs`…). O `pad` foi
  a primeira porque era a mais usada e a mais visível; o mesmo método serve para as outras.
- `src/constants/sizes.js` só pode ser apagado quando o último dos 15 arquivos sair.
