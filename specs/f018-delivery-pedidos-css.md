# F018 — fatia 5: CSS do esqueleto e da aba Pedidos do Delivery

> Rodada 18 do ciclo. Continuação de `f018-pdv-header-css.md`, `f018-pdv-saldo-css.md`,
> `f018-pdv-modais-css.md` e `f018-pdv-corpo-css.md` — primeira fatia fora do PDV.

## 1. Escopo

Mover para `DeliveryView.css` as declarações de cor e de estado que hoje estão em
`style={{ … }}` nas linhas **148-840** de `src/components/desktop/views/DeliveryView.jsx`
— o componente raiz `DeliveryView` (cabeçalho, abas, área), `AbaPedidos` (barra de topo,
estados vazios, kanban) e `CardPedido` (cartão do pedido) — **sem mudar um pixel do que
aparece na tela**.

São 39 estilos inline hoje; a meta é terminar com no máximo 4, e todos justificados.

## 2. Fora de escopo

- As outras 178 ocorrências de `style={{` do arquivo (linhas 841-2876): `AbaCardapio`,
  `CardProduto`, `ModalProduto`, `AbaComplementos`, `GrupoCardMini`, os seletores,
  `GrupoEditor`, `SeletorProdutosMulti` e `AbaEntrega`. Ficam para as fatias seguintes.
- O helper `inputStyle(sz)` (linha 2870) e seus 21 usos — todos caem fora desta faixa.
  Observação para a próxima fatia: o parâmetro `sz` **não é usado** dentro dele; ele
  devolve só `border`/`background`/`color`, ou seja, é uma classe disfarçada de função.
- Converter `sz.pad` em custom property por breakpoint. O arquivo já fez isso para
  fonte (`--fs-*`/`--lh-*`), então o caminho existe e está provado — mas mexer no
  espaçamento de todas as abas de uma vez é rodada própria, não efeito colateral desta.
- Qualquer mudança de comportamento, de texto, de fluxo ou de regra de negócio.
- As outras 59 ocorrências de `#f59e0b` espalhadas por 30 arquivos (registradas em
  `memory/learnings.md` na rodada 17). Esta fatia trata só a deste arquivo.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`, 🟠 High, em andamento) — separar CSS do JSX.
- **Decisão 018** — estilo não fica acoplado à marcação.
- **Decisão 023 / ADR-007** — cor sempre por CSS Custom Property `--gm-*`; blend com
  alfa por `color-mix`.
- **Decisão 017** (white-label) — nenhuma cor de cliente cravada no código.
- Ledger: `specs/_loop.md`, rodada 17 recomendou exatamente este arquivo.

## 4. Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/desktop/views/DeliveryView.jsx` | linhas 141 e 148-840: `style={{…}}` viram classes/modificadores; `COR_STATUS.amber` vira token |
| `src/components/desktop/views/DeliveryView.css` | recebe as declarações de cor nas classes que **já existem**, mais os modificadores novos |
| `specs/f018-delivery-pedidos-css.md` | este arquivo (resultado da review no fim) |

Nenhum outro arquivo é tocado. Sem migration, sem mudança de schema, sem custo.

## 5. Critérios de aceite

1. **Contagem.** `DeliveryView.jsx` termina com **no máximo 4** ocorrências de `style={{`
   nas linhas 148-840, e cada uma é justificável por uma destas duas razões, apenas:
   (a) carrega um valor de `sz.*` (escala responsiva calculada em JS), ou
   (b) define a custom property `--cor-status`, que é o único jeito de levar uma cor
   calculada em runtime para dentro do CSS.
2. **Nenhuma declaração muda de valor.** Cada `background`, `color`, `border`,
   `opacity`, `font-weight` e `padding` que sai do JSX entra no CSS com o mesmo valor
   renderizado. As conversões de alfa desta fatia, conferidas contra
   `src/constants/colorAlfa.js` (`pct = round(parseInt(hex,16)/255*100)`):
   `"12"` → 7%, `"15"` → 8%, `"16"` → 9%, `"1f"` → 12%, `"33"` → 20%.
3. **Cor dinâmica do status vira custom property.** `baseCorStatus(status)` devolve uma
   entre seis cores. Em vez de seis `style={{ color: cssCor(base) }}` espalhados, a
   coluna do kanban define `--cor-status` uma vez em `.delivery-view__coluna`, e o
   título, a bolinha, o contador e o cartão do pedido (que está dentro da coluna, então
   herda) leem `var(--cor-status)` pelo CSS.
4. **`COR_STATUS.amber` deixa de ser hex.** A linha 141 hoje é `amber: "#f59e0b"`;
   passa a `amber: C.warn`. `--gm-warn` vale exatamente `#f59e0b`
   (`src/styles/tema.css:50`), então **nada muda na tela hoje**.
   *Contradição declarada, como manda o `/spec`:* o comentário de `alfa()` em
   `src/constants/colorAlfa.js` diz que o `#f59e0b` do alerta "não é customizável por
   tenant". Isso está vencido — `warn` está na lista `TOKENS_PERMITIDOS` de
   `src/lib/tema.js`, ou seja, o tenant **pode** sobrescrever. A troca alinha o arquivo
   com a decisão 017. O comentário do `alfa()` continua correto sobre o fallback em si
   (outros 59 hex ainda usam esse caminho) e não é tocado aqui.
5. **Nada de hex novo no CSS.** Nenhuma cor literal entra em `DeliveryView.css` nesta
   fatia, com uma exceção herdada e declarada: o `color: "#fff"` dos dois botões de ação
   do cartão (texto branco sobre a cor do status e sobre o vermelho) **muda de lugar sem
   mudar de valor** — não existe token de "texto sobre cor" no projeto. Fica registrado
   como pendência, na mesma família da proposta `--gm-sobre-accent` que já aguarda o dono.
6. **Zero `currentTarget.style`** nas linhas tocadas — hover e estado ativo vivem em CSS.
7. **Nenhuma classe existente ganha declaração que mude outro trecho do arquivo.**
   Em particular `.delivery-view__btn--sm`, usada em toda a tela, **não** recebe padding:
   quem recebe é cada modificador novo. (Aprendizado da rodada 17: a classe copia a
   ausência também.)
8. **Marcação equivalente.** Fora de `style=`, `className=` e do valor de `--cor-status`,
   o JSX das linhas 148-840 é idêntico ao de `HEAD`. Provável por diff normalizado.
9. **Suíte verde.** `npx vitest run` — todos os arquivos passando, sem teste novo
   quebrado nem pulado.
10. **Build verde.** `npx vite build` conclui sem erro — é o único passo que prova que o
    CSS escrito à mão compila (o vitest não lê CSS).
11. **Sem sujeira.** Nenhum `console.log`, nenhum `TODO` sem justificativa ao lado,
    nenhum segredo, nenhum arquivo fora dos três listados na seção 4.

## 6. Edge cases conhecidos

- **Cartão fora da coluna.** `CardPedido` só é renderizado dentro de
  `.delivery-view__coluna-cards` (linha 661), então herda `--cor-status`. Se um dia for
  usado fora dali, a borda esquerda fica sem cor — por isso o CSS declara um fallback
  na própria variável (`var(--cor-status, var(--gm-muted))`), que é o mesmo cinza do
  status desconhecido em `baseCorStatus`.
- **`color-mix` com var aninhada.** `--cor-status` guarda o texto `var(--gm-blue)`; o
  `color-mix` do contador recebe `var(--cor-status)`. A substituição de custom property
  acontece antes da leitura do valor, então resolve. O build é quem confirma.
- **Emoji do estado vazio tem duas opacidades.** 0.4 quando está carregando e 0.3 nos
  dois estados de erro/vazio. A classe base fica com 0.3 e o carregando ganha um
  modificador — copiar 0.4 para todos seria mudança visual.
- **Dois textos soltos dentro dos itens do pedido** ("Carregando itens…" e "Sem itens
  detalhados.") não têm classe nenhuma hoje, só `style`. Precisam de classe nova.
- **Aba ativa.** O `fontWeight` muda de 500 para 700 entre inativa e ativa; a base
  precisa declarar 500 explicitamente, senão o navegador aplica o peso herdado.

## 7. Definição de "aprovado sem ressalvas"

Todos os 11 critérios em **sim**, `npx vitest run` verde, `npx vite build` verde, sem
`TODO` pendente, sem `console.log` esquecido, e nenhuma regressão visual — que aqui
significa: nenhuma declaração saiu do JSX com um valor renderizado diferente do que
tinha.

---

## 8. Resultado da review (2026-08-02, rodada 18)

**Aprovado sem ressalvas — 11 de 11 critérios em "sim".**
Suíte: `npx vitest run` — 194 arquivos, 3080 testes, verde. Build: `npx vite build` — verde.

Observação de leitura: o arquivo encolheu ~35 linhas durante o build, então a faixa
"148-840" do escopo corresponde hoje às linhas **148-808** (`AbaCardapio`, o primeiro
componente fora de escopo, começa na linha 809).

| # | Critério | Evidência |
|---|---|---|
| 1 | Máximo 4 inline, justificados | 4: linhas 298, 382 e 397 carregam `sz.pad`; linha 632 define `--cor-status` |
| 2 | Nenhuma declaração muda de valor | `"15"`→8%, `"33"`→20%, `"12"`→7%, `"16"`→9%, `"1f"`→12%, conferidos contra `colorAlfa.js` |
| 3 | Cor dinâmica vira custom property | `DeliveryView.jsx:632` define; `DeliveryView.css` lê em `__coluna-titulo`, `__coluna-bolinha`, `__coluna-contador` e `__pedido` (borda esquerda, por herança) |
| 4 | `COR_STATUS.amber` deixa de ser hex | `DeliveryView.jsx:144` = `C.warn`; `colors.js:24` = `--gm-warn`; `tema.css:50` = `#f59e0b`; `tema.js:36` confirma que o tenant sobrescreve |
| 5 | Nada de hex novo no CSS | zero hex na fatia do JSX; no CSS só os dois `#fff` que mudaram de lugar sem mudar de valor |
| 6 | Zero `currentTarget.style` | 0 na faixa 148-808 |
| 7 | Nenhuma classe existente muda outro trecho | `__vazio` (877, 882, 1549), `__vazio-emoji` (878, 883, 1550) e `__vazio-titulo` (884, 1551) carregam inline do mesmo valor para a mesma propriedade — inline vence; `.delivery-view__aviso` base não recebeu nada (só o modificador `--erro` novo); `.delivery-view__btn--sm` **não** recebeu padding |
| 8 | Marcação equivalente | `git diff -U1` do JSX: só `className=`, `style=` e dois comentários mudam |
| 9 | Suíte verde | 194/194, 3080 testes |
| 10 | Build verde | `✓ built in 10.99s` |
| 11 | Sem sujeira | zero `console.log`/`TODO`; `git status` lista só os 3 arquivos da seção 4 |

**Métrica do F018:** `src/` 1842 → **1807**; `DeliveryView.jsx` 217 → **182**.

## 9. Fica para a próxima fatia

- As 182 ocorrências restantes de `DeliveryView.jsx` (linhas 809-2841): `AbaCardapio`,
  `CardProduto`, `ModalProduto`, `AbaComplementos`, os seletores, `GrupoEditor` e
  `AbaEntrega`.
- O helper `inputStyle(sz)` (hoje na linha 2838) e seus 21 usos — o parâmetro `sz` não é
  usado dentro dele; é uma classe disfarçada de função e sai inteiro numa dessas fatias.
- Converter `sz.pad` em custom property por breakpoint, que é o que remove os 3 inline
  que sobraram nesta fatia. Vale para a tela toda, então é rodada própria.
- O `#fff` dos dois botões de ação, junto com a proposta `--gm-sobre-accent`, esperando
  o dono decidir o nome do token de "texto sobre cor cheia".
