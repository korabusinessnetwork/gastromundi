# Bugs encontrados na varredura

Achados consolidados e deduplicados, do mais grave para o menos grave. Só entra aqui o
que eu mesmo reproduzi, com passo a passo e evidência. O que não reproduziu virou nota
no fim do arquivo.

Ambiente de todos os achados: local, banco `qa_base` no Postgres 16 da porta 55432 com o
schema real do projeto, ponte de QA na 54321, app na 5201, commit base `54f76cbe`,
usuário `qa-admin-a@qa-a.local`. Nenhum dado real foi tocado.

---

## B01 | fluxo: F059 | suíte: operacao | severidade: S1 | status: FLAKY (12 de 15)

**Título:** fechar a conta direto do carrinho abre o pagamento com R$ 0,00 e diz que os
itens foram removidos.

**Reprodução:**
1. Abrir o PDV com o caixa aberto.
2. Clicar num número livre da grade de comandas, por exemplo o 15, informar a mesa e
   entrar na comanda. (A comanda ainda não existe no banco, é a "comanda virtual" do
   fluxo F051.)
3. Clicar duas vezes no produto, deixando 2 unidades no carrinho. O painel da direita
   mostra "ADICIONANDO (2)" e "Total da comanda R$ 15,00".
4. Clicar em "Finalizar Comanda · R$ 15.00" e confirmar em "Sim, finalizar". O diálogo de
   confirmação conta certo: "2 itens consumidos, TOTAL R$ 15,00".

**Esperado:** a tela de pagamento abre com os 2 itens e Total R$ 15,00, como acontece
quando o operador clica em "Lançar Pedido" antes (fluxo F058, testado e correto).

**Obtido:** a tela de pagamento abre com "Comanda 15 · 0 itens", Total R$ 0,00 e a frase
"Todos os itens foram removidos. Volte para a comanda para lançar novos itens.". O botão
de confirmar pagamento fica travado. **Enquanto isso, a comanda no banco está correta**,
com o item de 2 unidades e total 15.

**Evidência:** `suites/operacao/evidencias/OP04-checkout-do-carrinho.png` e
`OP13-checkout-zerado.png` (a tela zerada), `OP12-checkout-lancado.png` (a mesma conta
pelo caminho que funciona), `OP14-recuperacao.png` (a comanda intacta depois).
Teste automatizado que prova: `tests/e2e/navegador/pdv.mjs`, caso OP04, hoje PENDENTE.

**Impacto:** no meio do serviço, o caixa vai cobrar e vê zero. A mensagem na tela afirma
que os itens foram removidos, o que é falso, e induz o operador a lançar tudo de novo.
Se ele lançar, a comanda passa a ter 4 unidades e o cliente paga o dobro. Não há perda de
dado, mas há caminho direto para cobrar errado.

**Contorno (medido):** sair da conta, voltar à grade e entrar na comanda de novo. Os
itens reaparecem como "LANÇADOS (2)", o total volta a R$ 15,00 e o fechamento funciona.

**Causa provável (hipótese, não diagnóstico fechado):** `handleFinalizar`
(`src/components/desktop/views/PDVView/index.jsx:431`) grava os itens e atualiza o estado
local, mas o `selected` que o `CheckoutView` recebe em `index.jsx:1240` chega sem os
itens. Repare que o mesmo trecho difere de `handleLancar` (`index.jsx:392`), que carimba
`launched_at` em cada item novo enquanto o `handleFinalizar` não carimba. O `CheckoutView`
não filtra por `launched_at` (ele só tira `cancelado`), então a diferença provavelmente
está na ordem entre `persistirVirtual`, o `updatePending` com `baseItems` e o
`setSelected`, e não no campo em si.

**Frequência medida, e por que é FLAKY e não determinístico:** 12 falhas em 15 execuções,
sempre em comanda aberta pelo slot vazio da grade. Numa medição controlada de 10 execuções
seguidas, 9 deram R$ 0,00 (a única que deu valor foi num slot que já tinha comanda de uma
execução anterior, ou seja, fora da condição). Nas 5 execuções pela suíte automatizada,
que faz um percurso um pouco mais lento, 3 falharam e 2 passaram. A intermitência é
justamente o que sustenta a hipótese de corrida entre gravar a comanda e atualizar o
estado da tela, e não a de um campo faltando. Pelo caminho "Lançar Pedido" primeiro, nunca
falhou em nenhuma execução.

**Por que S1 mesmo sendo intermitente:** pela escala, frequência muda prioridade, não
severidade. E aqui o desfecho é dinheiro: a tela afirma que os itens sumiram quando eles
estão gravados, e o caminho natural de quem lê isso é lançar tudo de novo e cobrar em
dobro.

---

## B02 | fluxos: F183, F186 | suíte: banco-dinheiro | severidade: S2 | status: CONFIRMADO (3 de 3)

**Título:** venda cancelada continua contando como faturamento nas funções agregadoras do
banco, enquanto o front a exclui de todos os relatórios.

**Reprodução:**
1. No banco de QA, criar três vendas no mesmo período: R$ 100 e R$ 50 normais, e R$ 70
   com `cancelada = true`.
2. Chamar `relatorio_vendas` no período, como admin do estabelecimento.

**Esperado:** faturamento R$ 150 e 2 vendas. O próprio front documenta a regra em
`src/components/desktop/views/relatorio/RelatorioView.jsx:313`: "Leva 15.3, vendas
canceladas ficam fora de todos os relatórios", e filtra.

**Obtido:** faturamento R$ 220 e 4 vendas (contando a cancelada). Medido três vezes
seguidas com o mesmo número.

**Ocorrências (mesma causa, mesma correção):**
- `relatorio_vendas`: alimenta a aba Desempenho (F183, F186). Faturamento, número de
  vendas, série por dia e total por método, todos contam a cancelada. Só `top_produtos`
  filtra, e mesmo assim pelo cancelamento de item (`venda_itens.cancelado`), não pelo da
  venda.
- `jarvas_resumo_vendas`: devolveu total R$ 220 e 4 vendas no mesmo cenário.
- `analytics_plataforma`: devolveu 23500 centavos e 4 vendas para o estabelecimento, isto
  é, o Console da plataforma também vê o número inflado.

**Evidência:** `tests/e2e/banco/30-pendentes-bugs-conhecidos.sql`, que falha hoje dizendo
"relatorio_vendas devolveu faturamento 220 e o certo, sem a venda cancelada, e 150".

**Impacto:** a aba Vendas (somada no navegador) e a aba Desempenho (somada no banco)
mostram faturamentos diferentes para o mesmo período. Quem cancela venda no fim do dia vê
o relatório dizer que faturou mais do que faturou, e o Console da plataforma cobra
decisões em cima do número inflado.

**Causa provável (hipótese):** a coluna `vendas.cancelada` nasceu em
`supabase/migrations/20260920_vendas_cancelamento.sql`, depois das três funções, e
nenhuma delas foi atualizada. Nenhuma das três menciona `cancelada` no corpo.

---

## B03 | fluxo: F186 | suíte: banco-dinheiro | severidade: S3 | status: CONFIRMADO (3 de 3)

**Título:** o resumo do Jarvas agrupa as vendas por dia em UTC, e joga a venda da noite
para o dia seguinte.

**Reprodução:** com uma venda em 10/09 às 23h30 no horário de São Paulo, chamar
`jarvas_resumo_vendas('2026-09-10 00:00:00-03', 5)`.

**Esperado:** a venda aparece em `por_dia` sob `2026-09-10`, o dia em que o restaurante
de fato vendeu. É assim que a `relatorio_vendas` se comporta, porque recebe `p_tz`.

**Obtido:** `{"por_dia": {"2026-09-11": ...}}`. A venda das 23h30 conta no dia seguinte.

**Evidência:** o mesmo arquivo de teste pendente, caso B03.

**Impacto:** todo insight e alerta do Jarvas que fala de "ontem", "hoje" ou "dias sem
vender" usa um calendário deslocado em até 3 horas. Em casa noturna, que é a maior parte
do movimento, a distorção é diária.

**Causa provável (hipótese):** a função não tem parâmetro de fuso; `relatorio_vendas`
ganhou `p_tz` em `20260746_relatorio_vendas_timezone.sql` e a do Jarvas ficou para trás.

---

## B04 | fluxo: F056 | suíte: operacao | severidade: S3 | status: CONFIRMADO (observado em toda execução com o produto de nome longo)

**Título:** produto de nome muito longo estoura o card e passa por cima dos vizinhos na
grade do PDV.

**Reprodução:** cadastrar um produto cujo nome tenha cerca de 340 caracteres (o seed de QA
tem um) e abrir a grade de produtos do PDV.

**Esperado:** o nome é truncado ou quebrado dentro do card, e o preço continua legível na
posição de sempre.

**Obtido:** o texto transborda o card, cobre parte dos cards vizinhos e empurra o preço
para fora do lugar, deixando "R$ 1.00" solto entre outras linhas.

**Evidência:** `suites/operacao/evidencias/OP06-carrinho.png` e
`OP11-comanda-lancada.png`, onde dá para ler o texto vazando por cima dos cards ao lado.

**Impacto:** num PDV de toque, um card deformado cobre o alvo do card vizinho e leva ao
toque errado. É a variação obrigatória "campo enorme" da bateria de QA.

---

## Notas: observado uma vez, ainda não confirmado

**N01, a modal de mesa abre já mostrando erro.** Ao clicar num slot livre da grade, a
modal "Informe a mesa antes de continuar" aparece com "Campo obrigatório." em vermelho
embaixo do campo, antes de a pessoa digitar qualquer coisa. Evidência em
`suites/operacao/evidencias/OP04-modal-mesa.png`. Contraria o princípio nº 1 do
`CLAUDE.md` ("prevenção de erro maior que mensagem de erro"), mas eu observei uma vez só,
então não subo para bug sem repetir o caso.

## O que não é bug

**Ausência da policy RESTRICTIVE de isolamento em 11 tabelas.** As tabelas `users`,
`role_permissions`, `assinaturas`, `assinaturas_pagamentos`, `ia_uso`, `nfce_emitidas`,
`nfce_inutilizacoes`, `solicitacoes_conta`, `tenant_addons`, `tenant_fiscal_config` e
`estoque_baixas_aplicadas` têm coluna `tenant_id` e não têm a policy
`<tabela>_tenant_isolation` que o `supabase/schema.sql:48` descreve como convenção. Eu
testei em execução: **não há vazamento**, porque todas isolam por dentro das próprias
policies permissivas. É um desvio de defesa em profundidade, não um furo: se amanhã
alguém acrescentar uma policy permissiva a mais numa dessas tabelas, some a rede de
proteção que existe nas outras 40. Vale registrar em `PENDENCIAS-DO-MATHEUS.md`, não em
`BUGS.md`.

**Quantidade negativa no pedido público.** Mandar `qtd: -5` na RPC `criar_pedido_delivery`
não é recusado, o servidor trata como 1 (`GREATEST(1, ...)`) e cobra 1 unidade. Como o
cliente paga por 1 e recebe 1, não há erro de dinheiro, e a trava é intencional no código.

**Google Fonts não carrega.** Erro de console na tela de login neste ambiente, causado
pela política de rede da sessão de teste, que bloqueia `fonts.googleapis.com`. Não é do
sistema.
