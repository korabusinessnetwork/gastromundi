# TAREFAS, rodada 2 do refino (frentes paralelas)

Legenda: `[ ]` pendente, `[~]` em andamento, `[x]` concluída e verificada, `[!]` travada com diagnóstico.

Rodada 1 fechada em 2026-09-12: 8 de 8 entregues, nada revertido. Baseline no
início da rodada 2: 241 arquivos, 4212 testes, build limpo.

Seis trilhas em worktree própria, cada uma dona exclusiva dos seus arquivos, mais
duas frentes de varredura (somente leitura) nas áreas que ainda não passaram.

## Trilha `relatorio-financeiro`
Dono de: `views/relatorio/`, `FinanceiroView.jsx`, `views/financeiro/`, `lib/financeiro.js`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] R01 | C02 | robustez | Card Lucro não calcula com receita ausente quando o período pedido começa antes da janela de 90 dias de `sales` |
| [ ] R02 | C07 | robustez | `listarLancamentos` recebe o período em vez de trazer tudo e recortar na memória |
| [ ] R03 | C08 | robustez | Aba Logs distingue falha de leitura de período sem atividade |
| [ ] R04 | C12 | ux | O atalho "Tudo" diz a janela que de fato mostra, na tela e no arquivo exportado |

## Trilha `cadastros-estoque`
Dono de: `ProdutosView.jsx`, `CombosView.jsx`, `EstoqueView.jsx`, `NotasFiscaisTab.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] E01 | C04 | ux | Excluir produto que a RLS barrou avisa, em vez de registrar sucesso no log |
| [ ] E02 | C03 | robustez | Falha ao ler a composição do combo bloqueia o Salvar, em vez de apagar itens em silêncio |
| [ ] E03 | C05 | robustez | Lista e detalhe de notas de entrada distinguem falha de leitura de "nenhuma nota" |
| [ ] E04 | C09 | robustez | Falha ao ler unidades de medida avisa, em vez de afirmar que não há unidade cadastrada |
| [ ] E05 | C11 | robustez | Enter no campo de entrada de estoque respeita a trava de duplo envio |

## Trilha `pdv-palm`
Dono de: `PDVView/`, `MobilePage.jsx`, `pages/mobile/`, `modals/FechamentoModal.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] P01 | A04 | robustez | Nova comanda com nome ou número já aberto é bloqueada com o motivo |
| [ ] P02 | A03 | ux | Fechar caixa com divergência exige a justificativa que a regra de negócio já pede |
| [ ] P03 | A10 | ux | Clique fora do modal de mesa fecha em vez de confirmar, e confirmar valida o campo |
| [ ] P04 | A11 | robustez | Valor de pagamento no split não aceita negativo |
| [ ] P05 | A12 | robustez | Saldo do Dia trata falha na leitura dos cancelamentos |
| [ ] P06 | A05 | ux | Os dois avisos do fluxo de excluir item do Palm somem sozinhos |
| [ ] P07 | A09 | robustez | Fila de pedidos em espera do Palm sobrevive a recarregar a tela |

## Trilha `acesso-login`
Dono de: `LoginPage.jsx`, `LoginPage.css`, `routes/`, `context/AppContext.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] L01 | N01 | robustez | Falha de conexão no login é dita como falha de conexão e não gasta tentativa |
| [ ] L02 | D03 | ux | A tela de login vira `form` de verdade, com foco inicial e botão de envio |
| [ ] L03 | D06 | robustez | Rota protegida espera a sessão ser restaurada em vez de piscar o login |
| [ ] L04 | N02 | ux | O botão de mostrar senha ganha alvo de toque de 44 px |
| [ ] L05 | N03 | ux | Os rótulos do login passam a focar o campo ao serem clicados |

## Trilha `gestao-config`
Dono de: `ConfiguracoesView.jsx`, `AdminView.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] G01 | D04 | ux | Gestão de usuários some para quem o banco não deixa gerenciar, em vez de recusar depois do clique |
| [ ] G02 | D08 | ux | Mesma regra na aba de unidades de medida, com mensagem honesta |
| [ ] G03 | D02 | qualidade | Card Impostos conta a fonte real e a tela morta sai |
| [ ] G04 | D05 | ux | Os três modais do estabelecimento fecham com Esc e prendem o foco |
| [ ] G05 | D07 | produto | Compras ganha busca por fornecedor e recorte por situação |

## Trilha `delivery-cozinha`
Dono de: `DeliveryView.jsx`, `DeliveryView.css`, `CozinhaView.jsx`, `fiscal/HistoricoNfce.jsx`, `lib/deliveryPedidos.js`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] D01 | B02 | ux | Falha ao avançar comanda na Cozinha aparece no cartão, com texto humano para a corrida entre estações |
| [ ] D02 | B04 | robustez | Kanban de pedidos para de trazer a base inteira sem recorte |
| [ ] D03 | B08 | ux | Ações do pedido no desktop mostram que o toque pegou |
| [ ] D04 | B09 | qualidade | Config de entrega só grava e só registra no log quando algo mudou |
| [ ] D05 | B06 | produto | Aba Cardápio do delivery ganha busca e atalho de indisponíveis |
| [ ] D06 | C06 | produto | Nota rejeitada ou pendente fica visível no histórico, sem precisar suspeitar |

## Do maestro, depois da integração
- C10, formatador único de dinheiro (`Intl` pt-BR), porque cruza três trilhas.
- N04, título de aba por tela com o nome do estabelecimento.
- N05, chunk principal de 2,4 MB, medir por rota antes de decidir.

## Varredura continuada (somente leitura, sem worktree)
- Frente V1: pautas, apex e demo, offline e fila, impressão e ponte, hooks e utils, PWA.
- Frente V2: camada de dados, Edge Functions, RLS e policies, libs puros de venda, caixa e Jarvas.
