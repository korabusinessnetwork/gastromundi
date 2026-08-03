# CONSOLE-UX 28 — o Console no celular

## 1. Escopo

Fazer o Console da Plataforma caber e funcionar num celular de 360–390px de largura:
barra superior que não estoura, campos que não disparam o zoom do iPhone, modais que
não escondem o botão principal atrás da barra do navegador, alvos de toque de tamanho
de dedo, e o nome do estabelecimento legível por inteiro em vez de reticências.

Só CSS, com uma correção de uma linha no JSX (resquício da rodada 53, abaixo).

## 2. Fora de escopo

- PDV e delivery no celular — o Console é a tela desta rodada.
- Reescrever o card do estabelecimento em `grid` ou mudar a hierarquia da informação.
- Menu hambúrguer, gaveta lateral ou qualquer navegação nova.
- Layout de tablet (o corte continua sendo o `max-width: 560px` já usado no arquivo).
- Teste visual automatizado (a suíte roda em jsdom, que não calcula layout).

## 3. Origem e decisões que este item honra

- **F022** (Console da Plataforma) no `docs/09_BACKLOG/features.md` — rodada CONSOLE-UX 28.
- **Princípio nº 1 (intuitividade)**, item "Acessível ao toque: alvos grandes, legível a
  distância".
- **Decisão 018** — CSS separado do JSX; todo o trabalho fica nos `.css`.
- **ADR-007** — tokens `--gm-*`; nenhuma cor nova, nenhum valor hardcodado.
- **Decisão 017 (white-label)** — nada específico de um estabelecimento.

Por que agora: o Console é a ferramenta da venda. O dono cria o estabelecimento na frente
do cliente, e isso acontece de pé, no celular. Hoje o arquivo de 739 linhas tem **uma**
`@media`, cobrindo só o cabeçalho e a fileira de ações; a barra superior, o card, a busca
e os sete modais nunca foram olhados numa tela estreita.

## 4. Arquivos afetados

- `src/pages/console/ConsolePage.css` — barra superior, conteúdo, card, busca, filtros e
  a fileira de ações dentro da `@media` que já existe.
- `src/components/console/NovoEstabelecimentoModal.css` — o shell `.nem-overlay` /
  `.nem-modal` / `.nem-input`, compartilhado pelos **sete** modais do Console.
- `src/pages/console/ConsoleLoginPage.css` — o campo de senha (primeira tela no celular).
- `src/pages/console/ConsolePage.jsx` — uma linha: `onClick={carregar}` → `onClick={() => carregar()}`.

## 5. Critérios de aceite

1. **Sem rolagem horizontal em 360px.** A barra superior encolhe em vez de empurrar a
   página: `.console__marca` e `.console__usuario` podem encolher (`min-width: 0`) e o
   nome do usuário trunca com reticências.
2. **Padding lateral menor no celular.** `.console__conteudo` e `.console__topo` caem de
   24px para ~14px em `max-width: 560px`, devolvendo 20px de largura útil ao conteúdo.
3. **Nenhum campo de texto do Console abaixo de 16px em tela de toque.** `.console__busca-campo`,
   `.nem-input` e o campo do login sobem para 16px na `@media`, porque o Safari do iPhone
   dá zoom na página ao focar um campo menor que isso — e não desfaz o zoom depois.
4. **O shell dos modais usa `dvh`, não `vh`.** `.nem-modal { max-height: 92dvh }`, para o
   rodapé com o botão principal ("Criar estabelecimento", "Confirmar") não ficar embaixo
   da barra do navegador quando ela está expandida.
5. **Overlay com respiro menor no celular.** `.nem-overlay` cai de 16px para 10px de
   padding em `max-width: 480px`, para o formulário não ficar espremido em 328px.
6. **Alvo de toque de no mínimo 44px** nas ações do card (`.console__cobrar` e irmãos) e
   nos filtros de situação, dentro da `@media`.
7. **O nome do estabelecimento não é truncado no celular.** `.console__card-nome` deixa de
   ser `nowrap`/reticências e passa a quebrar linha; o `.console__card` alinha pelo topo.
   Idem para `.console__card-endereco`, cujo slug quebra em vez de perder o final — que é
   justamente o que distingue dois endereços parecidos. Para o nome não quebrar em quatro
   linhas, o ícone decorativo do card (`aria-hidden`, igual em todos) sai em `≤560px`:
   são 52px devolvidos à coluna do nome, que fica com ~187px em vez de ~135px.
8. **Nada de cor, sombra ou valor hardcodado novo**: só tokens `--gm-*` e as unidades
   já usadas no arquivo.
9. **CSS separado do JSX** — nenhum `style=` novo.
10. **Resquício da rodada 53 corrigido**: `ConsolePage.jsx:766` (`onClick={carregar}` no
    "Tentar de novo" do aviso âmbar de planos) passa a `() => carregar()`, senão o evento
    do clique liga o modo silencioso e o dono não vê o "Carregando…".
11. **Suíte verde** — `npx vitest run`.

## 6. Edge cases conhecidos

- Nome de estabelecimento muito longo sem espaços: precisa quebrar mesmo assim
  (`overflow-wrap`), senão volta a empurrar a largura.
- Card sem plano (`t.plano_codigo` nulo): o chip não existe, o layout não pode depender dele.
- Card sem slug: a linha de endereço não é renderizada.
- Faixa de sem conexão (rodadas 26/27) aberta no celular: texto longo e centralizado,
  com o botão "Tentar de novo" — precisa quebrar sem estourar.
- Sete ações no mesmo card (o caso máximo) numa tela de 360px.
- A `@media` existente já mexe em `.console__cabecalho` e nas ações — as regras novas
  entram no mesmo bloco, sem criar um segundo corte concorrente.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios em sim, com evidência no CSS; suíte verde; nenhuma cor hardcodada
nova; nenhum `style=` novo no JSX; e uma verificação visual em 375px de largura da tela
de login (servida de verdade) e do corpo do Console (harness estático com o CSS real),
mostrando que nada estoura na horizontal.

## 8. Resultado da review

Aprovado sem ressalvas — 11 de 11 critérios. Suíte: `npx vitest run` — 201 arquivos /
3524 testes, verde.

| # | Critério | Evidência |
|---|---|---|
| 1 | Sem rolagem horizontal em 360px | `ConsolePage.css:41,47,59` (`min-width: 0`), `:55,64` (reticências), `:46` (ícone não encolhe) |
| 2 | Padding lateral de 24px → 14px | `ConsolePage.css:612-613` |
| 3 | Nenhum campo abaixo de 16px | `ConsolePage.css:625`, `NovoEstabelecimentoModal.css:278`, `ConsoleLoginPage.css` (bloco final) |
| 4 | Modal em `dvh` | `NovoEstabelecimentoModal.css:25` |
| 5 | Overlay com 10px em ≤480 | `NovoEstabelecimentoModal.css:285` |
| 6 | Alvo de toque de 44px | `ConsolePage.css:630-637` |
| 7 | Nome e endereço quebram; ícone sai no celular | `ConsolePage.css:641-672` |
| 8 | Nenhuma cor ou valor hardcodado novo | o diff não introduz nenhuma cor; só `padding`, `font-size`, `min-height`, `display` e `overflow-wrap` |
| 9 | Nenhum `style=` novo | `grep "style=" src/pages/console/ConsolePage.jsx` — nada |
| 10 | Resquício da rodada 53 corrigido | `ConsolePage.jsx:770` — `onClick={() => carregar()}`; `grep "onClick={carregar}"` — nada |
| 11 | Suíte verde | 201 arquivos / 3524 testes |

### Limitação honesta desta rodada

A verificação visual em 375px prevista na seção 7 **não foi feita**. O navegador embutido
não abriu: `preview_start` num `file://` e `navigate` na aba existente estouraram os 300s
de espera, e o Chrome real exigiria escolher entre dois navegadores conectados — uma
pergunta que pararia o loop. Não há Playwright nem Puppeteer no projeto, e a suíte roda
em jsdom, que não calcula layout.

A evidência que sustenta os critérios é, portanto, **leitura do CSS mais aritmética de
largura** em 360px: conteúdo 360 − 28 de padding = 332; card 332 − 28 de padding − 2 de
borda = 302; sem o ícone (40 + 12 de gap) e descontando o chip de plano (~99 + 12), a
coluna do nome fica com ~187px, o que acomoda "Restaurante do Seu Zé" em duas linhas.
Um olho humano numa tela de verdade continua sendo o teste que falta.

## 9. Fica para uma próxima rodada

- PDV e delivery no celular — a mesma passada, na tela que roda o dia inteiro no balcão.
- Card do estabelecimento em `grid`, para o chip do plano não competir com o nome pela largura.
- Layout de tablet (entre 561px e 900px ninguém olhou ainda).
- Verificação visual automatizada (exigiria Playwright — decisão do dono, é peso novo no projeto).
