# CONSOLE-UX 29 — as outras duas abas do Console no celular

## 1. Escopo

Terminar no celular o que a rodada 28 começou: as abas **"Planos e assinaturas"**
(`PlanosDashboard`) e **"Uso e faturamento"** (`AnalyticsDashboard`), mais os três modais
do Console que têm CSS próprio (`HistoricoPagamentosModal`, `AddonsModal`,
`AlterarPlanoModal`). Alvos de toque de tamanho de dedo, nomes de cliente que não viram
reticências, folga lateral menor, tabela que avisa que rola para o lado, e um único corte
de tela em todo o Console.

Só CSS. Nenhum arquivo `.jsx` é tocado nesta rodada.

## 2. Fora de escopo

- PDV e delivery no celular.
- Trocar as duas tabelas por cards no celular (é reescrita de marcação, não é CSS).
- Mudar o que as abas mostram, ordenam ou calculam.
- Layout de tablet.
- Teste visual automatizado.

## 3. Origem e decisões que este item honra

- **F022** (Console da Plataforma) — rodada CONSOLE-UX 29.
- **Princípio nº 1 (intuitividade)** — "Acessível ao toque: alvos grandes, legível a
  distância" e "Consistência total com o design system".
- **Decisão 018** — CSS separado do JSX.
- **ADR-007** — tokens `--gm-*`; nenhuma cor nova.
- **`memory/patterns.md`, "Passada de celular numa tela do Console" (rodada 54)** — esta
  rodada é a aplicação do roteiro registrado lá nas telas que ficaram de fora.

Por que agora: a aba de estabelecimentos foi arrumada na rodada 28, mas quem clica em
"Planos e assinaturas" ou "Uso e faturamento" no mesmo celular cai em 583 linhas de CSS
com três `@media` que só mexem no tamanho de dois números. É onde o dono confere quem
está devendo — a tela da cobrança — e onde ele registra o pagamento com o dedo.

## 4. Arquivos afetados

- `src/components/console/PlanosDashboard.css`
- `src/components/console/AnalyticsDashboard.css`
- `src/components/console/HistoricoPagamentosModal.css` (hoje sem nenhuma `@media`)
- `src/components/console/AlterarPlanoModal.css` (hoje sem nenhuma `@media`)
- `src/components/console/AddonsModal.css` (só o valor do corte)

## 5. Critérios de aceite

1. **Alvo de toque de no mínimo 44px** em `≤560px` nas ações das duas abas:
   `.pdash__preco` (hoje ~22px de altura, e é o botão que abre a edição da mensalidade),
   `.pdash__pagar`, `.pdash__ver`, `.pdash__ok-fechar` (hoje 26×26),
   `.auso__periodo-btn` e `.auso__tentar`.
2. **Alvo de toque de 44px nos modais** em `≤560px`: `.hpm-cancelar` (ação destrutiva —
   cancelar um pagamento — hoje com ~33px) e os botões de linha do `AlterarPlanoModal`.
3. **Nome de cliente não vira reticências no celular.** `.pdash__alerta-nome` e
   `.auso__alerta-nome` passam a quebrar linha (`white-space: normal` +
   `overflow-wrap: anywhere`) em `≤560px`, e o item do alerta empilha
   (`flex-direction: column`, alinhado à esquerda) para o nome usar a linha inteira.
   Mesmo princípio da rodada 28: no celular a informação manda na altura.
4. **Folga lateral menor em `≤560px`**: `.pdash__bloco`, `.pdash__alerta` e
   `.auso__alerta` caem de 18px para 14px de padding horizontal.
5. **A tabela avisa que rola para o lado.** `.pdash__tabela-scroll` e
   `.auso__tabela-caixa` ganham a sombra de rolagem em CSS puro (gradiente com
   `background-attachment: local, local, scroll, scroll`), que aparece só quando existe
   conteúdo escondido e some ao chegar na ponta. Sem isso, num celular a tabela parece
   simplesmente cortada. As cores saem de `color-mix` sobre tokens `--gm-*`.
6. **Um corte de tela só no Console.** O `@media (max-width: 520px)` do `AddonsModal`
   passa a `560px`, igual ao resto do Console — hoje há três valores de corte
   concorrentes (560, 520 e o 480 do respiro do overlay, que é intencional e fica).
7. **Nada de cor, sombra ou valor hardcodado novo** — só tokens `--gm-*` e `color-mix`,
   como o resto dos arquivos. Os literais `#f59e0b` já existentes não são tocados nesta
   rodada.
8. **CSS separado do JSX** — nenhum arquivo `.jsx` modificado, nenhum `style=` novo.
9. **Suíte verde** — `npx vitest run`, 201 arquivos / 3524 testes.

## 6. Edge cases conhecidos

- Alerta de validade com um cliente só, e com dez: o empilhamento não pode virar uma
  parede de texto sem separação entre os itens.
- Tabela com uma linha só: a sombra de rolagem não pode aparecer quando não há o que rolar.
- Estabelecimento sem mensalidade (`.pdash__preco--vazio`, o "—" âmbar): já tem
  `min-width: 34px`; ganhando altura de 44px não pode virar um bloco desproporcional
  dentro da célula.
- Histórico vazio, em erro e carregando: os três estados moram no mesmo modal e nenhum
  pode ganhar 44px de nada (não são alvos de toque).
- Modal de add-ons entre 520px e 560px: passa a empilhar antes do que empilhava; é o
  comportamento desejado, mas precisa continuar legível nessa faixa.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, com evidência de arquivo e linha; suíte verde; nenhuma cor
hardcodada nova; nenhum `.jsx` tocado. A verificação visual em 375px continua sendo o
teste que falta enquanto o navegador da sessão não abrir — se não abrir, a evidência é
leitura do CSS mais aritmética de largura, e a limitação vai registrada na review, como
na rodada 28.

## 8. Resultado da review

Aprovado sem ressalvas — 9 de 9 critérios. Suíte: `npx vitest run` — 201 arquivos /
3524 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | 44px nas ações das duas abas | `PlanosDashboard.css:372` (`.pdash__preco`, agora `inline-flex`), `:375` (`.pdash__pagar`, `.pdash__ver`), `:378` (`.pdash__ok-fechar` 44×44), `AnalyticsDashboard.css:301-302` |
| 2 | 44px nos modais | `HistoricoPagamentosModal.css:179`, `AlterarPlanoModal.css:105` |
| 3 | Nome de cliente quebra em vez de truncar | `PlanosDashboard.css:352-361`, `AnalyticsDashboard.css:288-297` |
| 4 | Folga lateral de 18px para 14px | `PlanosDashboard.css:345-346`, `AnalyticsDashboard.css:283` |
| 5 | Sombra de rolagem nas tabelas | `PlanosDashboard.css:326-335`, `AnalyticsDashboard.css:265-275` — quatro camadas, duas `local` (cobrem) e duas `scroll` (sombra), com `color-mix` sobre `--gm-bg` |
| 6 | Um corte de tela só | `AddonsModal.css:246` — 520px passou a 560px |
| 7 | Nenhuma cor nova hardcodada | as camadas usam `var(--gm-card)` e `color-mix(in srgb, var(--gm-bg) 75%, transparent)`; os `#f59e0b` pré-existentes não foram tocados |
| 8 | Nenhum `.jsx` tocado | `git status` — cinco `.css` e este spec, nada mais |
| 9 | Suíte verde | 201 arquivos / 3524 testes |

Ordem de declaração conferida: `.auso__tabela-caixa` já declarava `background: var(--gm-card)`
na linha 208, e o atalho zera `background-image`; as camadas novas vêm depois no arquivo,
então prevalecem. Mesmo caso do `.pdash__tabela-scroll`.

### Limitação, de novo

Verificação visual em 375px não foi feita — o navegador da sessão continua sem abrir
(rodada 28 gastou 300s duas vezes tentando). A evidência é leitura do CSS mais aritmética
de largura. Duas rodadas seguidas de CSS sem olho humano: vale o dono abrir o Console no
próprio celular antes da venda.

### Achado fora do escopo, não corrigido

`PlanosDashboard.css:5-7`, `AnalyticsDashboard.css:9-11` e o `AssinaturaBanner` dizem, em
comentário, que "o âmbar de carência não tem token `--gm-*`" e por isso usam `#f59e0b`
literal. **O token existe** — `--gm-warn: #f59e0b` está em `src/styles/tema.css:50`. São
oito ocorrências do literal em arquivos do Console, e cada uma delas é uma cor que um
tenant white-label não consegue trocar (decisão 017). Não entra nesta rodada porque o
spec fechou o escopo em celular; fica registrado no backlog.

## 9. Fica para uma próxima rodada

- Trocar os oito `#f59e0b` literais do Console pelo token `--gm-warn` (achado acima).
- As duas tabelas viram cards no celular — resolve de vez a rolagem lateral, mas é
  reescrita de marcação, não CSS.
- PDV e delivery no celular.
- Layout de tablet (entre 561px e 900px).
