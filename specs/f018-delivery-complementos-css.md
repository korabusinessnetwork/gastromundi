# F018 — fatia 9: a aba Complementos do DeliveryView sai do inline

## 1. Escopo

Tirar os **91 estilos inline** dos seis componentes da aba Complementos de
`src/components/desktop/views/DeliveryView.jsx` (linhas 1443–2389) para
`DeliveryView.css`, reusando as classes que já existem e criando classe nova só
onde o mesmo bloco de estilo se repete ou onde não há classe. Nenhuma mudança de
comportamento, de marcação semântica ou de aparência — exceto a única mudança
declarada no critério 11.

Os seis componentes: `AbaComplementos`, `GrupoCardMini`,
`SeletorProdutoComplemento`, `SeletorSubgrupo`, `GrupoEditor`,
`SeletorProdutosMulti`.

## 2. Fora de escopo

- **A aba Entrega** (`AbaEntrega`) e os 2 avulsos — os outros 28 inline do
  arquivo. Fica para a fatia 10, que fecha o arquivo.
- **Os outros 45 arquivos** com `style={{`.
- **O `#fff` cravado** (linhas 1513, 2004, 2046, 2123, 2236, 2262). Ele vai para
  o CSS junto com o resto e **continua `#fff` literal**, porque é exatamente o
  mesmo caso de `.delivery-view__btn--primario` (linha 276) e
  `.delivery-view__card-remover` (linha 1073): "texto sobre cor cheia" ainda não
  tem token. A proposta de `--gm-sobre-accent` segue **pendente de decisão do
  dono** — quando ela for aprovada, um `sed` resolve os oito de uma vez. Criar o
  token nesta rodada seria decidir sozinho.
- **Unificar `.delivery-view__sugestoes` com o menu de busca novo.** São
  parecidos e não são iguais: `__sugestoes` é um `<ul>` com `padding: 4px`,
  `list-style: none` e `z-index: 1200` (precisa passar por cima dos panes do
  Leaflet); os menus dos Complementos são `<div>` de linhas full-bleed separadas
  por borda, com `z-index: 20`. Fundir obrigaria um dos dois a mudar de
  aparência. Ficam separados **de propósito**, e este parágrafo existe para que
  a próxima rodada não reabra a discussão.
- Renomear classe existente, mexer em `ListaArrastavel`, mexer no PDV.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`, linha 84) — 🟠 Alta, "Em andamento".
  Fatia 9 de uma sequência; a 8 fechou na rodada 21 (commit `7af5734`).
- **Decisão 018** — separar CSS do JSX.
- **Decisão 023 / ADR-007** — cor por CSS Custom Property `--gm-*`, blend por
  `color-mix`, nunca hex com sufixo de alfa.
- **Decisão 017** (white-label) — nada de cor de cliente cravada; tudo que vira
  CSS aponta para token, então o tenant continua podendo sobrescrever.
- `memory/patterns.md`: "BEM — modificador de cor não carrega espaçamento"
  (rodada 19) e "Antes de enriquecer classe compartilhada, enumere todos os
  usuários dela" (rodada 20).

## 4. Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/desktop/views/DeliveryView.jsx` | 91 `style={{` viram `className`; nenhuma linha de lógica muda |
| `src/components/desktop/views/DeliveryView.css` | regras novas da aba Complementos, no fim do bloco estrutural (antes do bloco de TIPOGRAFIA), com comentário de papel em cada uma |

Nenhum arquivo novo. Nenhuma migration. Nenhum token global novo.

## 5. Critérios de aceite

1. **`grep -c 'style={{' src/components/desktop/views/DeliveryView.jsx` cai de
   119 para 28**, e as 28 que sobram estão todas fora do intervalo da aba
   Complementos (`AbaEntrega` e avulsos).

2. **Nenhuma cor literal nova no CSS além do `#fff` que já é padrão do
   arquivo.** Todo `varColor(C.x)` vira `var(--gm-x)`; todo `alfa(C.x, "NN")`
   vira `color-mix(in srgb, var(--gm-x) P%, transparent)` com **P calculado pela
   mesma fórmula do helper** (`src/constants/colorAlfa.js:20`,
   `Math.round(parseInt(NN,16)/255*100)`), ou seja:

   | no JSX | no CSS |
   |---|---|
   | `alfa(C.border, "60")` | `color-mix(in srgb, var(--gm-border) 38%, transparent)` |
   | `alfa(C.accent, "15")` | `color-mix(in srgb, var(--gm-accent) 8%, transparent)` |
   | `alfa(C.accent, "12")` | `color-mix(in srgb, var(--gm-accent) 7%, transparent)` |
   | `alfa(C.accent, "40")` | `color-mix(in srgb, var(--gm-accent) 25%, transparent)` |
   | `alfa(C.muted, "20")` | `color-mix(in srgb, var(--gm-muted) 13%, transparent)` |
   | `alfa(C.muted, "15")` | `color-mix(in srgb, var(--gm-muted) 8%, transparent)` |
   | `alfa(C.red, "10")` | `color-mix(in srgb, var(--gm-red) 6%, transparent)` |

   Não é aproximação: é a string que o helper já emite em runtime hoje.

3. **Os três menus de busca viram uma classe só.** As linhas 1626, 1700 e 2342
   têm o mesmo bloco caractere por caractere; viram
   `.delivery-view__menu-busca`. Depois do build, `grep -c 'menu-busca'` no JSX
   = 3 e a regra aparece **uma vez** no CSS.

4. **Os três botões de opção viram uma classe só.** Linhas 1648, 1721 e 2363,
   idênticas entre si; viram `.delivery-view__menu-opcao`. O `border: none`
   inline some porque `.delivery-view__btn` já declara — os três continuam com
   `className="delivery-view__btn delivery-view__menu-opcao"`.

5. **As duas lupas e os dois wrappers de busca viram uma classe cada.** Linhas
   1686/2328 → `.delivery-view__busca`; linhas 1689/2331 →
   `.delivery-view__busca-lupa`. O wrapper da linha 1616 é diferente
   (`flex: 1; min-width: 180px` em vez de `max-width: 420px`) e recebe classe
   própria, **não** um modificador espremido no mesmo nome.

6. **As duas seções do editor viram uma classe.** Linhas 2142 e 2199, idênticas
   → `.delivery-view__editor-secao`.

7. **Todo estilo inline que só repete o que a classe já aplicada declara é
   apagado, não migrado.** Cada um destes some sem regra nova, porque a classe
   já está no elemento e já diz a mesma coisa:

   | linha(s) | inline redundante | já declarado em |
   |---|---|---|
   | 1500, 1635, 1709, 2055, 2070, 2146, 2167, 2188, 2204, 2351 | `color: varColor(C.muted)` | `.delivery-view__hint` (CSS:743) |
   | 1521 | `color: varColor(C.muted)` | `.delivery-view__vazio` (CSS:459) |
   | 1522 | `opacity: 0.3` | `.delivery-view__vazio-emoji` (CSS:469) |
   | 1523 | `fontWeight: 600` | `.delivery-view__vazio-titulo` (CSS:471) |
   | 2094, 2174, 2225, 2251 | `color: varColor(C.muted)` | `.delivery-view__modal-fechar` (CSS:516) |
   | 2222, 2248 | `background`, `color` | `.delivery-view__modal` (CSS:494–495) |
   | 2224, 2250 | `fontWeight: 800` | `.delivery-view__modal-titulo` (CSS:503) |
   | 2229, 2255 | `color: varColor(C.text)` | herdado de `.delivery-view__modal` |
   | 2233, 2236, 2259, 2262 | `padding: "11px 0"` | `.delivery-view__modal-botoes > button` (CSS:819) |

   A evidência de "some sem regra nova" é o diff: nenhuma dessas linhas pode
   aparecer como declaração adicionada no CSS.

8. **Nenhum modificador de cor ganha espaçamento.** `.delivery-view__btn--primario`,
   `--secundario` e `--sm` continuam com exatamente as declarações que têm hoje.
   Onde o botão precisa de padding próprio (Voltar `8px 12px`, Salvar
   `9px 16px`, Remover grupo `8px 10px`, Novo grupo `10px 16px`, Adicionar item
   `8px 14px`), o padding vai em modificador **de forma**, com nome próprio,
   como já foi feito em `.delivery-view__btn--acao-topo` (CSS:254).

9. **Estado condicional vira modificador, não ternário de estilo.** Os quatro
   ternários da fatia — selo do card (1578, `obrigatorio`), toggle
   obrigatório/opcional (2043, `ativo`), botão Salvar (2004, `sujo`) — viram par
   de classes (`--obrigatorio`/`--opcional`, `--ativo`, `--sujo`/`--inerte`)
   escolhidas por `className={...}`. Nenhum `style={{}}` sobra carregando
   ternário.

10. **As duas linhas arrastáveis (2084 e 2162) compartilham classe.** São iguais
    menos o padding (`6px 10px` e `8px 10px`); base
    `.delivery-view__item-linha` com o padding maior, e
    `.delivery-view__item-linha--compacta` para o de 6px. O valor de cada uma
    tem que continuar o mesmo depois do build.

11. **Única mudança de comportamento aceita, e é declarada:** o botão Salvar do
    editor (2004) tem hoje `cursor: default` inline quando está desabilitado, o
    que sobrescreve o `cursor: not-allowed` que `.delivery-view__btn:disabled`
    (CSS:238) aplica em todo botão desabilitado da tela. Ao sair o inline, ele
    passa a mostrar `not-allowed` como todos os outros. É o comportamento certo
    pelo Princípio nº 1 (o cursor avisa que o botão não responde antes do
    usuário clicar) e alinha a tela consigo mesma. Nenhum outro pixel muda.

12. **`npx vitest run` verde** — 194 arquivos, 3080 testes, incluindo
    `DeliveryView.test.jsx`.

13. **`npx vite build` verde**, rodado **depois** da última edição de CSS —
    vitest não lê CSS, então este é o único passo que prova que o arquivo
    compila e que o JSX ainda faz parse.

14. **Nada de `console.log`, `TODO` sem justificativa, segredo, `select *` novo
    ou dependência nova.** O diff é `.jsx` + `.css` e mais nada.

15. **Toda regra nova no CSS tem comentário dizendo o papel dela na tela** (o
    padrão que o arquivo já usa), e não apenas repetindo o nome da classe.

## 6. Edge cases conhecidos

- **Especificidade de `:disabled`.** `.delivery-view__btn:disabled` (CSS:237) e
  um modificador de classe única têm a mesma especificidade — quem vence é quem
  vem depois. Os modificadores novos entram **depois** dessa regra no arquivo,
  então cor de modificador não pode acabar apagando o `opacity: 0.6` do
  desabilitado. Conferir os botões desabilitados da fatia (Salvar sem alteração,
  Novo grupo com campo vazio, toggle sem `isAdmin`) declaração por declaração.
- **`display: flex` sobre `.delivery-view__btn`.** A classe base é
  `inline-flex`; vários botões da fatia sobrescrevem para `flex` inline. O
  modificador novo precisa continuar declarando `display: flex` onde havia —
  omitir volta o botão para `inline-flex` e muda a largura.
- **`flex-basis: 100%` de `.delivery-view__hint`.** Já se aplica hoje (a classe
  já está nos elementos); apagar o `color` inline não mexe nisso. Mas nenhuma
  regra nova pode acrescentar `flex`/`flex-basis` a `__hint`, senão muda 10
  lugares de uma vez.
- **Grupo sem itens, sem subgrupos e sem produtos vinculados** — os estados
  vazios (1521, 2188, 2204, 2351) continuam renderizando com o mesmo texto e a
  mesma cor.
- **`isAdmin` falso** — metade dos botões da fatia nem monta. As classes novas
  não podem depender de um irmão que só existe para admin.
- **Tema escuro / tenant com accent próprio** — como tudo aponta para `--gm-*`,
  trocar o tema continua trocando a aba inteira. O `#fff` é o único literal, e é
  o mesmo que a tela já usa.

## 7. Definição de "aprovado sem ressalvas"

Todos os 15 critérios em **sim** com evidência de arquivo e linha, `npx vitest
run` verde, `npx vite build` verde rodado depois da última edição de CSS, sem
`TODO` nem `console.log` novo, e o diff do `.jsx` contendo **apenas** troca de
`style={{...}}` por `className`/remoção — nenhuma linha de lógica, condição,
handler ou texto de tela alterada.

---

## 8. Resultado da review (2026-08-02)

**Aprovada sem ressalvas — 15 de 15 critérios em "sim".**

| # | Evidência |
|---|---|
| 1 | `grep -c 'style={{' DeliveryView.jsx` = **28**. Os 28: linha 628 (`--cor-status`, runtime), 1296 (posição do menu de foto, runtime) e 26 entre 2497 e 2711, todas em `AbaEntrega`. Zero no intervalo da aba Complementos. |
| 2 | Único literal de cor adicionado ao CSS: `#fff` (3x). Os `color-mix` adicionados são 38% (border), 25%/8%/7% (accent), 13% (muted) e 6% (red) — batem um a um com a tabela do critério. |
| 3 | `delivery-view__menu-busca` aparece 3x no JSX e a regra existe **1x** no CSS (linha 1216). |
| 4 | `delivery-view__menu-opcao` 3x no JSX (mais 3 de `-nome` e 2 de `-icone`), regra única em CSS:1234. Os três seguem com `className="delivery-view__btn delivery-view__menu-opcao"`. |
| 5 | `__busca` 2x, `__busca-lupa` 2x, e o wrapper diferente ficou com nome próprio `__busca-inline` (1x, CSS:1200) — não virou modificador espremido. |
| 6 | `__editor-secao` 2x no JSX, regra única em CSS:1400. |
| 7 | O diff do CSS **remove uma única linha** (o comentário de `__grupo-card`, que foi fundido com o duplicado). Nenhum seletor de `.delivery-view__hint`, `__vazio*`, `__modal`, `__modal-titulo`, `__modal-fechar` ou `__modal-botoes` aparece como adicionado — as redundâncias sumiram sem regra nova. |
| 8 | Nenhuma declaração removida do CSS → `--primario`, `--secundario` e `--sm` intactos. O padding foi para modificadores de forma: `--novo-grupo` (10px 16px), `--voltar` (8px 12px), `--salvar` (9px 16px), `--add-item` (8px 14px), `--remover-grupo` (8px 10px). |
| 9 | Os quatro ternários viraram par de classes: `__grupo-selo--obrigatorio/--opcional`, `__editor-toggle--ativo`, `__btn--primario/--inerte`. Nenhum `style={{}}` sobrou com ternário. |
| 10 | `.delivery-view__item-linha` com `padding: 8px 10px` (CSS:1347) e `--compacta` com `6px 10px` (CSS:1371) — os dois valores originais preservados. |
| 11 | `grep -c 'cursor: sujo'` = 0. O Salvar desabilitado passa a usar o `not-allowed` de `.delivery-view__btn:disabled`. |
| 12 | `npx vitest run` — **195 arquivos, 3096 testes, verde** (75,25s). |
| 13 | `npx vite build` — **verde em 11,06s**, rodado depois da última edição de CSS. Os avisos de `css-syntax-error` do minificador são pré-existentes: ele tropeça em `--fs-*` dentro de **comentário**, em vários `.css` do repositório. |
| 14 | `git diff --stat`: só `.jsx`, `.css` e os arquivos de registro do ciclo. Zero `console.log` ou `TODO` adicionados. Nenhuma linha `+` do JSX fora de `className`/fechamento de marcação — nenhuma lógica, condição, handler ou texto de tela mudou. |
| 15 | Verificado por script: entre o banner `ABA COMPLEMENTOS` e o de `TIPOGRAFIA`, toda regra é precedida de comentário. As três exceções apontadas (`__grupo-selo--opcional`, `__item-linha--compacta`) estão descritas no comentário da regra base, que fala das duas variantes; `__editor-toggle--ativo` ganhou comentário próprio na review. |

Corrigido durante a review: 30 regras novas estavam sem comentário de papel (critério 15).

### O que ficou para a próxima rodada

- **Fatia 10 — `AbaEntrega`**, os 26 inline restantes mais os 2 de runtime. Fecha o arquivo.
- **`--gm-sobre-accent`** continua pendente de decisão do dono. Enquanto isso, `#fff` literal em `__editor-toggle--ativo` e `__btn--perigo`, como já era em `--primario` e `__card-remover`.
- **`.delivery-view__pedido-item`** é usada no JSX e não tem regra no CSS. É anterior a esta fatia e fica fora do escopo — vale conferir na fatia 10.
