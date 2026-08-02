# F018 — fatia 6: aba Cardápio do DeliveryView (CSS fora do JSX)

Rodada 19 do loop. Continuação direta de `f018-delivery-pedidos-css.md` (fatia 5).

## 1. Escopo

Tirar do JSX os estilos das **49 ocorrências de `style={{ … }}` da aba Cardápio** do
`DeliveryView.jsx` — os três componentes `AbaCardapio` (linhas 809–943), `CardProduto`
(945–1036) e `ModalProduto` (1042–1457, incluindo o modal da galeria de fotos) — movendo
cada declaração para `DeliveryView.css` como classe ou modificador BEM, com cor sempre via
token `--gm-*` e mistura com alfa via `color-mix`.

Sobrevivem no JSX **8 ocorrências**, e só estas:

| Linha | O que carrega | Por que fica |
|---|---|---|
| 855, 868 | `padding: 10px ${sz.pad}px` | escala responsiva por breakpoint — sai quando `sz` virar custom property |
| 1257, 1262, 1266, 1271, 1359 | `style={inputStyle(sz)}` | o helper morre numa rodada própria (21 usos no arquivo inteiro) |
| 1317 | `top` / `left` do menu de foto | coordenada calculada em runtime por `getBoundingClientRect` — é parâmetro, não estilo |

Alvo verificável: **53 → 8** atributos `style` na faixa 809–1457 (49 no formato
`style={{ … }}` mais 4 no formato `style={inputStyle(sz)}`). Depois do build a faixa encolhe
para **809–1441**, e é essa a faixa que a review audita.

## 2. Fora de escopo

- **Matar o helper `inputStyle(sz)`** (linha 2838). Ele ignora o parâmetro `sz` e devolve
  três declarações estáticas que já pertenceriam a `.delivery-view__input` /
  `.delivery-view__textarea`, mas tem **21 usos espalhados pelo arquivo todo** — 5 nesta
  fatia e 16 fora dela. Matá-lo pela metade deixa o arquivo em dois estados. É a fatia da
  rodada 20, inteira.
- Converter `sz.pad` (e o resto da escala `sz.*`) em custom properties por breakpoint.
- Qualquer componente fora de 809–1457: `AbaGrupos`, `GrupoEditor`, `AbaEntrega`,
  `AbaPedidos` e os modais de confirmação em 2250–2300.
- Trocar `#fff` por token. Os `#fff` desta fatia (855, 868, 1310, 1379, 1443) continuam
  literais, como já são em `.delivery-view__card-editar--perigo` e
  `.delivery-view__card-remover`. O token `--gm-sobre-accent` segue **proposto e pendente
  de aval do dono** — inventá-lo aqui seria decidir sozinho.
- Mudar comportamento, layout, texto ou fluxo. A tela precisa sair pixel a pixel igual.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — separar CSS do JSX, 1807 ocorrências restantes
  em `src/`, das quais 182 neste arquivo.
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — `.css` puro co-localizado; cor só por CSS Custom Property.
- **Decisão 017 (white-label)** — nenhuma cor de cliente cravada; tudo sai de `--gm-*`,
  que o tenant sobrescreve.

## 4. Arquivos afetados

- `src/components/desktop/views/DeliveryView.jsx` — remoção dos `style` e inclusão das
  classes/modificadores novos.
- `src/components/desktop/views/DeliveryView.css` — declarações novas.
- Uma linha fora da faixa: `DeliveryView.jsx:399`, explicada no critério 8.

### Classes e modificadores novos

`.delivery-view__acao-topo`, `.delivery-view__btn--importar`,
`.delivery-view__btn--primario`, `.delivery-view__btn--secundario`,
`.delivery-view__btn--tentar`, `.delivery-view__card-desc--vazia`,
`.delivery-view__pill--on`, `.delivery-view__pill--off`,
`.delivery-view__aviso--info`, `.delivery-view__aviso--espacado`,
`.delivery-view__campo-linha`, `.delivery-view__campo--flex`,
`.delivery-view__campo--emoji`, `.delivery-view__label-icone`,
`.delivery-view__titulo-icone`, `.delivery-view__foto-input`,
`.delivery-view__foto-menu-item--perigo`, `.delivery-view__galeria-estado-titulo`.

## 5. Critérios de aceite

1. Na faixa 809–1457 do `DeliveryView.jsx` restam **exatamente 8** ocorrências de
   `style={{` ou `style={inputStyle`, e são as 8 da tabela do escopo — nenhuma outra.
2. Nenhuma cor literal (`#rrggbb`, `rgb()`, `oklch()`) entra no CSS novo, com a única
   exceção declarada de `#fff` em `--btn--importar` e `--btn--primario`, que reproduz o
   `#fff` já existente no arquivo. Toda outra cor é `var(--gm-*)` ou
   `color-mix(in srgb, var(--gm-*) N%, transparent)`.
3. Cada `alfa(cor, hex)` convertido usa a porcentagem que `src/constants/colorAlfa.js`
   produziria: `0c`→5%, `10`→6%, `12`→7%, `15`→8%, `22`→13%, `33`→20%.
4. Os cinco `style` das linhas 877, 878, 882, 883 e 884 são **removidos sem CSS novo** —
   `.delivery-view__vazio`, `.delivery-view__vazio-emoji`,
   `.delivery-view__vazio-emoji--carregando` e `.delivery-view__vazio-titulo` já carregam
   esses valores desde a rodada 18. A linha 878 ganha o modificador `--carregando` para
   manter a opacidade 0.4 que a inline tinha.
5. O par disponível/indisponível do `CardProduto` (linhas 981–991) vira os modificadores
   `--on` / `--off` no `.delivery-view__pill`, e a bolinha
   `.delivery-view__card-dot` recebe a cor por descendência do modificador — sem ternário
   no JSX. O `cursor` do ternário `isAdmin ? "pointer" : "default"` vira
   `cursor: pointer` na base mais `:disabled { cursor: default; }`, equivalente porque o
   botão é `disabled={!isAdmin}`.
6. `.delivery-view__galeria-item` (linha 1437) perde o ternário: a cor de borda padrão vai
   para a classe base e a de selecionado para `.delivery-view__galeria-item.is-sel`, classe
   que **já existe** na marcação.
7. Nenhuma declaração nova em classe compartilhada altera um uso fora da fatia. Para cada
   classe que ganhou declaração e é usada fora de 809–1457, a review precisa mostrar que o
   uso externo ou tem inline própria para aquela propriedade (a inline vence) ou não exibe
   nada afetado por ela.
8. `.delivery-view__aviso--erro` fica **só com cor**: o `margin-bottom: 12px` que hoje mora
   nela sai para o modificador novo `--espacado`, aplicado no único uso atual
   (`DeliveryView.jsx:399`). Sem isso, os dois avisos de erro desta fatia (1372 e 1407),
   que não têm margem, ganhariam 12px que não existiam.
9. `npx vitest run` verde: 194 arquivos, 3080 testes, zero falha.
10. `npx vite build` conclui sem erro — é o único passo que prova que o CSS escrito à mão
    compila e que o JSX ainda faz parse (a suíte não lê CSS).
11. Nenhum `console.log`, nenhum `TODO`, nenhum segredo, nenhuma mudança de comportamento:
    o diff do JSX, ignorando `style=`, `className=` e espaço, é vazio.

## 6. Edge cases conhecidos

- **`__modal-fechar` (9 usos, 7 fora da fatia)** — ganha `color: var(--gm-muted)` na base.
  Os 7 externos têm inline própria (`muted` em cinco, `accent` em dois), então a inline
  vence e nada muda para eles.
- **`__hint` (17 usos, 15 fora da fatia)** — ganha `color: var(--gm-muted)`. Todos os 15
  externos têm inline de cor (`muted` ou `red`); nenhum muda.
- **`__modal` (4 usos, 2 fora)** — ganha `background`/`color`. Os dois externos (2256, 2282)
  têm inline com exatamente os mesmos valores mais `maxWidth`.
- **`__modal-titulo` (4 usos, 2 fora)** — ganha `font-weight: 800`. Os dois externos (2258,
  2284) têm a mesma inline.
- **`__modal-botoes > button`** — ganha `padding: 11px 0`. Os quatro botões externos (2267,
  2270, 2293, 2296) já têm essa mesma inline.
- **`__galeria-estado` no ramo de erro (1406)** — é o único dos três sem inline de cor.
  Ganhar `color: var(--gm-muted)` não muda nada porque ele não tem texto direto: só contém
  um `__aviso` (cor própria vermelha) e um botão (cor própria).
- **`__card-editar`** — ganha `border-color`/`color` na base. O modificador `--perigo`
  (CSS linha 308) sobrescreve as duas e vem depois na cascata. O botão de cancelar usa
  `__card-remover--neutro`, classe diferente, intocada.
- **Menu de foto (1317)** — a inline mistura coordenada de runtime com cor. Só a cor sai;
  `top`/`left` ficam. Não vira custom property porque seriam duas propriedades para
  substituir duas — troca sem ganho.

## 7. Definição de "aprovado sem ressalvas"

Os 11 critérios em "sim" com evidência de arquivo e linha, `npx vitest run` verde,
`npx vite build` verde, nenhum `TODO` ou `console.log` novo, e nenhuma regressão visual —
provada pelo diff do JSX vazio quando se ignora `style=` e `className=`.

---

## 8. Resultado da review (2026-08-02)

**Aprovado sem ressalvas — 11 de 11 critérios em sim, nenhuma rodada de correção.**

`npx vitest run` → 194 de 194 arquivos, 3080 de 3080 testes, 76,99s. Nenhum arquivo de teste
tocado. `npx vite build` → verde em 9,51s. Dois arquivos de código modificados, os dois previstos.

Depois do build a faixa dos três componentes é **809–1441** (`AbaCardapio` 809, `CardProduto` 942,
`ModalProduto` 1030, divisor de seção 1442) — o arquivo encolheu 16 linhas, então os números de
linha do escopo, escritos antes do build, deslocaram.

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | Restam exatamente 8 `style` na faixa, e são os 8 da tabela | sim | `sed -n '809,1441p' \| grep 'style={'` devolve 8: linhas 852 e 865 (`padding: 10px ${sz.pad}px`), 1245/1250/1259/1344 (`style={inputStyle(sz)}`), 1254 (`{{ ...inputStyle(sz), textAlign }}`), 1305 (`top`/`left` do menu de foto). No `HEAD` a mesma faixa tinha 49 `style={{` mais 4 `style={inputStyle` = 53 |
| 2 | Nenhuma cor literal no CSS novo, exceto os dois `#fff` declarados | sim | `git diff DeliveryView.css \| grep '^+' \| grep -Ei '#[0-9a-f]{3,8}\|rgba?\(\|oklch\('` devolve só `color: #fff` duas vezes (`--btn--primario`, `--btn--importar`) e a menção ao `#fff` no comentário |
| 3 | Cada `alfa(cor, hex)` virou a porcentagem certa | sim | As 16 chamadas `alfa()` da faixa no `HEAD` mapeiam 1:1 nos `color-mix` novos: `0c`→5% (blue ×2), `10`→6% (muted), `12`→7% (accent ×2, red ×2), `15`→8% (muted ×1 + o ternário green/muted), `22`→13% (blue ×1, muted ×3), `33`→20% (blue ×1, red ×2). A faixa não tem mais nenhum `alfa()` |
| 4 | Os cinco `style` dos estados vazios saem sem CSS novo | sim | `DeliveryView.css:441–454` já trazia `.delivery-view__vazio`, `__vazio-emoji`, `__vazio-titulo`; o único acréscimo é `__vazio-emoji--carregando { opacity: 0.4 }` (linha 453), aplicado em `DeliveryView.jsx:875` |
| 5 | Pill vira `--on`/`--off`, bolinha por descendência, `cursor` por `:disabled` | sim | CSS: `.delivery-view__pill { border: none; cursor: pointer }`, `:disabled { cursor: default }`, `--on`/`--off` e `--on .delivery-view__card-dot`. JSX `DeliveryView.jsx:974–980`: o `<button>` é `disabled={!isAdmin}`, o `className` é template com `on`/`off` e o `<span className="delivery-view__card-dot" />` não tem mais `style` |
| 6 | `__galeria-item` perde o ternário; selecionado vai para `.is-sel` | sim | CSS: base com `border: 2px solid color-mix(… muted 13% …)` e `.delivery-view__galeria-item.is-sel { border-color: var(--gm-accent) }`. JSX `DeliveryView.jsx:1419` mantém a classe `is-sel` que já existia |
| 7 | Nenhuma declaração em classe compartilhada muda um uso fora da faixa | sim | Só o próprio `DeliveryView.jsx` usa o prefixo `delivery-view__` no `src/` inteiro. Das 17 classes que ganharam declaração dentro de regra existente, 13 têm **zero** uso fora de 809–1441 (`__import`, `__card`, `__card-divisor`, `__card-editar`, `__card-emoji`, `__card-dot`, `__card-desc`, `__pill`, `__foto-*`, `__galeria-*`, `__acao-topo`). As 4 restantes: `__modal-fechar` (7 externos, todos com `style={{ color: … }}` própria — 2108, 2130, 2188, 2242, 2268, 2333, 2769), `__hint` (15 externos, todos com `color` inline; o `flex-basis: 100%` já existia antes desta rodada), `__modal` e `__modal-titulo` (2 externos cada, 2239/2265 e 2241/2267, com inline de valor idêntico), `__modal-botoes > button` (4 botões externos, todos já com `padding: "11px 0"` inline) |
| 8 | `--erro` fica só com cor; a margem sai para `--espacado` | sim | `DeliveryView.css:800–812`: `--erro` tem `background`/`color`/`border` e nenhum `margin`; `--espacado` tem só `margin-bottom: 12px`. No JSX o `--espacado` aparece uma única vez, em `DeliveryView.jsx:399`; os dois avisos de erro do modal (1357, 1392) ficam sem margem, como eram |
| 9 | `npx vitest run` verde | sim | 194 arquivos, 3080 testes, zero falha |
| 10 | `npx vite build` conclui | sim | `✓ built in 9.51s`, PWA com 52 entradas em precache |
| 11 | Diff do JSX vazio ignorando `style=`, `className=` e espaço | sim | Script com contagem de chaves (não regex — `style` multilinha quebra regex) comparando `git show HEAD:DeliveryView.jsx` com o arquivo atual: **idênticos**. `git diff` dos dois arquivos não tem nenhum `console.log`, `TODO` ou `FIXME` novo |

### O que ficou para a próxima rodada

`inputStyle(sz)` (`DeliveryView.jsx:2838`) segue vivo, com **21 usos** — 4 nesta faixa, 17 fora.
Ele recebe `sz` e **não usa**: devolve três declarações estáticas (`border`, `background`, `color`)
que pertencem a `.delivery-view__input` / `.delivery-view__textarea`. É a fatia da rodada 20,
inteira, porque matá-lo pela metade deixaria o arquivo em dois estados.

Continua pendente do dono o token `--gm-sobre-accent` para o texto sobre fundo de destaque — os
dois `#fff` desta fatia (`--btn--primario`, `--btn--importar`) entram na mesma fila.
