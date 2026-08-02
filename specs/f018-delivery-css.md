# F018-DELIVERY-CSS — tirar o estilo de dentro do JSX das telas de checkout do delivery

## 1. Escopo

Mover os oito `style={{ }}` das três telas de checkout do delivery (`CheckoutEntrega`,
`CheckoutPagamento`, `Confirmacao`) e do `KLogo` para arquivos `.css` puros co-localizados, no padrão
que a decisão 023 / ADR-007 fixou, sem alterar uma linha do resultado visual nem do comportamento
das telas.

## 2. Fora de escopo

- **O PDV.** `src/components/desktop/views/PDVView/index.jsx` tem 247 estilos inline e nenhum `.css`
  próprio — é o maior buraco do F018 e merece rodada exclusiva, com os testes de fluxo crítico do
  PDV rodados à parte. Nada aqui encosta nele.
- **A escala de tipografia do `vitrine.css`.** O arquivo ainda usa `font-size: 12px | 15px | 18px |
  22px` fixos em vez dos tokens `--fs-*`/`--lh-*` de `src/styles/tipografia.css` — é a mesma dívida
  do F018 e a fatia natural seguinte, mas mexer nele muda o tamanho do texto em **todas** as telas da
  vitrine (cardápio, produto, sacola, checkout, confirmação), e não só nas três desta rodada. Fica
  registrado no backlog, não construído aqui.
- **Mover para o `.css` as classes que já existem no `vitrine.css`** (`.campo`, `.btn`, `.forma`,
  `.resumo`, `.confirma`, `.linha-sacola__extra`). Elas já estão fora do JSX — já cumprem a decisão
  018. Redistribuí-las entre arquivos é reorganização de CSS, não separação de CSS e JSX.
- **Apagar o `KLogo`.** Ver §6: ele não é importado em lugar nenhum. Apagar componente compartilhado
  é decisão do dono; esta rodada só o deixa no padrão e registra o achado.
- **Os 44 arquivos que já têm `.css` e ainda mantêm `style={{ }}` residual.** A limpeza é por tela,
  como a própria linha do F018 diz.
- **Responsividade nova, layout novo, mudança de espaçamento.** Se um valor muda de lugar, muda com o
  mesmo número.

## 3. Origem e decisões que este item honra

- **Backlog:** `docs/09_BACKLOG/features.md` → **F018** (🟠 High, "Em andamento"), cuja nota "Falta"
  lista exatamente estes quatro arquivos.
- **Decisão 018** (`memory/decisions.md`) — separar CSS do JSX para viabilizar edição de layout a
  longo prazo e customização visual por estabelecimento.
- **Decisão 023 / ADR-007** — o padrão é **`.css` puro co-localizado, mesmo nome do componente**
  (não CSS Modules, não styled-components, sem dependência nova), com cor vinda das CSS Custom
  Properties `--gm-*`.
- **Decisão 017** (SaaS white-label) — a vitrine de delivery é a única superfície que o cliente do
  cliente enxerga; enquanto a cor vive no JSX, ela não pode ser tematizada por tenant.
- **Ledger:** rodada 12, recomendada no fecho da rodada 11 em `specs/_loop.md`.

## 4. Arquivos afetados

**Criados**

- `src/pages/delivery/CheckoutEntrega.css`
- `src/pages/delivery/CheckoutPagamento.css`
- `src/pages/delivery/Confirmacao.css`
- `src/components/shared/KLogo.css`

**Modificados**

- `src/pages/delivery/CheckoutEntrega.jsx` — 2 estilos inline
- `src/pages/delivery/CheckoutPagamento.jsx` — 4 estilos inline
- `src/pages/delivery/Confirmacao.jsx` — 1 estilo inline
- `src/components/shared/KLogo.jsx` — 1 estilo inline (o componente inteiro)
- `docs/09_BACKLOG/features.md` — nota do F018 atualizada (feito no `/aprender`)

Cada `.css` abre com o mesmo cabeçalho de comentário que `SacolaModal.css` já usa: o item, a decisão
e o que o arquivo cobre.

## 5. Critérios de aceite

1. `grep 'style={{' ` retorna **zero** ocorrências em `CheckoutEntrega.jsx`, `CheckoutPagamento.jsx`
   e `Confirmacao.jsx`.
2. `KLogo.jsx` não tem nenhuma regra de aparência inline: sobra apenas a passagem do tamanho recebido
   por prop como CSS Custom Property (`style={{ "--klogo-size": ... }}`), porque `size` é dado de
   runtime e não pode viver no arquivo estático.
3. Cada um dos quatro `.jsx` importa o seu `.css` co-localizado de mesmo nome, com `import
   "./Nome.css"`, no formato que os outros componentes do projeto já usam.
4. Nenhum valor hexadecimal, `rgb()` ou nome de cor literal em nenhum dos quatro `.jsx` **nem** nos
   quatro `.css` novos: toda cor sai de `var(--gm-*)`. Em particular o `color: "#fff"` do `KLogo`
   deixa de existir como hex no JSX.
5. Toda regra nova que sobrescreve uma propriedade de classe já declarada em `vitrine.css` usa
   seletor de **duas classes** (ex.: `.linha-sacola__extra.checkout-pagamento__troco-erro`), de forma
   que a especificidade — e não a ordem em que o Vite concatena os arquivos — decide quem vence.
6. Os valores numéricos são os mesmos de antes, um a um: `margin-top: 6px` onde havia `marginTop: 6`,
   `margin-bottom: 16px` onde havia `marginBottom: 16`, `margin-top: 12px`, `margin-top: 8px`,
   `margin-top: 24px`. Nenhum arredondamento, nenhuma "melhoria" de espaçamento.
7. `KLogo` continua aceitando `size` com o mesmo default (`28`) e derivando dele largura, altura,
   raio (`size * 0.28`) e tamanho de fonte (`size * 0.56`) — via `calc()` sobre a custom property,
   com os mesmos fatores.
8. Nomes de classe seguem o BEM já usado na vitrine (`bloco__elemento--modificador`, em português) e
   não colidem com nenhuma classe existente em `vitrine.css` ou `SacolaModal.css`.
9. Nenhum arquivo de teste é alterado: `CheckoutEntrega.test.jsx`, `CheckoutPagamento.test.jsx`,
   `Confirmacao.test.jsx` passam exatamente como estão hoje — se algum precisasse mudar, o
   comportamento teria mudado junto.
10. `npx vitest run` verde na suíte inteira, sem arquivo a menos.
11. Nenhum arquivo fora da lista do §4 é tocado — em especial `vitrine.css`, `SacolaModal.css`,
    `CardapioPage.jsx` e qualquer coisa sob `PDVView/`.
12. Nenhum `console.log`, nenhum `TODO` sem justificativa escrita ao lado.

Critérios do `CLAUDE.md` que **não** se aplicam a esta rodada, por não haver dado novo: multi-tenant
e RLS, segredos, consulta a tabela sensível, aritmética de dinheiro, tratamento de erro externo,
tela nova. A rodada não cria nem lê dado nenhum.

## 6. Edge cases conhecidos

- **Ordem de carga do CSS (o principal).** As classes dessas telas vivem em `vitrine.css`, importado
  por `CardapioPage.jsx` — o **pai**. Os `.css` novos serão importados pelos filhos, e o Vite não
  garante que o do filho venha depois no bundle. Uma regra de especificidade igual
  (`.checkout-entrega__buscando { margin-top: 6px }` contra `.linha-sacola__extra { margin: 0 0 6px }`)
  pode perder em produção mesmo funcionando em dev. Daí o critério 5.
- **`margin` shorthand contra `margin-top`.** `.linha-sacola__extra` declara `margin: 0 0 6px`, que
  zera o topo. As regras novas precisam declarar `margin-top` explicitamente, não confiar em herança.
- **`KLogo` com `size` fracionário ou zero.** `calc(var(--klogo-size) * 0.28)` aceita qualquer número;
  a unidade tem que ser fixada na hora de escrever a custom property (`${size}px`), senão `calc()`
  recebe um número puro e a regra inteira é descartada em silêncio.
- **`KLogo` órfão.** Nenhum arquivo do repositório o importa (`grep -rn "KLogo" src bot` só encontra a
  própria definição). O trabalho não quebra nada porque nada o usa — e é exatamente por isso que o
  `/aprender` precisa registrar o achado: um componente compartilhado sem nenhum uso ou volta a ser
  usado, ou some, e as duas coisas são decisão do dono.
- **`--gm-alow` com fallback `rgba(124,58,237,0.12)` hardcodado em `vitrine.css`.** Está fora do
  escopo (arquivo não tocado), mas é roxo de marca literal num arquivo white-label. Anotar, não mexer.
- **Tema do tenant.** As cores continuam resolvidas em runtime por custom property; trocar
  `varColor(C.accent)` por `var(--gm-accent)` no CSS mantém o comportamento — inclusive é mais
  direto, porque some a resolução em JS no primeiro paint.

## 7. Definição de "aprovado sem ressalvas"

Todos os doze critérios em sim, `npx vitest run` verde na suíte inteira **sem nenhum teste alterado**,
zero `style={{ }}` de aparência nos quatro componentes, zero cor literal em JSX ou nos CSS novos,
nenhum arquivo tocado fora do §4, e nenhum valor de espaçamento diferente do que estava lá antes.

---

## 8. Resultado da review (2026-08-02)

**11 de 12 critérios em sim; o critério 4 ficou parcial.** Suíte: `npx vitest run` — **194 arquivos /
3080 testes, verde**, nenhum arquivo de teste alterado (`git status` só mostra os 4 `.jsx` do §4 e os
5 arquivos novos).

| # | Resultado | Evidência |
|---|---|---|
| 1 | sim | `grep 'style={{'` nas três telas: zero. Os únicos hits em `src/pages/delivery/` são `SacolaModal.jsx` e `CardapioPage.jsx`, fora do escopo (§2) |
| 2 | sim | `KLogo.jsx:8` — sobra só `style={{ "--klogo-size": ... }}` |
| 3 | sim | `CheckoutEntrega.jsx:23`, `CheckoutPagamento.jsx:8`, `Confirmacao.jsx:6`, `KLogo.jsx:1` |
| 4 | **parcial** | Zero cor literal nos quatro `.jsx` e em três dos quatro `.css`. Sobra `KLogo.css:20` → `color: #fff`. Ver a pendência abaixo |
| 5 | sim | `CheckoutEntrega.css:14,18`; `CheckoutPagamento.css:14,18,23,28`; `Confirmacao.css:13` — todas com duas classes |
| 6 | sim | 6px, 8px (entrega); 16px, 12px, 6px, 6px (pagamento); 24px (confirmação) — os mesmos números de antes |
| 7 | sim | `KLogo.jsx:6` mantém `size = 28`; `KLogo.css:18,22` usam `calc(... * 0.28)` e `calc(... * 0.56)` |
| 8 | sim | `grep` das classes novas em `src/`: só aparecem no par `.jsx`/`.css` de cada tela |
| 9 | sim | `git status --short` não lista nenhum `*.test.jsx` |
| 10 | sim | 194/194 arquivos, 3080/3080 testes |
| 11 | sim | `git status --short` lista exatamente os 4 modificados + 5 novos; `vitrine.css`, `SacolaModal.css`, `CardapioPage.jsx` e `PDVView/` intactos |
| 12 | sim | `grep 'console\.log\|TODO\|FIXME'` nos oito arquivos: zero |

### Pendência de decisão do dono — token de contraste sobre a cor de marca

O `#fff` do `KLogo` saiu do JSX (que é o que a decisão 018 pede) mas continuou literal dentro do
`KLogo.css`, porque **não existe token `--gm-*` para texto por cima do accent**. A lista
`TOKENS_PERMITIDOS` em `src/lib/tema.js` é fechada de propósito e nenhum dos tokens serve:
`--gm-text` é o texto sobre o fundo da página, e `--gm-bg`/`--gm-card` num tenant de tema escuro
viram texto escuro sobre roxo — invisível. O projeto já resolve isso do mesmo jeito em
`vitrine.css:462-465` (`.btn--primario { background: var(--gm-accent); color: #fff; }`), então a
escolha é consistente com o que já está no código, mas **não** satisfaz o critério como foi escrito.

Proposta, pendente de aval: criar `--gm-sobre-accent` (default `#ffffff`) em `src/styles/tema.css`,
adicionar a chave à `TOKENS_PERMITIDOS` para que o tenant possa trocar, e substituir os dois usos
(`KLogo.css` e `.btn--primario`). É mudança de design system, não de tela — fica para rodada própria.

### O que fica para uma próxima rodada

- `PDVView/index.jsx` — 247 estilos inline, rodada exclusiva.
- Escala de tipografia do `vitrine.css` (px fixo → `--fs-*`/`--lh-*`).
- `--gm-alow` com fallback `rgba(124,58,237,0.12)` hardcodado em `vitrine.css:541` — roxo de marca
  literal num arquivo white-label.
- `KLogo` órfão: nenhum arquivo o importa. Apagar ou reusar é decisão do dono.
