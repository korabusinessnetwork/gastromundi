# F018 — PDV, fatia 4: o corpo da tela (fecha o `index.jsx`)

## 1. Escopo

Tirar do JSX do `PDVView` (`src/components/desktop/views/PDVView/index.jsx`, linhas
794–1363) os estilos inline que **não** dependem de valor de runtime, e levá-los para o
`PDVView.css`. São 44 ocorrências de `style={{` no trecho: as **33** que carregam só
literal ou condição booleana saem; as **11** que carregam a escala responsiva (`sz.*`,
`isCel`, `isMob`) ficam, como já ficaram nas fatias 1 e 2.

O trecho cobre o cabeçalho (a parte que a fatia 1 declarou "segue inline por depender de
estado"), o alerta de estoque, o alerta de validade, as abas Mapa/Lista/Comandas/Reservas,
o toast flutuante, a busca de comandas e o corpo com as abas do celular.

Junto sai o último resíduo de cor de cliente cravada neste arquivo fora do `METODOS_COLOR`:
o âmbar `#f59e0b` e o vermelho `#ef4444` escritos à mão nas duas faixas de alerta viram
`var(--gm-warn)` e `var(--gm-red)`, que têm exatamente esses valores em `src/styles/tema.css`.

Depois desta fatia o `PDVView/index.jsx` fica com **20** `style={{}}` — 11 aqui, 9 no
`SaldoModal` — e todos os 20 carregam valor de runtime.

## 2. Fora de escopo

- **Transformar a escala `sz` em CSS Custom Properties.** É o que faria os 20 restantes
  caírem para zero, e é uma mudança de arquitetura de tema (`getSizes(width)` calculado em
  JavaScript vira `--pdv-pad`, `--pdv-gap` no `.pdv__raiz`). Vale uma rodada própria, com
  o efeito medido nas outras telas que usam o mesmo helper.
- Trocar o sistema de responsividade ou acrescentar *media query*.
- `ModalCupomNfce`, `ClienteComandaModal`, `MesaMapView`, `MesaReservasView`,
  `ComandaGrid`, `ProductGrid`, `CartPanel` — componentes próprios, arquivos próprios,
  fatias próprias.
- Unificar os seis overlays de modal (tabela em `specs/f018-pdv-modais-css.md` §6).
- Mudar lógica, consulta, cálculo, texto de tela ou ordem de elemento. Os únicos atributos
  novos no JSX são `className` e `disabled` **não** entra: nenhum botão ganha atributo que
  não tem hoje.
- Criar token novo. O `#fff` sobre a marca continua literal e comentado, como no resto do
  arquivo.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — 🟠 High, em andamento. Fatia 1: rodada 13
  (`specs/f018-pdv-header-css.md`). Fatia 2: rodada 15 (`specs/f018-pdv-saldo-css.md`).
  Fatia 3: rodada 16 (`specs/f018-pdv-modais-css.md`).
- **Decisão 018** — CSS separado do JSX.
- **ADR-007 / decisão 023** — cor por CSS Custom Property; alfa por `color-mix`.
- **Decisão 017** — white-label: a troca de `#f59e0b`/`#ef4444` por token é exatamente o
  que o comentário do `--gm-warn` em `src/styles/tema.css:46-50` já mandava fazer.
- **`memory/patterns.md`** — "`:disabled` só substitui o ternário quando a expressão é a
  mesma" e "Enriquecer classe compartilhada: enumerar os usuários antes, não depois",
  ambos escritos na rodada 16 e diretamente aplicáveis aqui.

## 4. Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/desktop/views/PDVView/index.jsx` | Só as linhas 794–1363: 33 `style={{` viram `className`; os dois `onMouseEnter`/`onMouseLeave` do botão Cliente saem; `#f59e0b` e `#ef4444` viram token |
| `src/components/desktop/views/PDVView/PDVView.css` | Seções novas (alerta, abas, busca, corpo) e as classes da fatia 1 que hoje declaram "segue inline" passam a ter cor, borda e estado |

Nenhum outro arquivo. Nenhum teste alterado.

## 5. Critérios de aceite

1. Restam **exatamente 11** `style={{` entre as linhas 794 e 1363, e **todos os 11**
   carregam `sz.*`, `isCel` ou `isMob`. Eram 44. Cada um dos 11 tem, na classe
   correspondente do CSS, o comentário dizendo o que segue inline e por quê — o padrão que
   as fatias 1 e 2 já usam.
2. Nenhuma declaração muda de valor ao ser movida. Onde havia `alfa(C.x, "NN")`, o CSS traz
   `color-mix(in srgb, var(--gm-x) N%, transparent)` com o N da tabela do §6. Onde havia
   hex de 8 dígitos (`#f59e0b44`), o CSS traz o `color-mix` do token equivalente com a
   mesma percentagem.
3. Nenhuma cor hardcodada sobra no trecho: zero ocorrências de `#f59e0b` e `#ef4444` entre
   794 e 1363, incluindo a prop `color=` do `<LuTriangleAlert>` (linha 1028), que não é
   `style` mas é cor de marca cravada. O `#fff` sobre a cor da marca segue permitido, com
   comentário.
4. Os dois `onMouseEnter`/`onMouseLeave` do botão Cliente (linhas 958–959) são removidos e
   o hover vira `:hover` no CSS, restrito ao estado sem cliente vinculado — o mesmo recorte
   que o `if (!selected?.cliente_id)` faz hoje.
5. `:disabled` só é usado onde a expressão do atributo `disabled` é **idêntica** à condição
   que pintava a declaração. Vale para o botão "Nova Comanda" (`disabled={!caixaAberto}`
   contra `background: caixaAberto ? … : …`, que é a mesma expressão negada). Onde não
   houver `disabled` no elemento, o estado vira modificador de classe — nenhum botão ganha
   atributo `disabled` que não tem hoje.
6. Estado booleano vira gancho nativo de CSS onde existe equivalente exato, e modificador
   de classe onde não existe. Os estados desta fatia: toast visível, retorno do leitor
   (`ok`/erro), scanner aberto, campo do leitor preenchido, cliente vinculado, aba ativa,
   chip vencido/próximo, busca preenchida.
7. As classes compartilhadas pelas **duas** faixas de alerta (`pdv__alerta-label`,
   `-toggle`, `-chip`) só recebem declaração cujo valor é igual nas duas. O que difere
   (âmbar do estoque contra vermelho da validade) fica em modificador. Conferir usuário a
   usuário antes de enriquecer, como a rodada 16 ensinou.
8. Toda classe nova segue o BEM do arquivo, com prefixo do bloco a que pertence
   (`pdv__alerta-`, `pdv__tab-`, `pdv__busca-`, `pdv__corpo-`, `pdv__mobile-tab-`).
9. Nenhuma mudança de lógica: nenhum `useState`, `useEffect`, consulta, cálculo, texto de
   tela ou ordem de elemento alterado. A diferença no JSX fica restrita a `className`,
   `style`, à prop `color=` do critério 3 e à remoção dos dois handlers do critério 4.
10. `npx vitest run` verde (194 arquivos / 3080 testes hoje), nenhum arquivo de teste
    tocado, e `npx vite build` sem erro — o vitest não parseia CSS, então é a build que
    prova que a folha nova compila.
11. Sem `TODO` novo, sem `console.log`, sem arquivo fora do §4. `varColor` e `alfa`
    continuam importados e usados (o `SaldoModal` e os 11 inline dependem deles).

## 6. Edge cases conhecidos

**O campo de busca de comandas e o foco — o mesmo desvio declarado das rodadas 15 e 16.**
A borda inline (`1.5px solid ${buscaComanda ? alfa(C.accent,"88") : "var(--gm-input-border)"}`)
vence hoje a regra de `:focus` do `src/styles/inputs.css`, então este campo também não
mostra foco como o resto do sistema. Movida a borda para a classe, o foco volta a ser do
design system. Diferente dos campos das rodadas 15 e 16, **este não tem estado de erro** —
não há vermelho para preservar e portanto **não** leva `aria-invalid`. O estado
"preenchido" (accent a 53%) vira modificador de classe, não `:placeholder-shown`: o campo
aceita só dígito, mas a condição de hoje é a string não-vazia, e `:placeholder-shown`
não é equivalente a isso quando o valor é apagado por código.

**As duas faixas de alerta são a mesma estrutura com duas cores, e uma delas está cravada.**
O alerta de estoque escreve `#f59e0b` seis vezes (borda, fundo, ícone, label, toggle, chip)
e o de validade já usa `varColor(C.red)` no texto mas `#ef444444` na borda — o arquivo está
metade migrado. As duas viram o mesmo bloco de classes com um modificador de cor
(`--atencao` para o âmbar, `--critico` para o vermelho). Atenção ao chip do alerta de
validade (linha 1100): ele alterna as **duas** cores dentro da mesma lista (`vencido`
vermelho, próximo âmbar), então o modificador é por chip, não por faixa.

**`#f59e0b` e `--gm-warn` são o mesmo valor — a troca é de forma, não de aparência.**
`src/styles/tema.css:50` declara `--gm-warn: #f59e0b` e o comentário ao lado diz, com todas
as letras, que o token existe para substituir esse hex hardcodado. `--gm-red: #ef4444`,
idem (linha 44). A troca não muda um pixel no tema padrão e passa a acompanhar o tenant que
sobrescrever o token, que é o ponto da decisão 017.

**O botão "Nova Comanda" é o caso em que `:disabled` de fato serve.** `disabled={!caixaAberto}`
e `background: caixaAberto ? accent : faint` são a mesma expressão, uma negada. É a
contraprova da armadilha da rodada 16: lá, três botões carregavam uma flag de "salvando" a
mais no `disabled`; aqui não há flag nenhuma. Conferir caractere a caractere antes de
concluir, e não generalizar de um botão para o outro.

**O ícone de busca e o `<LuTriangleAlert>` recebem `className`, não `style`.** `react-icons`
repassa as duas props para o `<svg>`. A prop `color=` do critério 3 continua sendo prop (o
componente a usa para pintar o traço), só troca de literal para `varColor(C.warn)`.

**Toast do cabeçalho contra toast flutuante.** O flutuante (linha 1158) já tem
`pdv__toast--visivel` no `className` e as regras correspondentes no CSS, mas mantém um
`style` inline que redeclara fundo, borda e cor — o inline vence a classe e é por isso que
o bloco `.pdv__toast--flutuante` de hoje só consegue mexer em posição e sombra. Ao tirar o
inline, o fundo que aparece é o **opaco** que a classe precisa declarar (`var(--gm-surface)`),
não o translúcido de `.pdv__toast`; o comentário no JSX explica exatamente por quê e vai
junto para o CSS. O toast do cabeçalho (linha 849) alterna `opacity`/`transform` por estado
e passa a usar o mesmo `--visivel`.

**Percentagens de alfa desta fatia** (`round(0xNN/255×100)`): `0a`→4, `0c`→5, `12`→7,
`18`→9, `44`→27, `88`→53.

**Listas vazias e ramos que somem.** As duas faixas de alerta retornam `null` quando não há
produto crítico/vencendo, e as abas do celular só existem com `isMob`. São ramos que já
existem, continuam iguais, e só trocam de inline para classe.

## 7. Definição de "aprovado sem ressalvas"

11 `style={{` entre 794 e 1363, todos com valor de runtime; os onze critérios em sim;
`npx vitest run` verde e `npx vite build` sem erro; sem `TODO` pendente, sem `console.log`
esquecido; e as únicas diferenças de aparência são a borda de foco da busca de comandas
descrita no §6 — que está aqui porque foi decidida, não porque escapou.

## 8. Resultado da review (2026-08-02, rodada 17)

**Aprovado sem ressalvas, sem nenhuma rodada de correção.** `npx vitest run` verde (194 arquivos
/ 3080 testes, 76,20s) e `npx vite build` limpa (11,10s). `git diff --stat`: dois arquivos, 340
inserções e 161 remoções — `PDVView.css` +311, `index.jsx` 190 linhas trocadas.

| # | Critério | Evidência |
|---|---|---|
| 1 | 11 inline, todos com runtime | 794, 810, 834, 846, 858, 923, 934, 947, 954, 963, 1064 — todas com `sz.*` e/ou `isCel`; arquivo inteiro em 20 (11 + 9 do `SaldoModal`) |
| 2 | Nenhum valor muda | `#f59e0b18`→9%, `#f59e0b44`→27%, `alfa(C.accent,"12")`→7%, `alfa(C.green,"44")`→27%; `font-family: inherit` só onde o inline tinha (abas de cima sim, abas do celular não) |
| 3 | Zero hex de marca no trecho | `awk 'NR>=794 && NR<=1363 && /#f59e0b\|#ef4444/'` não retorna nada; o `color=` do `<LuTriangleAlert>` virou `varColor(C.warn)` |
| 4 | Handlers imperativos removidos | `grep -c currentTarget.style` = 0 no arquivo; recorte virou `.pdv__acao-btn--cliente:not(.pdv__acao-btn--cliente-vinculado):hover` |
| 5 | `:disabled` só onde é idêntico | só o "Nova Comanda" (`!caixaAberto`); nenhum botão ganhou atributo novo |
| 6 | Booleano vira gancho ou modificador | `--visivel`, `--ok`/`--erro`, `--aberto`, `--ativo`, `--cliente-vinculado`, `--ativa`, `--critico`/`--atencao`, `--preenchido` |
| 7 | Compartilhada só com o que é igual | cor do label/toggle no descendente do modificador da faixa; chip com modificador por item, porque a faixa de validade alterna as duas cores na mesma lista |
| 8 | BEM com prefixo do bloco | `pdv__alerta-`, `pdv__tab-`, `pdv__busca-`, `pdv__mobile-tab-`, `pdv__barcode-` |
| 9 | Zero mudança de lógica | JSX do HEAD e do working copy, sem `style=`/`className=`/`color=`/`onMouseEnter=`/`onMouseLeave=`: **0 linhas de diferença** |
| 10 | Suíte e build | acima; nenhum arquivo de teste tocado |
| 11 | Sem `TODO`/`console.`, nada fora do §4 | `git diff -U0` não acusa nenhum dos dois; dois arquivos no `--stat` |

Conjunto de classes conferido nos dois sentidos. Os quatro "órfãos" aparentes são artefato do grep:
`pdv__alerta-chip--` e `pdv__barcode-feedback--` são prefixos de template literal (linhas 878 e 1052)
e `pdv__modal-`/`pdv__saldo-kpi-` vêm de um comentário antigo do próprio CSS (linha 16).

## 9. O que ficou para uma próxima rodada

- **A escala `sz` como CSS Custom Property.** É o que levaria os 20 `style={{}}` restantes do
  arquivo a zero. Continua fora de escopo pelo motivo do §2: mexe no `getSizes(width)` que outras
  telas usam.
- **`METODOS_COLOR` (linha 1918) e `ACTION_TYPE_META.caixa`** seguem com `#10b981`, `#3b82f6`,
  `#8b5cf6` e `#f59e0b` cravados. São dados, não estilo — viram token quando o dono decidir se o
  roxo do débito (`#8b5cf6`, que não é `--gm-accent`) merece token próprio.
- **O `#f59e0b` fora deste arquivo:** 60 ocorrências em 30 arquivos do `src/`, quase metade já
  dentro de `.css` co-localizado. Registrado em `memory/learnings.md` (2026-08-02).
- **`.pdv__lock-desc`** continua com `line-height: 1.6` inline contra o `1.5` da escala — pendência
  de design aberta desde a rodada 13.
- Os seis overlays de modal do PDV seguem sem unificação (tabela em `specs/f018-pdv-modais-css.md` §6).
