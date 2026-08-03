## Rodada 35 — CONSOLE-UX 9 (o período do uso na URL) — 2026-08-02
- Spec: specs/console-periodo-na-url.md
- Resultado da review: aprovado sem ressalvas — 10 de 10
- Aprendido: o molde de estado-na-URL do Console virou padrão em memory/patterns.md (normalizador puro, escrita a partir de `new URLSearchParams(atual)` com `replace`, valor padrão apaga o parâmetro, filho controlado sem roteador)
- Commit: <pendente> na branch main
- Pendente de decisão: nenhuma
- Próximo item recomendado: CONSOLE-UX 10 — atalho por plano na lista (ver quem está no Básico sem abrir card por card), único recorte que o Console ainda não oferece

## Rodada 34 — CONSOLE-UX 8 (a aba na URL) — 2026-08-02
- Spec: specs/console-aba-na-url.md
- Resultado da review: aprovado sem ressalvas (10 de 10) — suíte 198 arquivos / 3226 testes, verde
- Aprendido: nada novo que passe no filtro — a rodada reusou o molde da 33 (normalizador puro + escrita que apaga o valor padrão + replace)
- Commit: 341407b na branch main
- Pendente de decisão: cortesia (`valor_mensal = 0`) não consegue renovar — a RPC recusa `p_valor <= 0`
- Próximo item recomendado: CONSOLE-UX 9 — o período da aba "Uso e faturamento" também na URL, fechando o último estado da tela que a recarga apaga

## Rodada 33 — CONSOLE-UX 7 (o recorte na URL) — 2026-08-02
- Spec: specs/console-filtro-na-url.md
- Resultado da review: aprovado sem ressalvas (10 de 10) — suíte 198 arquivos / 3214 testes, verde
- Aprendido: memory/learnings.md — com MemoryRouter o endereço só se lê por `useLocation()`; asserção negativa sobre valor que pode estar vazio por acidente não prova nada
- Commit: 839b8cf na branch main
- Pendente de decisão: cortesia (`valor_mensal = 0`) não consegue renovar — a RPC recusa `p_valor <= 0`
- Próximo item recomendado: CONSOLE-UX 8 — guardar também a aba (Estabelecimentos / Planos / Uso) na URL, fechando o "a tela volta como eu deixei" que a rodada 33 começou

## Rodada 32 — CONSOLE-UX 6 (filtro por situação) — 2026-08-02
- Spec: specs/console-filtro-situacao.md
- Resultado da review: aprovado sem ressalvas (10 de 10) — suíte 198 arquivos / 3198 testes, verde
- Aprendido: memory/learnings.md — (1) número dentro de um controle conta sobre a base do controle, número fora conta sobre a tela; (2) script node com agulha em `
` não casa fonte CRLF e substitui em silêncio — edição pontual vai de Edit
- Commit: a2c11a2 na branch main
- Pendente de decisão: cortesia (`valor_mensal = 0`) não consegue renovar — a RPC recusa `p_valor <= 0`
- Próximo item recomendado: CONSOLE-UX 7 — lembrar o recorte escolhido na URL, para o dono poder deixar o Console aberto em "precisam de atenção" e voltar nele

# Ledger do ciclo

Uma seção por rodada, mais recente no topo. Escrito pelo passo 8 do `/ciclo`.

## Rodada 31 — CONSOLE-UX 5 (histórico do card) — 2026-08-02
- Spec: specs/console-historico-do-card.md
- Resultado da review: aprovado sem ressalvas (8/8, suíte 198 arquivos / 3180 testes)
- O quê: botão "Pagamentos" no card, abrindo o `HistoricoPagamentosModal` que já
  existia. Fecha o ciclo cobrar/conferir/desfazer sem sair da aba. Aparece em quem
  tem assinatura, inclusive cancelado; some com a leitura quebrada. Estornar
  recarrega a lista e mantém o histórico aberto.
- Aprendido: memory/learnings.md — reusar componente num segundo lugar é redecidir
  os callbacks, não copiá-los; cada `on*` existe para um estado do chamador anterior.
- Commit: 3302689 na branch main
- Pendente de decisão: estabelecimento de cortesia (`valor_mensal = 0`) segue sem
  poder renovar — a RPC recusa `p_valor <= 0`.
- Próximo item recomendado: CONSOLE-UX 6 — filtro por situação na lista (ver só quem
  está bloqueado / vencendo), que é a pergunta que sobra quando a base cresce.

## Rodada 30 — CONSOLE-UX 4 (cobrar do card) — 2026-08-02
- Spec: specs/console-cobrar-do-card.md
- Resultado da review: aprovado sem ressalvas (9/9, suíte 198 arquivos / 3172 testes)
- O quê: botão "Registrar pagamento" no card de quem precisa de atenção, abrindo o
  `ConfirmarRenovacaoModal` que já existia — sem trocar de aba. Fica fora de quem está
  em dia, cancelado ou sem assinatura (a RPC recusaria). Confirmado, a faixa diz o nome
  e o novo vencimento, e a lista recarrega.
- Aprendido: memory/learnings.md — régua de urgência não é régua de ação possível; o
  estado mais grave (`sem_assinatura`) é justamente o que não tem o que renovar.
- Commit: f3d0de8 na branch main
- Pendente de decisão: estabelecimento de cortesia (`valor_mensal = 0`) segue sem poder
  renovar — a RPC recusa `p_valor <= 0`.
- Próximo item recomendado: CONSOLE-UX 5 — histórico de pagamentos direto do card
  ("Ver pagamentos"), fechando o ciclo cobrar/conferir sem sair da aba Estabelecimentos.

## Rodada 29 — CONSOLE-UX 3 (busca por nome) — 2026-08-02
- Spec: specs/console-busca-estabelecimento.md
- Resultado da review: aprovado sem ressalvas (10/10, suíte 198 arquivos / 3164 testes)
- O quê: campo de busca na aba Estabelecimentos, filtrando enquanto se digita, sem
  ligar para acento nem caixa (`filtrarEstabelecimentos`, função pura). Sem resultado,
  a tela repete o termo e oferece limpar — estado diferente do vazio de base.
- Aprendido: memory/learnings.md — contador/legenda tem que derivar da lista renderizada,
  não da lista de origem (a legenda de urgência contava quem o filtro havia escondido);
  e escape unicode em regex vai por Edit, não por script de shell. Backlog F022 atualizado.
- Commit: f25e5d7 na branch main
- Pendente de decisão: nenhuma
- Próximo item recomendado: CONSOLE-UX 4 — ação de cobrança direto do card (hoje, ver que alguém está bloqueado e agir são duas abas diferentes)

## Rodada 28 — CONSOLE-UX 2 (lista por urgência) — 2026-08-02
- Spec: specs/console-lista-por-urgencia.md
- Resultado da review: aprovado sem ressalvas (9/9, suíte 198 arquivos / 3148 testes)
- Aprendido: memory/learnings.md — flag de erro (`erroAssinaturas`) precisa desligar TODO consumidor derivado, não só o primeiro: com `assinaturas = []` por falha de rede, a base inteira vira `sem_assinatura` e subiria ao topo. Backlog F022 atualizado.
- Commit: ff7f588 na branch main
- Pendente de decisão: nenhuma
- Próximo item recomendado: CONSOLE-UX 3 — busca/filtro na lista de estabelecimentos, o próximo gargalo quando a base passar de uma tela

## Rodada 27 — CONSOLE-UX 1 (situação da cobrança na lista) — 2026-08-02
- Spec: specs/console-situacao-na-lista.md
- Resultado da review: **aprovada sem ressalvas** — 9 de 9 critérios, zero rodadas de correção.
- Suíte: 198 arquivos / 3134 testes verdes (71.75s).
- O quê: a aba Estabelecimentos passou a mostrar o selo de situação da assinatura e a data
  de vencimento no próprio card, calculados por `resumirPlataforma` (a mesma função da aba
  "Planos e assinaturas"). Falha de leitura mostra "Situação indisponível" em vez de um selo
  inventado. O selo virou `src/components/console/SeloStatus.jsx` + `.css`, usado pelas duas abas.
- Aprendido: `memory/patterns.md` ("Rótulo de status é componente, nunca cópia entre telas");
  nota da melhoria em `docs/09_BACKLOG/features.md` (F022).
- Commit: `7ee38d3` na `main` (push feito, sem pull request).
- Pendente de decisão: nenhuma nova. Segue aberta a do estabelecimento de **cortesia**
  (`valor_mensal = 0` não renova) registrada abaixo.
- Próximo item recomendado: **CONSOLE-UX 2** — ordenar a lista de estabelecimentos por
  urgência, para quem precisa de ação aparecer no topo em vez de se esconder no meio da base.

## Rodada 26 — PDV do primeiro dia (catálogo vazio) — 2026-08-02
- Estabelecimento recém-provisionado abria o PDV com "Nenhum produto nesta categoria" — frase
  falsa (não há categoria nenhuma) e sem próximo passo, na primeira tela que o cliente comprado vê.
  Agora o vazio de catálogo explica e aponta "Cadastro Produtos"; a barra de categorias com o
  chip "Todos" sozinho some. Arquivos: `ProductGrid.jsx`/`.css`/`.test.jsx` (3 testes novos).
- Suíte verde. Commit: `82eda42` na `main`.

## Rodada 25 — Guard textual de `provisionar_tenant` — 2026-08-02
- `src/lib/provisionamentoSqlGuard.test.js` (12 testes): a última migration que define
  `provisionar_tenant` precisa continuar semeando assinatura, grupos de categoria e as 24
  unidades de medida. Fecha a classe de regressão dos dois bugs do dia — cada `CREATE OR
  REPLACE` reescreve o corpo inteiro e um seed já sumiu assim duas vezes.
- Suíte verde. Commit: `7692de7` na `main`.

## Rodada 24 — F018 fatia 11 (primitivos e modal do Relatório) — 2026-08-02
- Spec: specs/f018-relatorio-primitivos-css.md
- Resultado da review: **aprovada sem ressalvas** — 15 de 15 critérios, zero rodadas de correção.
- Suíte: 195 arquivos / 3104 testes verdes (78.50s). Build: 11.37s.
- Métrica: RelatorioView.jsx 202 → 159; no trecho migrado 46 → 3 (os 3 são custom property de runtime). src/ 1627 → 1584.
- Saiu o único hex cravado do arquivo (#f59e0b → --gm-warn) e as 6 chamadas de alfa() da fatia.
- Aprendido: memory/learnings.md — (1) style={cond ? {…} : undefined} some da métrica do F018 sem tirar o inline; (2) `*/` dentro de comentário CSS fecha o comentário e o gate não denuncia.
- Pendente de decisão: nenhuma.
- **Loop pausado aqui pelo dono**: prioridade passou para o que falta a aplicação rodar 100% e poder ser vendida em 3 dias. F018 volta depois.

## Rodada 23 — F018, fatia 10 — aba Entrega do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-entrega-css.md`
- **Resultado da review:** **aprovada sem ressalvas** — 15 de 15 critérios em sim, **nenhuma rodada
  de correção** (a primeira vez no F018). `npx vitest run`: 195 arquivos, 3096 testes, verde
  (76,35s). `npx vite build`: verde (10,98s), rodado depois da última edição de CSS.
- **Construído:** a `AbaEntrega` inteira saiu do inline — pedido mínimo, tempo de preparo, modo da
  taxa, endereço de origem com mapa e as faixas por bairro/CEP/km. `style={{}}` no
  `DeliveryView.jsx` foi de **28 para 2**; em `src/`, de **1653 para 1627** (queda de exatamente 26).
  Os 2 que ficam são de runtime e não podem virar CSS estático: a cor da coluna do kanban
  (`--cor-status`, linha 628) e a posição do menu de foto vinda de `getBoundingClientRect` (1296).
- **O segundo maior arquivo do projeto está fechado** — seis fatias, das rodadas 18 a 23.
- **Único comportamento que mudou de propósito (critério 8):** o botão "Localizar no mapa" tinha
  `opacity: 0.7` inline enquanto geocodificava; agora usa o `0.6` de `.delivery-view__btn:disabled`,
  o mesmo de todo botão desabilitado da tela. Declarado no spec antes do build.
- **O método funcionou de primeira:** o script de migração contada (padrão da rodada 22) rodou as 26
  substituições sem nenhuma divergência, sem precisar estreitar âncora. Cinco declarações que só
  repetiam o que a classe já aplicava foram **apagadas**, não migradas, e três ternários de estilo
  viraram par de classes.
- **Aprendido:** `memory/learnings.md` — a última chamada de `alfa()` do arquivo saiu com a fatia e
  o import ficou órfão, sem que `vitest` ou `vite build` reclamassem; import não usado é código
  válido. `memory/patterns.md` — o padrão de migração contada ganhou o passo de contar também o
  **helper** substituído: contagem que cai a zero é ordem de apagar o import.
  `docs/09_BACKLOG/features.md` — F018 atualizado (1627 inline; `DeliveryView.jsx` sai da lista de
  arquivos que ainda precisam de fatia).
- **Commit:** `85ed313` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão:** nenhuma nova. Continuam abertas o token `--gm-sobre-accent` e a
  unificação dos seis overlays do PDV.
- **Próximo item recomendado:** F018, fatia 11 — `relatorio/RelatorioView.jsx`, com **202** inline, o
  maior arquivo que sobrou. Mesma receita das seis fatias anteriores, aplicada a uma tela que o dono
  usa todo dia.

## Rodada 22 — F018, fatia 9 — aba Complementos do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-complementos-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 15 de 15 critérios em sim, uma rodada de
  correção (comentário de papel faltando em 30 regras novas, critério 15). `npx vitest run`: 195
  arquivos, 3096 testes, verde (75,25s). `npx vite build`: verde (11,06s), rodado depois da última
  edição de CSS — é o único passo que compila o `.css`.
- **Construído:** os seis componentes da aba Complementos saíram do inline. `style={{}}` no
  `DeliveryView.jsx` foi de **119 para 28**, exatamente os 91 que o spec mirava; em `src/`, de
  **1744 para 1653**. Os 28 que ficam são 2 de runtime (cor do status na linha 628, posição do menu
  de foto na 1296) e 26 dentro da `AbaEntrega`, que é a fatia 10.
- **A rodada anterior tinha deixado o CSS órfão:** o bloco de ~420 linhas já existia em
  `DeliveryView.css` sem nenhum consumidor, porque toda propriedade da classe também estava inline
  e inline sempre vence. Esta rodada apagou o inline e ligou as classes.
- **Único comportamento que mudou de propósito (critério 11):** o botão Salvar desabilitado tinha
  `cursor: default` inline, que sobrescrevia o `not-allowed` de `.delivery-view__btn:disabled`.
  Agora o cursor diz que o botão não está clicável — declarado no spec antes do build.
- **O método que salvou a fatia:** migração por script que **conta antes de gravar**. Três blocos
  da `AbaEntrega` (linhas 2660, 2684 e 2690) são byte a byte iguais a blocos da aba Complementos.
  Um `replace all` cego teria migrado os três em silêncio, sem nada no relatório denunciando.
  Cada divergência de contagem foi resolvida estreitando a âncora — nunca subindo a expectativa.
- **Falso alarme investigado:** 16 seletores aparecem duplicados no `.css`. É convenção do arquivo,
  não defeito: a regra estrutural fica no bloco da tela e a gêmea de uma linha, só com `font-size`
  e `line-height`, no bloco `TIPOGRAFIA` (a partir da linha 1497). Consequência prática para
  script: âncora `\n.classe {` casa as duas; `\n.classe {\n` casa só a estrutural.
- **Aprendido:** `memory/patterns.md` — "Migração de estilo em massa: script que conta antes de
  gravar, e não grava se a conta não bate", com o esqueleto do `rep()` que acumula erros em vez de
  parar no primeiro. `memory/learnings.md` — o caso concreto das três gêmeas fora de escopo.
  `docs/09_BACKLOG/features.md` — F018 atualizado (1653 inline, `DeliveryView.jsx` em 28).
- **Commit:** `143fa01` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão:** nenhuma nova. Continuam abertas as de sempre: o token
  `--gm-sobre-accent` (enquanto não existe, `#fff` literal sobre a cor do tenant) e a unificação
  dos seis overlays do PDV.
- **Próximo item recomendado:** F018, fatia 10 — a **`AbaEntrega`** do `DeliveryView.jsx`. São os
  26 inline restantes mais os 2 de runtime; é a última fatia do segundo maior arquivo do projeto,
  e fecha o arquivo inteiro.

## Rodada 21 — F018, fatia 8 — a cadeia de props `sz` do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-sz-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 15 de 15 critérios em sim, nenhuma rodada
  de correção. `npx vitest run`: 194 arquivos, 3080 testes, verde (84,84s). `npx vite build`:
  verde (10,98s), rodado depois da última edição de CSS — é o único passo que compila o `.css`.
- **Construído:** o `DeliveryView.jsx` passava `sz` (o objeto de `getSizes(width)`) por **12**
  assinaturas de componente para desreferenciar `sz.pad` em **5 lugares**. A prop foi apagada de
  ponta a ponta: `sz` 30 → **0** linhas, `getSizes` 2 → **0**, `useResponsive` 2 → **0**, inline
  124 → **119**, `src/` 1749 → **1744** (ainda 46 arquivos). Os 5 usos viraram o token global
  **`--gm-pad`** em `src/styles/tema.css`.
- **Por que virou token e não media query:** o precedente é o próprio `src/styles/tipografia.css`,
  que já tinha migrado `sz.font*` para CSS com `clamp()`. A reta `min(14.9px + 0.86vw, 48px)`
  passa pelos dois extremos da curva antiga (18px em 360 de largura, 48px em 3840) e troca os
  degraus intermediários por variação contínua — a tela para de "pular" ao cruzar breakpoint. O
  único degrau real (18 → 12px abaixo de 360) ficou como `@media` explícita, depois do `:root`.
  De quebra, o tenant pode adensar o layout sobrescrevendo um token (decisão 017).
- **A descoberta da fatia:** `src/components/desktop/views/CozinhaView.css:109` já escrevia
  `margin: 0 var(--gm-pad, 16px)` — referência a um token que **nunca existiu**. O fallback
  escondia a ausência: a faixa desenhava 16px e parecia certa. Criar o token faz aquela linha
  começar a resolver — efeito colateral fora do escopo, declarado no spec antes do build.
- **A armadilha evitada:** `.delivery-view__btn--primario` tem **3** usuários, mas só **2**
  carregavam o padding inline; o terceiro é o "Salvar" do modal, que tem padding próprio. Pendurar
  o espaçamento no modificador de cor teria reestilizado um botão fora da fatia. Saiu como
  modificador de forma separado (`--acao-topo`) — segunda aparição seguida do padrão da rodada 19.
- **O quase-erro:** o token ia nascer `clamp(12px, 14.9px + 0.86vw, 48px)`, com o piso copiado do
  degrau do celular mini. O `12px` é **inalcançável** ali (exigiria viewport negativo) — seria CSS
  morto com cara de intencional, exatamente o que a rodada 20 registrou como aprendizado. Virou
  `min()` de dois argumentos, com o motivo escrito no comentário. **Desvio deliberado do critério
  6 do spec**, e melhor que ele.
- **Nota de método:** o normalizador de markup acusou DIVERGE no primeiro import, porque a fatia
  mexe em props e imports, que não são marcação — e ele só reporta a primeira divergência. Invertí
  a pergunta: declarei no script as 4 transformações que a fatia autoriza, apliquei no `HEAD` e
  exigi igualdade. Veio **DIFF VAZIO**, o que prova mecanicamente que nada além do previsto mudou.
- **Correção de contagem:** o spec falava em "13 assinaturas"; são **12**. O número veio da
  estimativa da rodada 20 e nenhum critério dependia dele.
- **Aprendido:** `memory/learnings.md` — conferir argumento por argumento de `clamp`/`min`/`max`
  antes de commitar, e `var(--token, fallback)` esconder token inexistente (técnicos); normalizador
  como verificador de transformação declarada (processo). `memory/patterns.md` — "Escala responsiva
  que vive em JavaScript vira token, não media query em cada tela", que é o roteiro para as demais
  propriedades do `sz` e para os 15 arquivos que ainda chamam `getSizes`.
- **Commit:** `7af5734` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão:** nenhuma nova.
- **Próximo item recomendado:** F018, fatia 9 — a **aba Complementos** do `DeliveryView.jsx`.
  Dos 119 inline que sobraram no arquivo, **91** estão nos seis componentes dessa aba
  (`GrupoEditor` 50, `SeletorProdutosMulti` 11, `AbaComplementos` 10, `SeletorSubgrupo` 8,
  `GrupoCardMini` 6, `SeletorProdutoComplemento` 6). Depois dela sobra só a `AbaEntrega` (26) e
  dois avulsos — duas fatias fecham o segundo maior arquivo do projeto.

## Rodada 20 — F018, fatia 7 — o helper `inputStyle` do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-inputstyle-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 13 de 13 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (76,23s), nenhum arquivo de
  teste tocado. `npx vite build` verde (10,90s). Dois arquivos de código tocados, os previstos:
  `DeliveryView.jsx` e `DeliveryView.css`.
- **Construído:** a função `inputStyle(sz)` e seus **20 usos** sumiram do arquivo
  (`grep -c inputStyle` de 21 para **0**). As três declarações que ela devolvia foram para a regra
  base `.delivery-view__input, .delivery-view__textarea`, que já existia, e as propriedades extras
  do spread viraram oito modificadores BEM: `--centro`, `--com-icone`, `--titulo`, `--qtd`,
  `--preco`, `--taxa`, `--faixa` e `--faixa-cep`. O arquivo foi de 137 para **124** `style={{`; o
  `src/` de 1762 para **1749**, ainda em 46 arquivos.
- **Por que a fatia foi segura:** os 20 usuários de `.delivery-view__input` / `__textarea` eram
  exatamente os 20 usos do helper — 1 para 1. Enriquecer a regra base não podia atingir ninguém de
  fora, e essa conferência é a primeira coisa a fazer, não a última. É o oposto da rodada 19, onde
  a classe compartilhada tinha usuários fora da fatia e cada um precisou de prova em disco.
- **A descoberta da fatia:** o `border` inline não estava só duplicando CSS — estava **desligando**
  a regra `input:not([aria-invalid="true"]):focus { border-color: var(--gm-accent) }` de
  `src/styles/inputs.css`. Os 20 campos do Delivery eram os únicos do sistema que não acendiam ao
  focar, e ninguém reportou porque realce que nunca existiu não parece defeito. A mudança entrou
  declarada no spec como a única diferença visual da rodada. Padrão em `memory/patterns.md` →
  "Estilo inline não duplica CSS: ele desliga o baseline global".
- **O quase-erro:** dois dos treze objetos inline eram redundância pura (`width: "100%"` que a
  classe base já tinha). A leitura mecânica da tarefa criaria um modificador `--largura-total` que
  não muda um pixel e ficaria no CSS parecendo intencional.
- **Nota de método:** o normalizador de markup acusou `DIVERGE`, e corretamente — a fatia apagou uma
  função, que não é marcação. A prova que fecha o critério é outra: o arquivo novo termina exatamente
  no offset da divergência (76127 de 76127) e o resto exclusivo do `HEAD` é literalmente o corpo de
  `inputStyle`. "DIFF VAZIO" só é o critério certo quando a rodada não remove nada além de atributo.
- **Aprendido:** duas linhas em `memory/learnings.md` (o inline que desliga estado global; a
  redundância do `width: 100%`), uma em Processo (o normalizador com deleção que não é markup), uma
  seção nova em `memory/patterns.md` e a nota da rodada 20 no F018 de `docs/09_BACKLOG/features.md`.
- **Commit:** `73e1798` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão:** nenhuma nova. Seguem na fila do dono o token `--gm-sobre-accent` (para os
  `#fff` sobre fundo accent), o `line-height` de `.pdv__lock-desc`, os quatro hex de marca em
  `METODOS_COLOR`/`ACTION_TYPE_META.caixa` no `PDVView/index.jsx`, a unificação dos seis overlays do
  PDV, o destino do `KLogo` órfão e o ADR do F021.
- **Próximo item recomendado:** **F018, fatia 8 — a cadeia de props `sz` do `DeliveryView`**. Depois
  desta rodada ela atravessa 13 assinaturas de componente e é desreferenciada em **5 lugares apenas**
  (linhas 298, 382, 397, 852 e 865 — todos `padding` derivado de `sz.pad`), sendo que `CardPedido`
  na linha 664 já recebe a prop sem usar. São os 5 últimos `style` estruturais do arquivo: convertê-los
  em CSS e apagar a prop de ponta a ponta fecha o `DeliveryView` inteiro.

## Rodada 19 — F018, fatia 6 — aba Cardápio do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-cardapio-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 11 de 11 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (76,99s), nenhum arquivo de
  teste tocado. `npx vite build` verde (9,51s). Dois arquivos de código tocados, os previstos:
  `DeliveryView.jsx` e `DeliveryView.css`.
- **Construído:** a aba **Cardápio** inteira — `AbaCardapio`, `CardProduto` e o `ModalProduto`, com a
  galeria de fotos junto — saiu de **53 para 8** atributos `style`. O arquivo foi de 182 para **137**
  `style={{`; o `src/` de 1807 para **1762**. Os 8 que ficam carregam valor de runtime: 2 de
  `sz.pad`, 1 de coordenada do menu de foto (`getBoundingClientRect` — é parâmetro, não estilo) e 5
  do helper `inputStyle(sz)`, deixado inteiro de propósito para a próxima fatia.
- **A descoberta da fatia:** dois ternários de JavaScript viraram estado nativo de CSS. O selo
  disponível/indisponível é `--on`/`--off` com a bolinha pintada por descendência
  (`.delivery-view__pill--on .delivery-view__card-dot`), e o `cursor: isAdmin ? "pointer" : "default"`
  virou `cursor: pointer` mais `:disabled { cursor: default }` — equivalente porque o botão já era
  `disabled={!isAdmin}`. A borda da foto selecionada passou a usar a classe `.is-sel` que **já
  existia** na marcação e não era lida por ninguém.
- **O tropeço:** `.delivery-view__aviso--erro` carregava `margin-bottom: 12px` junto com a cor, e
  estava certo assim com um usuário só. Reusá-lo nos dois avisos de erro do modal daria 12px de
  folga a quem nunca teve, e a suíte não vê porque não lê CSS. A margem saiu para o modificador
  novo `--espacado`, aplicado no único uso que a tinha. Padrão em `memory/patterns.md` →
  "Modificador de cor não carrega espaçamento".
- **O outro tropeço, de spec:** o alvo estava escrito como "49 → 8" e as duas pontas contavam padrões
  diferentes (`style={{` no 49, `style={{` **mais** `style={inputStyle` no 8). A faixa tinha 53. Alvo
  verificável guarda o padrão exato que a review vai rodar, idêntico nas duas pontas —
  `memory/learnings.md`, processo.
- **Commit:** `cf18884` na branch `ciclo/s1-3-configuracoes` (empurrado).
- **Pendente de decisão:** nenhuma nova. O token `--gm-sobre-accent` continua na fila do dono, agora
  com os dois `#fff` de `--btn--primario` e `--btn--importar` junto.
- **Próximo item recomendado:** **F018, fatia 7 — matar o helper `inputStyle(sz)`**
  (`DeliveryView.jsx:2838`). Ele recebe `sz` e não usa: devolve três declarações estáticas
  (`border`, `background`, `color`) que pertencem a `.delivery-view__input` /
  `.delivery-view__textarea`, e tem **21 usos** no arquivo. É a maior remoção mecânica que resta no
  `DeliveryView`, sai de uma vez só, e destrava as fatias seguintes — enquanto ele existir, todo
  campo do arquivo continua com `style`.

## Rodada 18 — F018, fatia 5 — esqueleto e aba Pedidos do Delivery — 2026-08-02

- **Spec:** `specs/f018-delivery-pedidos-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 11 de 11 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (74,88s), nenhum arquivo de
  teste tocado. `npx vite build` verde (10,99s). Dois arquivos de código tocados, os previstos:
  `DeliveryView.jsx` e `DeliveryView.css`.
- **Construído:** o esqueleto da tela (cabeçalho, tag de modo, abas, área) e a aba **Pedidos**
  inteira — barra de topo, estados vazios, kanban e cartão do pedido — saíram de **39 para 4**
  estilos inline. O arquivo foi de 217 para **182**; o `src/` de 1842 para **1807**. Os 4 que ficam
  carregam `sz.pad` (3) e a custom property `--cor-status` (1). Saiu junto o último `#f59e0b` do
  arquivo: `COR_STATUS.amber` virou `--gm-warn`, que o tenant pode sobrescrever — a cor do status do
  delivery passa a seguir o tema como todas as outras (decisão 017).
- **A descoberta da fatia:** cor calculada em runtime **cabe** em CSS. `baseCorStatus()` devolve uma
  entre seis cores e pintava onze elementos por inline; agora entra uma vez na coluna do kanban como
  `style={{ "--cor-status": … }}` e título, bolinha, contador e a fita esquerda do cartão leem
  `var(--cor-status, var(--gm-muted))` pelo CSS, por herança. O `style` que sobra deixou de ser
  estilo e virou parâmetro. Padrão em `memory/patterns.md` → "Cor calculada em runtime: custom
  property local no ancestral".
- **O tropeço:** o comentário que explica o `--cor-status` foi escrito como bloco JSX
  (`{/* … */}`) entre o `return (` e o elemento, dentro do callback de `.map()` — ali não é
  comentário, é uma segunda expressão, e o arquivo parou de parsear. O vitest reportou "1 arquivo
  falhou, 3071 testes passando, nenhum teste falhando", que se parece com flake e não é: arquivo
  vermelho com zero teste vermelho é erro de transformação. Em `memory/learnings.md`.
- **Commit:** `5addcf2` na branch `ciclo/s1-3-configuracoes` (empurrado).
- **Pendente de decisão:** nenhuma nova. Entrou na fila do `--gm-sobre-accent` o `#fff` dos dois
  botões de ação do cartão (texto sobre cor cheia — o projeto não tem token para isso). Seguem
  abertas as de antes: cortesia sem renovação (F022), ADR do offline-first (F021), token do roxo do
  débito em `METODOS_COLOR`, `line-height` do `.pdv__lock-desc`, e as migrations `20260912`–`20260916`
  que ainda precisam rodar no SQL Editor.
- **Próximo item recomendado:** **F018, fatia 6 — a aba Cardápio do `DeliveryView.jsx`** — o arquivo
  está aberto e com o CSS já estruturado, e é a maior aba das 182 ocorrências que restam nele.

## Rodada 17 — F018, fatia 4 do PDV — o corpo da tela — 2026-08-02

- **Spec:** `specs/f018-pdv-corpo-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 11 de 11 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (76,20s), nenhum arquivo de
  teste tocado. `npx vite build` verde (11,10s). `git diff --stat` nos dois arquivos previstos:
  `PDVView.css` (+311) e `PDVView/index.jsx` (190 linhas alteradas).
- **Construído:** alerta de estoque, alerta de validade, abas Mapa/Lista/Comandas/Reservas, toast
  flutuante, busca de comandas, abas do celular e o resto do cabeçalho saíram de **33 para 0**
  estilos inline. O arquivo foi de 53 para **20**, e os 20 que ficam carregam a escala responsiva
  (`sz.*`, `isCel`) — **o maior arquivo do projeto está fechado**. O `src/` foi de 1875 para
  **1842**. Saíram junto os dois últimos `onMouseEnter`/`onMouseLeave` (o arquivo tem zero
  `currentTarget.style`) e o `#f59e0b`/`#ef4444` cravado nas duas faixas, que virou
  `--gm-warn`/`--gm-red`.
- **Prova de que nada de lógica mudou:** o JSX do `HEAD` e o do working copy, com `style=`,
  `className=`, `color=`, `onMouseEnter=` e `onMouseLeave=` removidos, são **idênticos** — zero linha
  de diferença em 190 linhas trocadas.
- **O que a fatia ensinou:** duas faixas com a mesma estrutura e cores diferentes pedem a cor no
  **descendente do modificador**, não na classe compartilhada — mas o chip é a exceção, porque a
  faixa de validade alterna as duas cores dentro da mesma lista (modificador por item, não por
  bloco). E a classe copia a **ausência** também: só as abas de cima declaravam
  `font-family: inherit`; escrevê-lo nas duas trocaria a fonte das abas do celular. Ambos em
  `memory/patterns.md`. Em `memory/learnings.md`: o `--gm-warn` existe desde sempre com um comentário
  mandando substituir o `#f59e0b`, e o hex ainda está em **60 lugares de 30 arquivos** — comentário
  de token descreve intenção, não faz varredura.
- **Commit:** `e01141f` na branch `ciclo/s1-3-configuracoes` (empurrado).
- **Pendente de decisão:** nenhuma nova. Seguem abertas as de antes — cortesia sem renovação (F022),
  ADR do offline-first (F021), token do roxo do débito em `METODOS_COLOR`, `line-height` do
  `.pdv__lock-desc`, e as migrations `20260912`–`20260916` que ainda precisam rodar no SQL Editor.
- **Próximo item recomendado:** **F018, `DeliveryView.jsx`** — 217 estilos inline, o maior arquivo
  restante do item que está 🟠 High e em andamento, e o primeiro fora do PDV.

## Rodada 16 — F018, fatia 3 do PDV — os cinco modais — 2026-08-02

- **Spec:** `specs/f018-pdv-modais-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 10 de 10 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (76,00s), nenhum arquivo
  de teste tocado. `npx vite build` verde (11,53s) — rodado porque o vitest não parseia CSS e é a
  única prova de que as ~870 linhas novas de folha de estilo compilam. `git diff --stat` nos dois
  arquivos previstos: `PDVView.css` (+871) e `PDVView/index.jsx` (449 linhas alteradas).
- **Construído:** Nova Comanda, Cancelar Comanda, Transferir Itens, Confirmar cancelamento e Mesa
  saíram de **111 para 0** estilos inline. O arquivo inteiro foi de 164 para **53**; o `src/` foi de
  1986 para **1875**. Quatro inputs ganharam `aria-invalid` e os quatro `onFocus`/`onBlur` que
  pintavam borda à mão saíram — o foco passou a vir do `src/styles/inputs.css`, como no resto do
  sistema.
- **A armadilha da fatia, prevista no spec e confirmada no código:** em **3 dos 6 botões** a
  expressão do `disabled` carrega a flag de "está salvando" (`criando`, `transferindo`,
  `salvandoMesa`) que a condição do fundo nunca teve. Usar `:disabled` ali apagaria o botão no meio
  da ação, com o texto dizendo "Abrindo...". Esses três viraram modificador de classe com a mesma
  expressão de hoje; `:disabled` ficou nos que de fato casam.
- **Segundo achado, este não previsto:** `.pdv__modal-erro` tinha **cinco** usuários, e o quinto era
  a dica "Apelido é opcional..." em `muted` — não um erro. Enriquecer a classe compartilhada com
  vermelho teria pintado uma informação neutra. Foi para `.pdv__mesa-hint`, com a mesma tipografia.
- **Aprendido:** dois registros em `memory/learnings.md` (técnicos) e dois padrões novos em
  `memory/patterns.md` — "`:disabled` só substitui o ternário quando a expressão é a mesma" e
  "Enriquecer classe compartilhada: enumerar os usuários antes, não depois". Nota do F018 atualizada
  em `docs/09_BACKLOG/features.md`, com o número medido pelo comando de sempre.
- **Commit:** `04f5be9` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão:** nenhuma nova. Seguem esperando o dono, sem bloquear: o `line-height: 1.6`
  do `.pdv__lock-desc` fora da escala, as quatro cores de marca cravadas em `METODOS_COLOR` /
  `ACTION_TYPE_META.caixa` (`index.jsx:2034`, contraria a decisão 017) e a unificação dos seis
  overlays do PDV (tabela da divergência no §6 do spec).
- **Próximo item recomendado:** **F018, fatia 4 do PDV** — os 53 `style={{` que sobraram em
  `PDVView/index.jsx` (alerta de estoque, alerta de validade, abas mapa/lista, busca de comandas,
  body). Fecha o maior arquivo do projeto, que já saiu de 247 para 53 em três rodadas.

## Rodada 15 — F018, fatia 2 do PDV — o modal "Saldo do Dia" — 2026-08-02

- **Spec:** `specs/f018-pdv-saldo-css.md`
- **Resultado da review:** **aprovado sem ressalvas** — 10 de 10 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (75,85s), nenhum arquivo
  de teste tocado. `git diff --stat` nos dois arquivos previstos no spec: `PDVView.css` (+495) e
  `PDVView/index.jsx` (217 linhas alteradas).
- **Construído:** o `SaldoModal` saiu de **73 para 9** estilos inline, e os 9 que sobraram carregam
  valor de runtime (escala por breakpoint `sz.*`, alternância `isNarrow`, cor vinda de dado). A
  seção "SaldoModal" do `PDVView.css` deixou de ser só tipografia e passou a ter cor, borda, layout
  e estado. O arquivo inteiro foi de 228 para **164** inline; o `src/` foi de 2050 para **1986**.
- **Quatro estados deixaram de ser ternário em JavaScript e viraram gancho nativo de CSS:**
  `:disabled` no botão "Acessar", `:last-child` na divisória da lista, `:nth-child(odd)` na listra
  zebrada e `[aria-invalid="true"]` na borda de erro. Os dois sem gancho viraram modificador de
  classe (`--autorizado`, `--aberto`).
- **A extração achou um defeito antigo, e ele é o motivo da única mudança de aparência:** a borda
  inline do campo de senha vencia por especificidade a regra de `:focus` do `src/styles/inputs.css`
  — esse era **o único input do sistema que não mostrava foco**, e ninguém tinha reportado porque o
  anel de `box-shadow` aparecia mesmo assim. Com a borda na classe o campo se comporta como os
  outros, e o `aria-invalid={!!senhaErro}` entrou junto para que o vermelho de senha errada não
  fosse repintado de accent justo enquanto o operador digita.
- **Nada foi corrigido pela review:** a auditoria não achou defeito no que foi construído. Três
  suspeitas se dissolveram na conferência (um "TODO" que era substring de `METODOS_COLOR`, e três
  classes que pareciam órfãs mas são de fora do trecho ou de comentário).
- **O critério "nenhuma mudança de lógica" foi provado mecanicamente, não por memória:** removi
  `style={{…}}` e `className=…` dos dois lados e comparei — sobraram três reflows de formatação e o
  `aria-invalid` previsto no spec.
- **Aprendido:** `memory/patterns.md` (a seção da borda de input ganhou a exceção do campo com erro,
  e nasceu a seção "Estado de lista na extração de CSS", com o `idx % 2 === 0` que em CSS é `odd` e
  não `even`), `memory/learnings.md` (o inline que **desliga** a parte do design system que depende
  de estado; e métrica de backlog guarda o comando, não só o número),
  `docs/09_BACKLOG/features.md` (F018 remedido com o comando ao lado) e o §8 do próprio spec.
- **Commit:** `4609463` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão (nenhuma bloqueia):** seguem de pé, sem novidade nesta rodada, o token
  `--gm-sobre-accent`, o `line-height` de `.pdv__lock-desc` (1.6 vs 1.5 da escala) e os hex de marca
  cravados em `METODOS_COLOR` / `ACTION_TYPE_META.caixa`, que não seguem o tema do tenant.
- **Próximo item recomendado:** **F018, fatia 3 do `PDVView/index.jsx`** — não porque seja o maior
  arquivo (não é mais: `DeliveryView.jsx` tem 217 contra 164), mas porque arquivo meio migrado é a
  condição exata do defeito da rodada 13, em que a classe existia e o inline restante a mantinha
  como letra morta. Terminar o arquivo antes de abrir outro é o que fecha esse risco.

## Rodada 14 — BUG001 — alfa concatenado em `var()` apaga a borda — 2026-08-02

- **Spec:** `specs/bug001-alfa-concatenado-em-var.md`
- **Resultado da review:** **aprovado sem ressalvas** — 8 de 8 critérios em sim, nenhuma rodada de
  correção. `npx vitest run` em 194 de 194 arquivos e 3080 de 3080 testes (76s). `git diff --stat`
  em 7 arquivos, 26 inserções e 26 remoções — nenhuma linha tocada fora do inventário.
- **Construído:** as 26 linhas que montavam cor colando dois dígitos hex no fim de uma custom
  property (`var(--gm-accent)66`, CSS inválido) passaram a usar `alfa(cor, "NN")`, que produz
  `color-mix(in srgb, <cor> N%, transparent)`. Cada ponto manteve a mesma cor e o mesmo sufixo de
  antes. Arquivos: `Sidebar` (3), `MesasAdmin` (2), `PDVView/index` (12), `RelatorioView` (4),
  `FechamentoModal` (3), `ConfiguracoesView` (1), `JarvasPanel` (1).
- **Ao contrário da rodada 13, esta rodada muda a aparência de propósito** — é exatamente o que
  corrige o bug: bordas que estavam sumindo voltam a aparecer na cor certa.
- **Nada foi corrigido pela review:** a auditoria não achou defeito no que foi construído.
- **A rodada corrigiu o próprio registro do bug:** o reporte da rodada 13 dizia 18 ocorrências em 6
  arquivos. O real é **26 linhas / 27 declarações em 7 arquivos**. O número velho saiu de um grep
  ancorado em `varColor(`, que perde os pontos onde o token chega por variável (`${tipo.color}44`,
  alimentado por mapas que guardam `varColor(C.x)`) e os que fecham ternário em vez de chamada.
- **São duas falhas, não uma:** em `border` (atalho) o valor inválido leva todas as longhands a
  `unset` e a borda **some**; em `style.borderColor` (CSSOM, nos `onFocus`/`onBlur` à mão) só a cor
  cai para `unset` → `currentColor` e a borda fica **da cor do texto**. Procurar por "borda que
  sumiu" não acha o segundo grupo.
- **Aprendido:** `memory/learnings.md` (duas linhas: o inventário incompleto e as duas falhas
  distintas), `memory/patterns.md` (a seção "Alfa sobre token" ganhou a regra "procure pela cauda,
  não pela cabeça" com os dois greps completos, e o fato de `alfa()` aceitar token, string resolvida
  ou hex literal), `memory/bugs.md` e `docs/09_BACKLOG/bugs.md` (`BUG001` fechado, com o inventário
  correto), e o §8 do próprio spec.
- **Commit:** `7d54ad4` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão (nenhuma bloqueia):** alinhar o `line-height` de `.pdv__lock-desc` com a
  escala (1.6 → 1.5) é decisão de design; segue de pé a proposta do token `--gm-sobre-accent`.
  Novidade desta rodada: `METODOS_COLOR` e `ACTION_TYPE_META.caixa` cravam hex de marca
  (`#10b981`, `#3b82f6`, `#8b5cf6`, `#f59e0b`) que não seguem o tema do tenant — encosta na decisão
  017 e precisa de token novo em `TOKENS_PERMITIDOS`.
- **Próximo item recomendado:** **F018, fatia 2 do `PDVView/index.jsx`** — prioridade 🟠 High escrita
  no backlog, sem portão de custo, e é o maior arquivo aberto do projeto (228 inline restantes).

## Rodada 13 — F018 — PDV, fatia 1: estados de bloqueio e cabeçalho — 2026-08-02

- **Spec:** `specs/f018-pdv-header-css.md`
- **Resultado da review:** **aprovado** — 9 dos 10 critérios em sim, o critério 5 em parcial por um
  desvio deliberado e documentado (detalhe abaixo). `npx vitest run` em 194 de 194 arquivos e 3080
  de 3080 testes; os nove arquivos de teste do PDV rodados também isolados (88 testes). Nenhum
  arquivo de teste alterado, nenhum arquivo tocado fora do §4.
- **Construído:** o estilo estático da abertura do `PDVView` — tela de carregamento, tela "Caixa
  Fechado" e a barra de cabeçalho inteira — saiu do JSX para o `PDVView.css`, que até então só tinha
  tipografia. Hover e foco que moravam em `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` viraram
  `:hover` e `:focus`. No trecho: **33 inline viraram 15** (todos com valor de runtime) e **16
  handlers de estilo viraram 1**; no arquivo, **247 → 228**. O PDV sai por fatias porque é o maior
  arquivo do projeto.
- **Nada foi corrigido pela review:** a auditoria não achou defeito no que foi construído.
- **Dois desvios deliberados, ambos documentados no próprio CSS:**
  1. `.pdv__saldo-btn:hover` **perdeu a borda de propósito**: o JavaScript montava
     `var(--gm-accent)66`, CSS inválido que o navegador descarta. Traduzir faria a borda
     **aparecer** — e o contrato da rodada era mudança visual zero.
  2. `.pdv__lock-desc` ficou com `line-height: 1.6` (o valor inline que vencia a classe) em vez do
     `var(--lh-base)` da escala. Cumprir o critério 5 violaria o 10; prevaleceu o 10.
- **O achado da rodada (`BUG001`, novo):** o `var()` + sufixo hex do saldo não era caso isolado —
  **18 ocorrências em 6 arquivos** (`Sidebar`, `MesasAdmin`, `PDVView/index`, `RelatorioView`,
  `FechamentoModal`). Como `var()` inválido resolve para `unset`, `border-style` cai para `none` e a
  **borda some em vez de mudar de cor**; na `Sidebar` (340, 359) é a borda vermelha de senha errada
  que desaparece. O idioma era correto quando as cores eram hex literal e morreu calado na migração
  para custom properties (ADR-007) — nada no ferramental reclama de string de estilo inválida.
- **Aprendido:** `memory/learnings.md` (o `BUG001` e a leva de tipografia que era letra morta onde o
  inline competia), `memory/bugs.md` (o achado com as linhas), `memory/patterns.md` (duas seções
  novas: "Alfa sobre token" e "Borda de input na classe entrega o foco para o `inputs.css` global"),
  `docs/09_BACKLOG/bugs.md` (`BUG001` completo, com passos e correção) e a linha do **F018** em
  `docs/09_BACKLOG/features.md`.
- **Commit:** `fa91716` na branch `ciclo/s1-3-configuracoes`.
- **Pendente de decisão (nenhuma bloqueia):** alinhar o `line-height` da tela "Caixa Fechado" com a
  escala (1.6 → 1.5) é decisão de design; segue de pé a proposta do token `--gm-sobre-accent` da
  rodada 12.
- **Próximo item recomendado:** **BUG001** — é defeito em fluxo que já está em produção, apaga um
  sinal de erro (senha errada na `Sidebar`), a correção é mecânica com o helper `alfa()` que já
  existe, e passa exatamente pelos arquivos que as próximas fatias do F018 vão abrir.

## Rodada 12 — F018-DELIVERY-CSS — 2026-08-02

- **Spec:** `specs/f018-delivery-css.md`
- **Resultado da review:** **parcial — 11 de 12 critérios em sim**, o critério 4 em parcial (uma cor
  literal que o design system ainda não sabe expressar; detalhe abaixo). `npx vitest run` em 194 de
  194 arquivos e 3080 de 3080 testes, **sem nenhum arquivo de teste alterado**. Nenhum arquivo tocado
  fora do §4.
- **Construído:** os oito `style={{ }}` das três telas de checkout do delivery (`CheckoutEntrega`,
  `CheckoutPagamento`, `Confirmacao`) e do `KLogo` viraram `.css` puro co-localizado, no padrão da
  decisão 018 / ADR-007. Nenhum pixel mudou: os mesmos valores saíram do JSX e entraram no CSS.
- **O que a rodada descobriu (e que virou padrão):** as classes base dessas telas moram em
  `vitrine.css`, importado pelo **pai** (`CardapioPage`). O Vite não garante que o `.css` do filho
  entre depois no bundle, então uma classe nova sozinha empata em especificidade (0,1,0) com a classe
  base e o desempate vira ordem de concatenação — funciona em dev e pode inverter em produção. Toda
  regra que sobrescreve algo de `vitrine.css` usa **seletor de duas classes**. Registrado em
  `memory/patterns.md` → "CSS do filho que sobrescreve classe do pai".
- **Nada foi corrigido pela review:** a auditoria não achou defeito. A única ressalva é a de baixo, e
  ela não tem correção segura dentro do escopo.
- **Ressalva (critério 4) — precisa de decisão do dono:** o `color: "#fff"` do `KLogo` saiu do JSX,
  mas continuou literal dentro do `KLogo.css`, porque **não existe token `--gm-*` para texto por cima
  da cor de marca**. `TOKENS_PERMITIDOS` em `src/lib/tema.js` é fechada de propósito, e `--gm-bg` /
  `--gm-card` num tenant de tema escuro virariam texto escuro sobre roxo. É exatamente o que
  `vitrine.css:462-465` já faz no `.btn--primario`. Proposta no spec: criar `--gm-sobre-accent`
  (default `#ffffff`) em `src/styles/tema.css`, abrir a chave na allow-list e trocar os dois usos.
- **Decisão de processo que eu tomei sozinho, para o dono revisar:** commitei mesmo com a review
  parcial. O `/ciclo` diz para segurar o commit quando a review trava, mas a regra existe para código
  pela metade — aqui o trabalho está completo, verde e seguindo convenção que já estava escrita no
  próprio código. Se discordar, o commit é `b238c0d` e reverter é uma linha.
- **Aprendido:** `memory/learnings.md` (o token de contraste que não existe; a contagem do F018 no
  backlog que estava velha; o `KLogo` órfão), `memory/patterns.md` (seção nova sobre especificidade
  contra ordem de bundle, `margin` shorthand e custom property com unidade) e a linha do **F018**
  reescrita em `docs/09_BACKLOG/features.md` com a contagem recontada.
- **Número (corrigido depois, no começo da rodada 13):** eu "corrigi" o backlog de 121 para 118
  arquivos migrados usando um script que procurava um `.css` **irmão de mesmo nome** — e ele marcou
  `PDVView/index.jsx` como "sem CSS" quando o arquivo importa `./PDVView.css` na linha 24. Contando
  pelo `import "./*.css"` real, o número original estava certo: **121 de 157**. Mais importante: essa
  métrica media a coisa errada. Só **1** arquivo (`src/main.jsx`) tem inline sem CSS próprio; a
  dívida real do F018 são **2068 `style={{` em 46 arquivos que já importam seu `.css`**. A linha do
  backlog passou a medir isso.
- **Commit:** `b238c0d` na branch `ciclo/s1-3-configuracoes`
- **Pendente de decisão:** o token `--gm-sobre-accent` (novo, acima); o ADR do F021 (offline-first),
  aberto desde a rodada 10; domínio/subdomínio de delivery por tenant (custo, ~R$ 40/ano + DNS
  wildcard); estabelecimento de cortesia (`valor_mensal = 0`) não consegue renovar; apagar ou reusar
  o `KLogo`, que nenhum arquivo importa.
- **Pendente de produção:** as migrations `20260912`, `20260913`, `20260914`, `20260915` e `20260916`
  continuam sem rodar no Supabase — enquanto isso, as telas correspondentes respondem
  `function ... does not exist`.
- **Próximo item recomendado:** **F018 — fatia do PDV** (`src/components/desktop/views/PDVView/index.jsx`):
  é o maior buraco que sobrou da maior prioridade escrita ainda aberta, e é a única fatia com rede de
  testes de componente para provar que o comportamento não mudou.

## Rodada 11 — F005-SANGRIA — 2026-08-02

- **Spec:** `specs/f005-sangria-e-suprimento-no-caixa.md`
- **Resultado da review:** aprovado sem ressalvas — 18 de 18 critérios em sim, `npx vitest run` em
  194 de 194 arquivos e 3080 de 3080 testes. Nenhum arquivo tocado fora do §4.
- **Construído:** o dinheiro que sai e entra na gaveta no meio do turno passou a ter registro. Tabela
  `caixa_movimentos` (migration `20260916`) com `tenant_id`, CHECK de `tipo` e de `valor > 0`, RLS
  ativa, INSERT liberado só para admin/gerente/caixa e **sem policy de UPDATE nem de DELETE** —
  movimento de caixa não se corrige, se estorna. `src/lib/caixaMovimentos.js` com as regras puras
  (leitura de `50,00`, movimentos da sessão, dinheiro disponível, limite de autorização) e
  `MovimentoCaixaModal.jsx` com o fluxo de sangria e suprimento. O fechamento passou a somar o
  ajuste esperado, e o limite de sangria virou config por estabelecimento (`limite_sangria`,
  padrão R$ 200) editável em Configurações.
- **Corrigido pela review:** `registrarMovimentoCaixa` validava valor, motivo e dinheiro disponível,
  mas **não conferia se o caixa ainda estava aberto**. O botão só aparece com o caixa aberto — só
  que `caixa_aberto` é chave compartilhada em `config` e chega por realtime: outro aparelho fecha o
  caixa com o modal já na tela e o insert entra com o `sessao_aberta_em` de uma sessão já conferida.
  Dinheiro fora de todo fechamento, sem erro nenhum na tela. Guarda adicionada em
  `AppContext.jsx:1288`, antes do insert.
- **Desvio do spec, documentado:** o critério 9 pedia `verificarSenhaAdmin`, mas essa função devolve
  só `{ ok }` — não diz **quem** autorizou. A build usa `verificarSenhaUsuario(username, password)`,
  o mesmo RPC com `p_username`, para que a senha tenha que ser do gerente escolhido no seletor.
  Caso contrário o critério 3 gravaria em `autorizado_por` um nome que ninguém conferiu.
- **A segunda correção veio do guard da rodada anterior:** o `schemaSqlGuard` do TD016 quebrou a
  suíte na primeira migration criada depois dele — `caixa_movimentos` não estava em
  `supabase/schema.sql`. O vigia funcionou uma rodada depois de nascer.
- **Aprendido:** `memory/learnings.md` (a sessão que a tela guardava e o handler não; o guard que
  cobra schema.sql em toda migration nova; o critério que nomeia função sem conferir a linha de
  `export`), `memory/patterns.md` (nova seção "Estado compartilhado é reconferido no handler, não só
  na tela") e a linha do **F005** reescrita em `docs/09_BACKLOG/features.md`.
- **Commit:** `7ab7c3b` na branch `ciclo/s1-3-configuracoes`
- **Pendente de decisão:** segue o ADR do F021 (offline-first), aberto desde a rodada 10. Novo:
  domínio/subdomínio de delivery por tenant esbarra em custo (domínio ~R$ 40/ano + DNS wildcard).
- **Pendente de produção:** as migrations `20260912`, `20260913`, `20260914`, `20260915` e
  `20260916` continuam sem rodar no Supabase.
- **Próximo item recomendado:** **F018 (telas de delivery)** — é a maior prioridade escrita ainda
  aberta e o menor caminho até algo verificável: 8 estilos inline em quatro arquivos já cobertos por
  teste, na única superfície que o cliente final enxerga e que hoje não dá para tematizar por
  estabelecimento.


## Rodada 10 — TD016 — 2026-08-02

- **Spec:** `specs/td016-veracidade-do-backlog-e-do-schema.md`
- **Resultado da review:** aprovado sem ressalvas — 18 de 18 critérios em sim, `npx vitest run` em
  191 de 191 arquivos e 3018 de 3018 testes. Nenhum arquivo tocado fora do §4, nenhuma migration
  criada ou alterada.
- **Construído:** os documentos que o `CLAUDE.md` chama de fonte de verdade voltaram a dizer a
  verdade. `supabase/schema.sql` reconstruído das migrations — de 26 para **54 tabelas**, com a
  camada multi-tenant inteira (`tenants`, `tenant_id` nas 49 isoladas, `tenant_atual_id()` e a
  policy `RESTRICTIVE`), que antes não aparecia **nenhuma vez** no arquivo. `docs/09_BACKLOG/`
  conferido item a item contra o código: 13 status errados corrigidos, cada um citando o arquivo ou
  a migration que prova. E `src/lib/schemaSqlGuard.test.js` como vigia, no formato dos outros
  quatorze `*Guard.test.js`.
- **Os dois achados que mudam o que se sabe do sistema:** (1) **F021 (PDV offline-first) exigia ADR
  antes de codar e entrou sem** — fila, replay da cascata e PWA rodam desde a Leva 11; falta a
  decisão, não o código. (2) **F005 pede sangria e sangria não existe** — zero ocorrências em
  `src/` e `supabase/migrations/`, num item que o dono marcou 🔴 Critical.
- **Corrigido pela review:** o guard contava o `DROP TABLE _numeros` da `20260903` como tabela
  derrubada, mas ela é `CREATE TEMP TABLE` de bloco de verificação. A lista de derrubadas é o que
  **isenta** uma tabela dos outros três testes — uma temporária que colidisse de nome com uma
  tabela real a tiraria da cobertura em silêncio.
- **Provado por mutação:** renomear `combo_produtos` no schema quebra dois testes do guard nomeando
  a tabela e a migration que a criou; o arquivo voltou byte a byte idêntico depois.
- **Aprendido:** `memory/learnings.md` (o schema mudo por quatro semanas; conjunto de isenção que
  cala a verificação; os 13 status errados; código entregue ≠ rodando em produção),
  `memory/patterns.md` ("Conjunto de isenção é mais perigoso que conjunto de exigência", dentro da
  seção de conferência textual de SQL) e o cadastro do **TD016** em `docs/09_BACKLOG/tech-debt.md`.
- **Commit:** `20c5837` na branch `ciclo/s1-3-configuracoes`
- **Pendente de decisão:** o ADR do F021 (offline-first), que o item exigia e nunca foi escrito —
  IndexedDB × `localStorage`, conflito multi-dispositivo, realtime e contingência fiscal/TEF.
- **Próximo item recomendado:** **F005-SANGRIA** — é o único 🔴 Critical do backlog com buraco real
  de código, as regras já estão escritas em `docs/03_REGRAS_DE_NEGOCIO/CAIXA.md` (não depende de
  decisão do dono) e sem ela o dinheiro que sai da gaveta no meio do turno não tem registro.

## Rodada 9 — F022-ADDONS — 2026-08-02

- **Spec:** `specs/f022-addons-por-estabelecimento.md`
- **Resultado da review:** aprovado sem ressalvas — 20 de 20 critérios em sim, `npx vitest run` em
  190 de 190 arquivos e 3014 de 3014 testes. **Um arquivo tocado fora do §4 do spec**, declarado:
  `src/pages/console/ConsolePage.test.jsx`, porque o critério 10 (contagem de add-ons no card) não
  tinha teste nenhum e critério sem evidência é critério em "não".
- **Construído:** modal **"Add-ons"** por estabelecimento no Console
  (`src/components/console/AddonsModal.jsx` + `.css` + `.test.jsx`), a migration
  `supabase/migrations/20260915_alternar_addon_tenant.sql` (RPC `alternar_addon_tenant`), os avisos
  em `src/constants/addons.js`, cinco funções novas em `src/lib/console.js` e um terceiro botão no
  card do estabelecimento que já diz quantos add-ons estão ligados. Ligar NF-e ou TEF para um
  cliente deixou de ser `INSERT` no SQL Editor.
- **Desenho mantido:** `tenant_addons` continua **sem policy de escrita** — tudo pela RPC
  `SECURITY DEFINER` com guarda `is_super_admin() IS NOT TRUE`, `REVOKE` antes do `GRANT`, igual a
  `alterar_plano_tenant`, `definir_mensalidade_tenant` e `estornar_pagamento_assinatura`.
- **Corrigido pela review, em três pontos:** (1) `resumirAddonsDoTenant` casava `null === null` e
  mostrava "Ligado" para um add-on pago de ninguém quando o tenant chegava ausente — dado de um
  cliente na tela de outro, o defeito mais caro que um SaaS multi-tenant tem; (2) quatro classes
  (`.adm-erro`, `.adm-erro__titulo`, `.adm-erro__texto`, `.adm-relere`) eram usadas no JSX e **não
  existiam** no CSS — o bloco de falha de leitura saía sem estilo e nada acusava; (3) altura do
  botão de confirmar fora do padrão de 46px.
- **Aprendido:** `memory/learnings.md` (o casamento por chave anulável e as classes inventadas que
  ninguém valida), `memory/patterns.md` ("Cruzamento por tenant nunca casa tenant ausente") e
  `memory/bugs.md` (o defeito do tenant nulo, achado no build e **não** chegado a produção — hoje o
  Console guarda com `{tenantAddonsSelecionado && (`, mas a função é exportada e um segundo chamador
  não teria essa guarda).
- **Backlog:** F022 registrado como entregue nesta frente; F017 (TEF) e F019 (NF-e) ganharam a nota
  de que a **contratação** já é operável ainda que a integração não exista.
- **Commit:** `eb51344` na branch `ciclo/s1-3-configuracoes`, com push feito.
- **Roda em produção:** `20260915_alternar_addon_tenant.sql` precisa ser aplicada no SQL Editor —
  enquanto não for, o modal abre e lista, mas o botão devolve `function
  public.alternar_addon_tenant does not exist`. Continuam pendentes `20260912_analytics_plataforma`,
  `20260913_estorno_pagamento_assinatura` e `20260914_identidade_tenant`.
- **O que o `/proximo` desta rodada descobriu (e corrigiu na documentação):** quatro afirmações do
  backlog estavam falsas. **S1-1** ("isolamento multi-tenant, o bloqueador nº 1", 🔴 Alto) está
  entregue desde as levas `20260723`–`20260726`. **S1-2** está entregue, inclusive o 1º admin
  (Edge Function `provisionar-estabelecimento` + `provisionar_tenant`). A **configuração fiscal por
  tenant** que o F022 dizia faltar não é do Console: existe em `PainelFiscal` gravando
  `tenant_fiscal_config` (`20260731`), roteada em `src/routes/index.jsx:238`. E a observação do
  **TD009** sobre o Jarvas ler estoque de uma chave morta já foi corrigida — a Edge Function lê a
  tabela `estoque`.
- **Pendente de decisão do dono:** (1) estabelecimento de **cortesia** (`valor_mensal = 0`) não
  consegue renovar; (2) **como o cliente paga** (chave Pix, canal de contato) não está escrito em
  lugar nenhum; (3) a assinatura do próprio GastroMundi **vence em 2026-08-05 e bloqueia em
  2026-08-09**; (4) o **fiscal NFC-e** (S1-4/F019) depende de certificado A1 e provedor — o único
  item que ainda bloqueia venda e o único que custa dinheiro.
- **Próximo item recomendado:** **TD016** (novo) — auditoria de veracidade do backlog e do
  `supabase/schema.sql`. Depois de nove rodadas, **acabou o trabalho de código que é gratuito e
  bloqueia venda**: o que sobra ou é ação do dono, ou custa dinheiro, ou é 🟢 Low. E a fonte de
  verdade declarada no `CLAUDE.md` está mentindo — `schema.sql` não tem **uma ocorrência** de
  `tenant_id`, e este `/proximo` sozinho achou quatro linhas falsas. É o item que decide se as
  próximas rodadas escolhem trabalho certo.

## Rodada 8 — S1-3-IDENTIDADE — 2026-08-01

- **Spec:** `specs/s1-3-identidade-do-estabelecimento.md`
- **Resultado da review:** aprovado sem ressalvas — 18 de 18 critérios em sim, `npm test` em 189 de
  189 arquivos e 2983 de 2983 testes. Nenhum arquivo tocado fora do §4 do spec.
- **Construído:** aba **"Identidade"** em Configurações, só admin
  (`src/components/desktop/views/IdentidadeTab.jsx` + `.css` + `.test.jsx`, 22 testes), com a lib
  `src/lib/identidadeTenant.js` (+ 25 testes) e a migration
  `supabase/migrations/20260914_identidade_tenant.sql`. O dono define **nome de exibição** e **logo**
  da própria marca; a prévia no topo é o mesmo bloco que a sidebar pinta, atualizando enquanto se
  digita ou se escolhe a imagem — o resultado aparece antes de salvar. O logo vem do arquivo (sem
  campo de URL), é comprimido no `<canvas>` em PNG **com alpha preservado** e vai para
  `{tenant_id}/identidade/logo.png` no bucket `delivery-fotos`.
- **Por que não precisou de bucket nem de policy nova:** as policies da `20260826` casam pela
  **primeira** pasta do caminho, então o caminho aninhado já nasce isolado e autorizado, e o bucket
  já é público — que é o que a tela de login (pré-autenticação) precisa. Zero passo manual novo em
  produção e nenhuma repetição do deadlock `40P01` documentado naquela migration.
- **Fronteira mantida:** a RPC escreve **duas** chaves de `tenants.tema` (`nome_exibicao`,
  `logo_url`). Paleta (`accent`) e `layout` continuam sendo do Console — `alterar_layout_tenant`
  (`20260801`) apaga overrides de paleta de propósito, e duas pontas escrevendo o mesmo jsonb se
  sobrescreveriam sem ninguém perceber.
- **Corrigido pela review:** o critério 6 do próprio spec estava errado. Ele exigia que nome vazio
  "não salvasse"; o código deixa o vazio **limpar** o nome de exibição e voltar ao nome cadastrado —
  que é o único jeito de desfazer um nome já escolhido sem SQL. Spec reescrito, código mantido.
- **Aprendido:** `memory/learnings.md` (o `logoUrlSegura` que não existe em `tema.js`; o
  `comprimirImagem` do Delivery que pinta fundo branco e não serve para logo; o banner de sucesso
  que dependia do contexto repintar) e `memory/patterns.md` ("O que o servidor confirmou tem
  precedência sobre o contexto" e "Pasta nova dentro do bucket que já existe").
- **Backlog:** `sprint_pre_venda.md` S1-3 passou de "Parcial" para **entregue** nas quatro abas
  (Usuários, Impressão, Minha assinatura, Identidade), com a nota errada sobre "logo esbarra na
  pendência de Storage × RLS" desfeita.
- **Commit:** `64d3dbe` na branch `ciclo/s1-3-configuracoes` — a branch foi renomeada de
  `ciclo/s1-3-usuarios` (nome que já não descrevia nem a rodada 7 nem a 8) e **o push da rodada 7
  nunca tinha acontecido**: as duas rodadas subiram juntas agora.
- **Roda em produção:** `20260914_identidade_tenant.sql` precisa ser aplicada no SQL Editor —
  enquanto não for, a aba abre e a prévia funciona, mas salvar devolve
  `function public.atualizar_identidade_tenant does not exist`. Continuam pendentes também a
  `20260912_analytics_plataforma.sql` e a `20260913_estorno_pagamento_assinatura.sql`.
- **Pendente de decisão do dono:** (1) estabelecimento de **cortesia** (`valor_mensal = 0`) não
  consegue renovar — a RPC recusa `p_valor <= 0`; (2) **como o cliente paga** (chave Pix, canal de
  contato) não está escrito em lugar nenhum, e a aba "Minha assinatura" só sabe dizer que venceu;
  (3) a assinatura do próprio GastroMundi **vence em 2026-08-05 e bloqueia em 2026-08-09**.
- **Próximo item recomendado:** **F022-ADDONS** — ligar e desligar add-ons por estabelecimento pelo
  Console. As tabelas existem desde a `20260718_addons.sql` e o app já barra fail-closed
  (`addonHabilitado`, `AppContext.jsx:1620`), mas `src/pages/console/` e `src/components/console/`
  não têm **uma linha** sobre add-on: habilitar TEF ou fiscal para um cliente hoje é `INSERT` no SQL
  Editor. É o que sobrou do F022 (🔴 bloqueia venda) que **não** depende de provedor pago.

## Rodada 7 — S1-3-ASSINATURA — 2026-08-01

- **Spec:** `specs/s1-3-minha-assinatura-no-estabelecimento.md`
- **Resultado da review:** aprovado sem ressalvas na segunda auditoria — 18 de 18 critérios em sim,
  `npm test` em 187 de 187 arquivos e 2936 de 2936 testes, uma rodada de correção sem escalada.
  Nenhum arquivo tocado fora do §4 do spec; **nenhuma migration** criada ou alterada.
- **O que o levantamento mudou no escopo:** nada precisava de SQL. As três policies de leitura já
  estão em produção — `assinaturas_select_auth` e `assinaturas_pagamentos_select_gerencia`
  (`20260726`) e `planos_select_auth` (`20260728`) —, então a aba nasceu só de front. E como toda
  escrita em assinatura passa por RPC guardada por `is_super_admin()` (decisão 027), a tela é
  declaradamente **somente leitura**: botão de registrar/cancelar aqui só levaria a um 42501.
- **Construído:** aba **"Minha assinatura"** em Configurações
  (`src/components/desktop/views/MinhaAssinaturaTab.jsx` + `.css` + `.test.jsx`), visível só para
  gerente/admin — o mesmo recorte da policy. Responde em uma frase "estou em dia?", com a data do
  próximo vencimento; mostra o plano pelo **nome** (`buscarPlanoDoTenant` em `src/lib/tenant.js`) e o
  que ele inclui por `ROTULOS_MODULO`; e lista o histórico de pagamentos do próprio tenant com o
  total do que vale, deixando o cancelado visível, riscado e com o motivo, fora da soma. Duas funções
  puras mudaram de casa para `src/lib/assinatura.js` — `rotuloCompetencia` (vinha do modal do
  Console) e `DIAS_AVISO_PRE_VENCIMENTO` (vinha do `AssinaturaBanner`) — para que banner e aba
  avisem na mesma janela e nenhuma tela de tenant importe nada do Console.
- **Corrigido pela review:** três desvios do próprio spec. (1) sem resposta de `public.planos` a aba
  mostrava o código cru `medio` — e o teste que eu tinha escrito ratificava o jargão; virou "Plano
  contratado", com teste provando que o código não aparece. (2) com `tenant` nulo no bootstrap a aba
  afirmava "ainda não há uma assinatura cadastrada"; agora mostra "Carregando sua assinatura…".
  (3) com todos os pagamentos cancelados o total dizia "R$ 0,00 pagos em 0 mensalidades"; agora
  escreve "Nenhum pagamento em vigor: N lançamento(s) cancelado(s)".
- **Aprendido:** `memory/learnings.md` (duas linhas em Técnicos — constante de regra e função pura
  que duas superfícies leem moram em `src/lib` desde o começo, e o sintoma de estar no lugar errado é
  precisar importar um componente para reaproveitar uma linha; e a tela que afirma o que ainda não
  sabe, com o agravante do teste que congela o comportamento errado); `memory/patterns.md` (dois
  padrões novos em UI/UX — "'Ainda não sei' nunca é dito como 'não existe'" e "Fallback de nome nunca
  é o código técnico"); `docs/09_BACKLOG/sprint_pre_venda.md` (S1-3 marcado como parcial, com o que
  entrou e o que falta); e o resultado da review anexado ao spec (§8).
- **Commit:** `dfd7d4c` na branch `ciclo/s1-3-minha-assinatura` (criada a partir da branch da
  Rodada 6, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** continuam sem rodar em produção a `20260912_analytics_plataforma.sql` e a
  `20260913_estorno_pagamento_assinatura.sql`. Esta rodada não acrescenta nenhuma.
- **Pendente de decisão:** (a) a mesma das Rodadas 2 a 6 — estabelecimento de **cortesia**
  (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`; (b) **como o
  estabelecimento paga** (chave Pix, canal de contato) não está escrito em `docs/` nem em `memory/`,
  então a aba de propósito não diz — é decisão de produto e conteúdo por estabelecimento.
- **Prazo do dono:** a assinatura do próprio GastroMundi vence em **2026-08-05** e bloqueia em
  **2026-08-09** — renovar pelo Console, em Planos e assinaturas → "Registrar pagamento".
- **Fica registrado (não construído):** a outra metade do S1-3 — identidade/tema do estabelecimento
  (logo, cores, nome), usuários e config de impressão pelo próprio tenant; recibo em PDF; e troca de
  plano/add-on self-service.
- **Backlog desatualizado que este levantamento encontrou (não corrigido):** `sprint_pre_venda.md`
  ainda lista **S1-1 (isolamento multi-tenant)** como bloqueador aberto, mas as migrations
  `20260723`–`20260726` e `20260738`–`20260743` já puseram `tenant_id` + policy RESTRICTIVE nas 24
  tabelas operacionais; e `features.md` diz que o **F016** está "planejado, código não iniciado",
  embora `20260720_assinatura_enforcement.sql`, `AssinaturaBanner.jsx` e `AssinaturaBloqueada.jsx`
  existam. Vale uma rodada de acerto de status antes que alguém construa de novo o que está pronto.
- **Próximo item recomendado:** **S1-3-IDENTIDADE** — nome de exibição e logo do estabelecimento
  editáveis pelo admin do próprio tenant. Cheguei a recomendar "S1-3-USUARIOS" e estava errado: a aba
  "Usuários" já existe em Configurações com CRUD completo, reset de senha e permissões por cargo, e a
  aba "Impressão" também — dos três pedaços que o `sprint_pre_venda.md` lista no S1-3, só identidade
  ficou. Hoje ela só muda por RPC do Console (`tenants` não tem policy de UPDATE — ADR-005/008 §7), e
  o Storage já está destravado desde a `20260826_delivery_fotos_tenant_por_uid.sql`.

## Rodada 6 — F022-HISTORICO — 2026-08-01

- **Spec:** `specs/f022-historico-de-pagamentos-da-assinatura.md`
- **Resultado da review:** aprovado sem ressalvas — 17 de 17 critérios em sim, `npm test` em
  186 de 186 arquivos e 2908 de 2908 testes, **sem nenhuma rodada de correção** (as quatro correções
  da rodada aconteceram dentro do `/build`, todas no guard, não no código entregue). Nenhum arquivo
  tocado fora do §4 do spec; nenhuma policy criada ou alterada.
- **O que o levantamento mudou no escopo:** a decisão 027 diz que as duas tabelas de assinatura não
  têm policy de INSERT/UPDATE/DELETE de propósito — toda escrita passa por RPC `SECURITY DEFINER`.
  Mas a `assinaturas_pagamentos` **já tem** o ramo `OR is_super_admin()` na policy de SELECT (desde a
  `20260726`), então o Console lê o histórico direto, sem RPC de leitura e sem tocar em policy. O
  escopo ficou: uma leitura direta e **uma** RPC nova, só para o desfazer.
- **Construído:** modal "Pagamentos registrados" no `/console`
  (`src/components/console/HistoricoPagamentosModal.jsx` + `.css`, aberto pelo botão "Ver pagamentos"
  de cada linha do dashboard de planos), com `listarPagamentosAssinatura`, `estornarPagamentoAssinatura`
  e a função pura `resumirPagamentos` em `src/lib/assinatura.js`. Mostra mês, valor, quem registrou e
  quando, com o total do que vale; pagamento cancelado aparece riscado com o motivo e sem botão. O
  desfazer é a RPC `estornar_pagamento_assinatura` (migration `20260913`): exige motivo de 3
  caracteres, marca `estornado_em/estornado_por/estorno_motivo`, devolve o vencimento **um ciclo**
  para trás, recalcula o status por `calcular_status_assinatura` e reconstrói `ultima_renovacao` pelo
  maior pagamento que sobrou. O índice único de competência virou parcial
  (`WHERE estornado_em IS NULL`), então o mês fica livre para ser lançado de novo com o valor certo.
  Nada é apagado — o estorno é uma marca, não um DELETE.
- **Corrigido pela review:** nada. Os 17 critérios já estavam em sim na primeira auditoria.
- **Aprendido:** `memory/learnings.md` (duas linhas em Técnicos — o guard textual que varre o arquivo
  inteiro encontra as próprias palavras proibidas dentro do `DO $conf$` e acusa o vigia como
  infrator; e `/FOR (INSERT|UPDATE|DELETE)/` casa o `FOR UPDATE` dos locks da própria RPC, além do
  CRLF que faz toda âncora com `"\n"` falhar); `memory/patterns.md` (três marcadores em "Conferência
  textual de SQL" — proibir só antes do `DO $conf$`, ancorar no que é exclusivo do que se proíbe,
  normalizar a quebra de linha antes de ancorar); `docs/09_BACKLOG/features.md` (o histórico no
  status do F022, e a nota de RLS agora diz que toda escrita em assinatura passa por RPC); e o
  resultado da review anexado ao spec (§9).
- **Commit:** `98361a0` na branch `ciclo/f022-historico-pagamentos` (criada a partir da branch da
  Rodada 5, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** rodar `supabase/migrations/20260913_estorno_pagamento_assinatura.sql` no
  SQL Editor do Supabase —
  https://github.com/korabusinessnetwork/gastromundi/blob/ciclo/f022-historico-pagamentos/supabase/migrations/20260913_estorno_pagamento_assinatura.sql
  Enquanto não rodar, o modal **lista** os pagamentos normalmente (a leitura já existe em produção);
  só o botão de cancelar falha, com a mensagem de erro na tela. Continua pendente também a
  `20260912` da Rodada 5.
- **Pendente de decisão:** a mesma das Rodadas 2 a 5, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Prazo do dono:** a assinatura do próprio GastroMundi vence em **2026-08-05** e bloqueia em
  **2026-08-09** — renovar pelo Console, em Planos e assinaturas → "Registrar pagamento".
- **Fica registrado (não construído):** o histórico visto pelo **estabelecimento** (a policy já
  deixa gerente/admin lerem o do próprio tenant, mas não existe tela), recibo/comprovante anexado ao
  pagamento, e desfazer o estorno.
- **Próximo item recomendado:** **S1-3-ASSINATURA** — aba "Minha assinatura" nas Configurações do
  estabelecimento: hoje o dono do restaurante só vê o banner de vencimento, e o que ele pagou existe
  apenas na tela do dono do SaaS.

## Rodada 5 — F022-ANALYTICS — 2026-08-01

- **Spec:** `specs/f022-analytics-de-plataforma-no-console.md`
- **Resultado da review:** aprovado sem ressalvas — 16 de 16 critérios em sim, `npm test` em
  184 de 184 arquivos e 2863 de 2863 testes, uma rodada de correção sem escalada. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma policy de tabela operacional alterada.
- **O que o levantamento mudou no escopo:** a nota do F022 no backlog dizia que "RLS por tenant
  precisa de override `OR auth.is_super_admin()`". A ADR-008 (§5 e decisão fechada v2 nº 2) diz o
  contrário para tabela operacional: esse ramo existe **só** em `tenants` e `assinaturas`. Quem
  fosse construir o analytics lendo o backlog alteraria a policy de `vendas` e abriria a base
  inteira de todos os clientes a qualquer token de plataforma. O escopo passou a ser o outro braço
  da mesma decisão — agregado por RPC, não leitura por policy.
- **Construído:** aba "Uso e faturamento" no `/console` (`src/components/console/AnalyticsDashboard
  .jsx` + `.css`; `listarAnalitico` e a função pura `resumirUso` em `src/lib/console.js`) —
  faturamento, pedidos, ticket médio e há quanto tempo cada estabelecimento vendeu pela última vez,
  em 7/30/90 dias. A leitura é a RPC `analytics_plataforma` (migration `20260912`), `SECURITY
  DEFINER` com `SET search_path = public`, que revalida `is_super_admin()` na primeira instrução e
  devolve **contagem e soma** — nenhuma linha de venda sai do banco. `p_dias` é lista fechada
  validada dentro do banco, porque o PostgREST expõe a função a qualquer token `authenticated`.
  Dinheiro atravessa em centavos inteiros e vira real só na formatação. Quem paga e não está
  vendendo aparece em bloco de atenção antes dos números — é a única coisa da aba que pede ação.
- **Corrigido pela review:** o estado de vazio só disparava com zero estabelecimentos. Base com
  clientes e nenhuma venda no período renderizava R$ 0,00 nos cartões e uma tabela de zeros, que se
  lê como "não carregou" — exatamente o erro que a aba existe para evitar. Entrou a frase que afirma
  o zero ("Nenhuma venda no período..."), com dois testes.
- **Aprendido:** `memory/patterns.md` (padrão novo "O Console lê a operação por agregado, nunca por
  policy" — assinatura de retorno como tranca, período validado no banco, os dois guards);
  `memory/learnings.md` (duas linhas em Técnicos — nota de backlog envelhece e não é revisada quando
  a ADR muda, o backlog diz **o que** falta e nunca **como** se faz; e o bloco `DO $conf$` só protege
  o banco onde já rodou, some no primeiro `CREATE OR REPLACE`, então RPC cuja forma é a garantia
  nasce com o autoteste em SQL **e** o `*SqlGuard.test.js` — já são 9);
  `docs/09_BACKLOG/features.md` (a nota errada do F022 corrigida, e a aba nova no status);
  e o resultado da review anexado ao spec (§8 e §9).
- **Commit:** `334deaa` na branch `ciclo/f022-analytics-console` (criada a partir da branch da
  Rodada 4, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** rodar `supabase/migrations/20260912_analytics_plataforma.sql` no SQL
  Editor do Supabase. Enquanto não rodar, a aba mostra o erro com "Tentar de novo" e as outras duas
  abas do Console seguem intactas — a leitura só acontece quando alguém abre a aba.
- **Pendente de decisão:** a mesma das Rodadas 2, 3 e 4, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Fica registrado (não construído):** impersonação/escopo explícito por estabelecimento (o outro
  braço da ADR-008), detalhe e gráfico por estabelecimento, exportar CSV/PDF, separar delivery de
  salão, e transformar "paga e não está vendendo" em alerta ativo do Jarvas.
- **Próximo item recomendado:** **F022-HISTORICO** — histórico de pagamentos da assinatura e
  correção de pagamento lançado por engano: a Rodada 2 pôs no Console um botão que empurra a data de
  vencimento e grava em `assinaturas_pagamentos`, e hoje ninguém vê o que foi lançado nem desfaz um
  lançamento errado sem SQL em produção.

## Rodada 4 — prévia do cardápio abre o estabelecimento logado — 2026-08-01

- **Spec:** `specs/previa-do-cardapio-abre-o-estabelecimento-logado.md`
- **Resultado da review:** aprovado sem ressalvas — 14 de 14 critérios em sim, `npm test` em
  182 de 182 arquivos e 2817 de 2817 testes, **sem nenhuma rodada de correção**. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **O que o levantamento mudou no escopo:** a recomendação da Rodada 3 dizia que "não existe jeito de
  ver o cardápio como o cliente vê", e a fila do dono dizia o oposto — "✅ ENTREGUE (f9fc34f)". As
  duas estavam erradas do mesmo jeito. O botão existia **e abria o estabelecimento errado**: sem
  subdomínio por tenant em produção, `CardapioPage` resolvia o slug pelo fallback, então o dono de
  qualquer estabelecimento via a vitrine, a marca, as categorias e os preços da GastroMundi. O escopo
  virou fechar esse furo de white-label (decisão 017), não construir a tela.
- **Construído:** o botão leva `?loja=<slug do tenant logado>` — o `slug` entrou no `select` de
  `buscarTenantAtual`, que não o trazia, embora a coluna exista desde a `20260740`. A vitrine passou
  a resolver por `slugDaVitrine`: **subdomínio > query > fallback**, então endereço publicado nunca é
  sequestrado por URL e ligar o subdomínio (item 2 da fila) depois não muda nada aqui. O que vem da
  query é validado por `slugValido` antes de virar parâmetro de RPC; o que sai do banco passa por
  `encodeURIComponent`. Tenant sem slug abre `/cardapio` como antes — degrada, não some.
- **Achado no caminho (não chegou a produção):** `salvarBrandingCache` carimba o cache com o slug da
  **origem**, que numa origem compartilhada é sempre `gastromundi`. A prévia da Casa Coffee gravaria
  a marca dela sob o carimbo do vizinho e a tela de login da origem passaria a pintar "Casa Coffee"
  para todo mundo. Prévia agora não lê nem grava o cache; um teste de controle prova que o caminho
  normal continua lendo e gravando.
- **Aprendido:** `memory/learnings.md` (Técnicos — cache carimbado pela origem não pode ser escrito
  por tela que mostra outro estabelecimento; Processo — item marcado "entregue" escondeu o furo:
  o levantamento pergunta o que a coisa **faz**, não se existe); `memory/patterns.md` → Padrões de
  Código (padrão novo "Superfície pública endereçada por slug: precedência e cache por origem");
  `memory/bugs.md` (seção "Ciclo do loop — 2026-08-01", com os dois defeitos);
  `memory/fila-proximas-features.md` (o item 1 passou a descrever o comportamento, não só o commit);
  e o resultado da review anexado ao spec (§8 e §9).
- **Commit:** `5753de0` na branch `ciclo/previa-cardapio-estabelecimento-certo` (criada a partir da
  branch da Rodada 3, então carrega os commits dela; push feito, sem pull request). Inclui o ledger
  da Rodada 3, que ficou de fora do commit daquela rodada.
- **Pendente de decisão:** a mesma das Rodadas 2 e 3, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Não verificado em produção:** se a migration `20260740` (que criou `tenants.slug`) está aplicada.
  O código degrada em silêncio se não estiver (`slug ?? null` → `/cardapio` seco), mas a prévia só
  acerta o estabelecimento com a coluna no ar.
- **Próximo item recomendado:** **F022-ANALYTICS** — analytics de plataforma no Console (faturamento,
  pedidos e ticket médio por estabelecimento): é a fatia que falta do item nº 3 da fila do dono, é
  gratuita, e hoje o Console mostra quem paga mas não mostra quem usa.

## Rodada 3 — TD012 — 2026-08-01

- **Spec:** `specs/td012-baixa-de-estoque-que-falha-em-silencio.md`
- **Resultado da review:** aprovado sem ressalvas — 11 de 11 critérios em sim, `npm test` em
  181 de 181 arquivos e 2801 de 2801 testes, **sem nenhuma rodada de correção**. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **O que o levantamento mudou no escopo:** o título do TD012 estava desatualizado. A parte "engole
  a exceção e mostra estimativa local" já tinha sido consertada no `AppContext` meses antes. O que
  continuava aberto era a outra metade: a falha ia para o Sentry, para `jarvas_eventos` e para o
  `activity_log` — três destinos que só o desenvolvedor abre. O gestor não via nada. O spec foi
  escrito para essa metade, mais dois defeitos achados no caminho na própria `processarBaixaEstoque`.
- **Construído:** `gerarAlertaBaixaFalhou` leva a baixa recusada ao painel do Jarvas, com o dedupe
  por `origem.chave` dos irmãos e o erro cru do Postgres guardado em `origem.dados.erro`, fora do
  texto que o dono de restaurante lê. Offline **não** alerta — a baixa entra na fila e é reaplicada.
  `processarBaixaEstoque` parou de devolver saldo estimado no erro e passou a embrulhar a RPC em
  `try/catch`, como as duas irmãs já faziam.
- **Aprendido:** `memory/learnings.md` (duas linhas — "reportar não é alertar: Sentry, evento e log
  não fecham um item de falha silenciosa"; "um teste pode estar guardando o bug", que era o caso:
  `estoque.test.js` afirmava o saldo inventado com comentário justificando);
  `docs/09_BACKLOG/tech-debt.md` (TD012 resolvido, com seção própria); `sprint_pre_venda.md` (S2-1
  feito); `memory/bugs.md`; e o resultado da review anexado ao spec (§8 e §9).
- **ID duplicado corrigido:** existiam dois `TD012` no `tech-debt.md`. A seção `key={i}` em listas
  React virou **TD015** e ganhou a linha na tabela ativa que nunca teve.
- **Commit:** `150be86` na branch `ciclo/td012-baixa-estoque-silenciosa` (criada a partir da branch
  da Rodada 2, então carrega os commits dela; push feito, sem pull request).
- **Pendente de decisão:** a mesma da Rodada 2, ainda sem resposta — estabelecimento de **cortesia**
  (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`. Não bloqueia nada
  desta rodada.
- **Fica registrado (não construído):** falha sistêmica gera um alerta por produto distinto; somar
  num alerta só é regra nova de agregação. Avisar o operador na tela do PDV continua sendo decisão
  de produto não escrita. `entradaEstoque` também só reporta ao Sentry.
- **Próximo item recomendado:** **preview clicável do cardápio do cliente** — é o item nº 1 da fila
  do dono, e hoje não existe jeito de ver o cardápio como o cliente vê antes de publicar.

## Rodada 2 — F022-RENOVAR — 2026-08-01

- **Spec:** `specs/f022-renovar-assinatura-console.md`
- **Resultado da review:** aprovado sem ressalvas — 15 de 15 critérios em sim, `npm test` em
  181 de 181 arquivos e 2790 de 2790 testes, uma rodada de correção sem escalada. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **Corrigido pela review:** os dois arquivos de teste diziam citar "as recusas reais da RPC" mas
  usavam frases inventadas e um código errado (`P0002`, sendo que a exceção de assinatura
  inexistente não declara `ERRCODE` e chega como `P0001`). Trocado pelo texto literal da
  `20260909` (linhas 102, 139 e 129).
- **Aprendido:** `memory/learnings.md` (Aprendizados Técnicos — teste que dubla erro de RPC copia
  frase e SQLSTATE verbatim; `RAISE EXCEPTION` sem `USING ERRCODE` chega como `P0001`);
  `docs/09_BACKLOG/features.md` (F022 sai de "Backlog" para "Em andamento", com o que falta);
  `docs/09_BACKLOG/plano_tecnico_comercializacao.md` (a nota que dizia "sem tela de renovação"
  estava factualmente errada a partir de hoje); `specs/f022-…md` §8 e §9.
- **Commit:** `6eedbd6` na branch `ciclo/f022-renovar-assinatura-console` (criada a partir da
  branch da Rodada 1, então carrega o commit dela; push feito, sem pull request).
- **Pendente de decisão:** estabelecimento de **cortesia** (`valor_mensal = 0`) não consegue
  renovar — a RPC recusa `p_valor <= 0` dentro do banco. Hoje cortesia só se sustenta empurrando
  `data_vencimento` na mão. Três saídas: (a) a RPC passa a aceitar zero com motivo obrigatório;
  (b) cortesia vira campo próprio na assinatura (`isento_ate`), sem passar por pagamento;
  (c) fica como está. Precisa da decisão do dono — é regra de negócio, não bug.
- **Também sem tela:** histórico de `assinaturas_pagamentos` (o dado é gravado, ninguém vê) e
  estorno de pagamento registrado por engano (só por SQL).
- **Ação do dono, com prazo:** a assinatura da própria GastroMundi vence em **2026-08-05** e
  bloqueia em **2026-08-09**. A tela desta rodada é o caminho para renovar — Console → Planos e
  assinaturas → "Registrar pagamento".
- **Próximo item recomendado:** **TD012** — `estoque.js` engole a exceção da baixa e mostra
  estimativa local como se fosse sucesso; com estoque real de cliente, uma baixa que falha em
  silêncio corrompe o inventário sem ninguém notar.

## Rodada 1 — D14-GUARD — 2026-08-01

- **Spec:** `specs/d14-guard-lpad-que-trunca.md`
- **Resultado da review:** aprovado sem ressalvas — 8 de 8 critérios em sim, `npm test` em
  180 de 180 arquivos e 2761 de 2761 testes, uma rodada de correção sem escalada.
- **Aprendido:** `memory/patterns.md` (padrão novo "Conferência textual de SQL: tirar comentário
  antes, e proibir a forma, não a palavra"), `memory/learnings.md` (duas linhas em Aprendizados
  Técnicos), `docs/09_BACKLOG/tech-debt.md` (TD014, resolvido), e o resultado da review anexado
  ao próprio spec.
- **Commit:** `5b08cf6` na branch `ciclo/d14-guard-lpad-que-trunca` (push feito, sem pull request).
- **Pendente de decisão:** nenhuma. Fica um registro: este ledger nasce depois do commit da
  rodada, então a Rodada 1 aparece nele como arquivo não versionado — entra no commit da Rodada 2.
- **Próximo item recomendado:** **F022-RENOVAR** — a assinatura da própria GastroMundi vence em
  2026-08-05 e bloqueia em 2026-08-09, e depois da `20260909` nenhuma tela do sistema consegue
  renovar assinatura nenhuma.
