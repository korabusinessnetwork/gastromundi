# F018 — fatia 10: a aba Entrega do Delivery sai do inline

> Rodada 23 do ciclo. Última fatia do `DeliveryView.jsx`.

## 1. Escopo

Trocar os **26 `style={{}}` do componente `AbaEntrega`** (`DeliveryView.jsx`, linhas 2497 a 2711)
por classes em `DeliveryView.css`, mantendo a tela pixel a pixel igual, com uma única exceção
declarada no critério 12.

Ao fim da fatia, `style={{}}` no arquivo cai de **28 para 2** — sobram só os dois que carregam
valor calculado em runtime e que **não podem** virar CSS estático.

## 2. Fora de escopo

- **Os 2 inline de runtime**, que ficam como estão: linha 628 (`"--cor-status": cssCor(base)`,
  a cor da coluna do kanban vem do dado) e linha 1296 (`top`/`left` do menu de foto, vindos de
  `getBoundingClientRect`). Ambos são o uso legítimo de `style` — passar valor que só existe em
  runtime. Não tente movê-los.
- **Os outros 45 arquivos** com inline em `src/` (1653 ocorrências no total). Esta fatia fecha um
  arquivo, não o F018.
- **`MapaRaioEntrega`** e qualquer arquivo fora do par `DeliveryView.jsx` / `DeliveryView.css`.
- **Redesenho.** Nenhum espaçamento, cor, tamanho ou ordem muda de valor. Migração é troca de
  veículo, não de aparência.
- **O token `--gm-sobre-accent`** continua pendente de decisão do dono. Enquanto não existe,
  `#fff` literal sobre a cor do tenant segue como está em `--primario`, `--perigo` e
  `__card-remover`.
- **Refatorar lógica.** Nenhum handler, condição, estado ou texto de tela muda.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — "separar CSS do JSX", 🟠 alta, em andamento desde a
  rodada 13.
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — `.css` co-localizado, cor sempre por token `--gm-*`, mistura por
  `color-mix`, nunca hex com sufixo de alfa.
- **Decisão 017 (white-label)** — nenhuma cor de cliente cravada; tudo por token do tenant.
- Continuação direta da rodada 22 (fatia 9), commit `143fa01`.

## 4. Arquivos afetados

| Arquivo | O quê |
|---|---|
| `src/components/desktop/views/DeliveryView.jsx` | remove os 26 `style={{}}` da `AbaEntrega` e aplica as classes |
| `src/components/desktop/views/DeliveryView.css` | novo bloco `ABA ENTREGA`, antes do banner `TIPOGRAFIA` |

Nenhuma migration, nenhuma tabela, nenhum dado novo — logo, nada de RLS, tenant, dinheiro ou
consulta a especificar nesta rodada.

## 5. Critérios de aceite

1. `grep -c 'style={{' src/components/desktop/views/DeliveryView.jsx` retorna **2**, e as duas
   ocorrências são as linhas 628 e 1296 descritas em "fora de escopo". Nenhuma sobra na
   `AbaEntrega`.

2. **Nenhuma cor literal nova**, exceto `#fff` — que só pode aparecer sobre a cor cheia do tenant,
   como já é a convenção do arquivo. Toda chamada `varColor(C.x)` vira `var(--gm-x)` e toda
   chamada `alfa(C.x, "hh")` vira `color-mix(in srgb, var(--gm-x) P%, transparent)` com a
   conversão exata:

   | chamada no JSX | vira |
   |---|---|
   | `alfa(C.muted, "12")` | `color-mix(in srgb, var(--gm-muted) 7%, transparent)` |

   É a única chamada de `alfa()` na fatia, e aparece duas vezes (linhas 2541 e 2690).

3. **Inline redundante é APAGADO, não migrado.** Estes cinco já são exatamente o que a classe da
   própria linha declara; a evidência de que foram tratados certo é o diff **não** conter regra
   nova para eles:
   - 2497 — `color`/`padding` já são `.delivery-view__carregando--bloco` (CSS:1108), escrita na
     rodada 21 e até hoje sem consumidor. Basta aplicar o modificador.
   - 2551, 2641, 2656, 2665 — `color: varColor(C.muted)` já é `.delivery-view__hint` (CSS:742).
     Some sem deixar rastro. (O `C.red` da 2656 **não** é redundante — esse vira modificador.)
   - 2613 — `whiteSpace: "nowrap"` já é `.delivery-view__btn` (CSS:226).
   - 2671 — `color: varColor(C.muted)` já é `.delivery-view__modal-fechar` (CSS:510).

4. **Onde a declaração mora, quando a classe tem um único usuário.** A regra desta fatia, escrita
   para não virar decisão caso a caso:
   - o que descreve **o que o elemento é** entra na classe base — `background: var(--gm-surface)`
     vai para `.delivery-view__faixa` (CSS:823), que tem exatamente 1 usuário (linha 2668);
   - o que descreve **como ele se encaixa no pai** vira modificador, porque depende do container —
     `flex: 1 1 240px` da linha 2567 **não** entra em `.delivery-view__autocomplete`, vai para um
     modificador próprio.

5. **Modificador de cor não carrega espaçamento** (o padrão das rodadas 19, 21 e 22). O padding dos
   botões vai para modificadores de forma novos; `--primario`, `--secundario` e `--sm` ficam
   **intocados**, porque vestem botões de outras abas com espaçamento próprio. Evidência: o diff
   do `.css` não altera nenhuma linha dentro dessas três regras.

6. **Os três pares "escolhido / não escolhido" viram par de classes**, nunca ternário dentro de
   `style`:
   - 2539 — modo da taxa (Por bairro/CEP | Por distância);
   - 2688 — tipo da faixa (Por bairro | Por CEP);
   - 2631 — cadeado (travado | liberado).

   Os dois primeiros têm padding **diferente** (`8px 14px` e `7px 14px`) e cor **idêntica**: a cor
   sai numa regra de lista de seletores compartilhada, o padding fica em cada classe. Os `1px` de
   diferença são preservados — normalizar seria redesenho, e redesenho está fora de escopo.

7. **Nenhum `flex`, `gap`, `margin` ou `padding` da fatia sobra em JavaScript.** Os oito contêineres
   de layout (2509, 2511, 2530, 2559, 2565, 2663, 2680, 2699) ganham classe com nome do que
   contêm, não do que parecem — nada de `__div1`, `__linha-flex` ou `__wrapper`.

8. **O botão "Localizar no mapa" (2612) perde o `opacity` inline** e passa a usar o
   `.delivery-view__btn:disabled` que já existe (CSS:237). É a **única mudança de comportamento
   visual da fatia**, declarada aqui antes do build: o botão desabilitado enquanto geocodifica
   passa de `opacity: 0.7` para `0.6`, o mesmo de todo botão desabilitado da tela. Ganha
   consistência; a diferença de 0,1 não foi decisão de ninguém, é resíduo de escrita inline.

9. **Toda regra nova do `.css` é precedida de comentário que diz o papel dela na tela** — por que
   aquele valor existe, não a repetição do nome do seletor. "Ícone do subtítulo: desce 2px para
   alinhar com a linha de base do texto" serve; "estilo do ícone" não.

10. **A convenção de seletor duplicado do arquivo é respeitada.** `.delivery-view__entrega-titulo`
    já tem gêmea de uma linha no bloco `TIPOGRAFIA` (CSS:1618) com `font-size`/`line-height`. A
    regra estrutural nova (`font-weight`, `margin-bottom`, `display`, `align-items`, `gap`) entra
    no bloco da aba e **não** duplica nem move as duas propriedades de tipografia.

11. **A migração é feita por script que conta antes de gravar** (padrão registrado em
    `memory/patterns.md` na rodada 22): cada substituição declara quantas ocorrências espera, e
    nada é escrito em disco se qualquer contagem divergir. Divergência se resolve **estreitando a
    âncora**, nunca subindo o número esperado. Vale especialmente aqui: `AbaEntrega` tem blocos
    parecidos com os da aba Complementos, e a rodada 22 já pegou três gêmeas byte a byte iguais.

12. `npx vitest run` verde — nenhum arquivo de teste novo, porque a fatia não cria função pura nem
    muda fluxo. A suíte prova que nenhum seletor usado por teste sumiu.

13. `npx vite build` verde, rodado **depois da última edição do `.css`**. É o único passo que
    compila o CSS escrito à mão — o vitest não lê `.css`. Avisos de `css-syntax-error` vindos do
    minificador tropeçando em `*` e crase **dentro de comentário** são pré-existentes em vários
    `.css` do repositório e não contam como falha.

14. Sem `console.log`, sem `TODO`, sem segredo, sem `select *`. `git diff --stat` mostra apenas
    `DeliveryView.jsx`, `DeliveryView.css` e os arquivos de registro do ciclo. Nenhuma linha `+`
    do `.jsx` fora de `className` e pontuação de marcação — provando que nenhuma lógica mudou.

15. **O arquivo fecha:** ao final, `grep -c 'style={{' src/components/desktop/views/DeliveryView.jsx`
    = 2 e a métrica global `grep -ro 'style={{' src --include=*.jsx | wc -l` cai de **1653 para
    1627** (queda de exatamente 26), com o `DeliveryView.jsx` saindo da lista dos arquivos que ainda
    precisam de fatia.

## 6. Edge cases conhecidos

- **`readOnly` (usuário não-admin)** esconde o seletor de modo, o botão de localizar, o cadeado e o
  bloco de adicionar faixa. As classes desses elementos precisam continuar existindo no `.css`
  mesmo quando o JSX não os renderiza — regra sem usuário naquele render não é regra morta.
- **`bloqueado`** desabilita o input de endereço e troca o ícone do cadeado. O par de classes tem
  que cobrir os dois estados; nenhum deles pode depender de `style` para existir.
- **Lista de faixas vazia** cai no hint "Nenhuma faixa cadastrada ainda." (2665), que fica dentro de
  um contêiner `flex-direction: column`. O `.delivery-view__hint` base tem `flex-basis: 100%`, que
  em coluna vira altura — **comportamento pré-existente e idêntico hoje**, já que o contêiner já é
  flex-column pelo inline. Não mexa nisso nesta fatia; se incomodar, é item próprio.
- **Modo "km" versus modo "área"** renderizam blocos diferentes. Migrar um sem abrir o outro na tela
  é fácil; a conferência é por leitura do JSX, não por navegação.
- **`geocodificando`** deixa o botão desabilitado e troca o rótulo para "Localizando…". O estado
  visível continua sendo o rótulo — o critério 8 só troca o valor da opacidade.

## 7. Definição de "aprovado sem ressalvas"

Todos os 15 critérios em **sim** com evidência de arquivo e linha, `npx vitest run` verde,
`npx vite build` verde rodado depois da última edição de CSS, nenhum `TODO` ou `console.log`
adicionado, e o `DeliveryView.jsx` com exatamente **2** `style={{}}`, ambos de runtime.

## 8. Resultado da review (2026-08-02)

**Aprovada sem ressalvas — 15 de 15 critérios em "sim", nenhuma rodada de correção.**

| # | Critério | Evidência |
|---|---|---|
| 1 | 2 `style={{`, ambos de runtime | `DeliveryView.jsx:628` (`--cor-status`) e `1296` (posição do menu de foto). Zero na `AbaEntrega` |
| 2 | Nenhuma cor literal nova além de `#fff` | diff do `.css` acrescenta `#fff` em 2 regras (`--ativo` e `--travado`) e cita 1 vez em comentário; `alfa(C.muted,"12")` → `color-mix(in srgb, var(--gm-muted) 7%, transparent)` ×2, exatamente a tabela de conversão |
| 3 | Inline redundante apagado, não migrado | nenhuma regra nova para os 5 (2497 usa `--carregando--bloco`, que já existia; 2551/2641/2656/2665 caíram no `color` do `__hint`; 2613 no `white-space` do `__btn`; 2671 no `__modal-fechar`) |
| 4 | Declaração no lugar certo | `background: var(--gm-surface)` foi para a base `.delivery-view__faixa` (o que ela é); `flex: 1 1 240px` virou `__autocomplete--endereco` (como se encaixa no pai) |
| 5 | Modificador de cor sem espaçamento | o diff do `.css` tem **zero linhas removidas** — `--primario`, `--secundario` e `--sm` não foram tocados |
| 6 | Os três pares viram par de classes | `__entrega-modo--ativo`, `__faixa-tipo--ativo` e `__cadeado--travado`; os paddings `8px 14px` e `7px 14px` preservados, com a cor numa lista de seletores compartilhada |
| 7 | Nenhum layout sobra em JavaScript | os 8 contêineres ganharam nome do que contêm (`__entrega`, `__entrega-basico`, `__entrega-modos`, `__entrega-mapa`, `__endereco-linha`, `__faixas`, `__faixa-tipos`, `__faixa-campos`) |
| 8 | "Localizar no mapa" usa `:disabled` | `__btn--localizar` só carrega `padding`; a opacidade passa a ser o `0.6` da base |
| 9 | Comentário de papel em toda regra nova | única exceção aceita: `__entrega-modo` e `__faixa-tipo` (só padding), cobertos pelo comentário do par logo acima |
| 10 | Convenção de seletor duplicado respeitada | a regra estrutural de `__entrega-titulo` não repete nem move o `font-size`/`line-height` da gêmea do bloco `TIPOGRAFIA` |
| 11 | Migração por script que conta antes de gravar | `mig10.cjs`, 26 substituições contadas, fechou de primeira |
| 12 | `npx vitest run` verde | 195 arquivos, 3096 testes (76,35s) |
| 13 | `npx vite build` verde | `✓ built in 10.98s`, rodado depois da última edição de CSS |
| 14 | Sem `console.log`, `TODO`, segredo ou arquivo fora do escopo | `git diff --stat` = só os dois arquivos (189 inserções / 46 remoções); **toda** linha `+` do `.jsx` contém `className` — nenhuma lógica, handler, condição ou texto de tela mudou |
| 15 | O arquivo fecha | métrica global 1653 → **1627**, queda de exatamente 26 |

**Efeito colateral tratado:** a última chamada de `alfa()` do arquivo saiu com esta fatia e o import
ficou órfão. Nem o `vitest` nem o `vite build` reclamam disso — foi removido à mão depois de conferir
que a contagem tinha caído a zero.

**O que ficou para a próxima rodada**

- Os outros 45 arquivos com inline (1627 no total). O maior é `relatorio/RelatorioView.jsx`, com 202.
- O token `--gm-sobre-accent`, ainda pendente de decisão do dono — enquanto não existe, `#fff` literal
  sobre a cor cheia do tenant segue como convenção do arquivo.
- `.delivery-view__pedido-item`, usada no JSX sem regra no `.css`. Pré-existente, fora do escopo desta
  fatia e das anteriores.
