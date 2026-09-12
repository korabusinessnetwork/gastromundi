# AUDITORIA DO SISTEMA (varredura de 2026-09-12)

Backlog vivo do refino. Cada achado tem evidência do que foi visto, não suposição.
Score = (valor x 2) menos esforço menos (risco x 2). Score abaixo de 2 fica no
backlog e não entra em rodada.

Como a varredura foi feita:
- app subindo de verdade (`npm run dev`) e navegado com Chromium nas superfícies
  anônimas: raiz, `/login`, `/cardapio`, mais as rotas protegidas sem sessão
  (`/app/pdv`, `/console`, `/palm`) e uma rota inexistente, em 1280x800 e em
  390x844 (celular),
- quatro frentes de leitura de código em paralelo, uma por conjunto de fluxos,
- ferramentas: `npm test` (238 arquivos, 4191 testes verdes), `npm run build`
  (limpo), contagens no `src/`.

## Parte 1, achados da navegação real (prefixo N)

- [ ] N01 | eixo: robustez | onde: src/pages/LoginPage.jsx:177 mais o `login` do AppContext (tela de login)
      hoje: com o servidor inalcançável, a tela diz "Usuário ou senha incorretos. 4 tentativa(s) restante(s)" e consome uma tentativa. Falha de rede é relatada como credencial errada.
      depois: distinguir falha de conexão de credencial recusada, mostrar "Sem conexão com o servidor, tente de novo em instantes" e não gastar tentativa nesse caso.
      evidência: navegador em `/login` com `VITE_SUPABASE_URL` apontando para um host morto. O console registra `net::ERR_CONNECTION_REFUSED` e a tela, no mesmo instante, escreve "Usuário ou senha incorretos. 4 tentativa(s) restante(s)".
      valor: 5 | esforço: 2 | risco: 2 | score: 4
- [ ] N02 | eixo: ux | onde: src/pages/LoginPage.jsx:250 (botão de mostrar senha)
      hoje: no celular o botão do olho mede 26x26 px, menos da metade do alvo de toque confortável.
      depois: área de toque de no mínimo 44x44 px, mantendo o ícone do tamanho atual.
      evidência: medido no navegador em 390x844, `getBoundingClientRect` do botão "Mostrar senha" devolveu 26x26, contra 304x53 do botão Entrar e 304x51 dos campos.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] N03 | eixo: ux | onde: src/pages/LoginPage.jsx:234 e 244 (rótulos do login)
      hoje: os rótulos "Usuário" e "Senha" não estão associados ao campo (sem `htmlFor`, sem o campo dentro do rótulo). Clicar no rótulo não foca o campo e o leitor de tela não anuncia o par.
      depois: associar rótulo e campo por id.
      evidência: consulta no DOM devolveu `{"txt":"Usuário","htmlFor":null,"temInputDentro":false}` e o mesmo para "Senha".
      valor: 2 | esforço: 1 | risco: 1 | score: 1 (abaixo do corte, fica no backlog)
- [ ] N04 | eixo: ux | onde: index.html mais as telas de `/app` (título da aba)
      hoje: a aba diz "Kora" em todas as telas do estabelecimento. Quem trabalha com PDV, cozinha e relatório abertos em três abas vê três abas idênticas, e o nome do estabelecimento nunca aparece, o que também é marca da plataforma na aba de um cliente white-label.
      depois: título por tela com o nome do tenant, no padrão "Nome do estabelecimento, PDV".
      evidência: navegador em `/login` devolveu `title = "Kora"`; `grep document.title` mostra ajuste só no apex, no console e nas pautas, nenhum nas telas de `/app`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [ ] N05 | eixo: qualidade | onde: build (bundle principal)
      hoje: o chunk principal fecha em 2.442,98 kB (702,49 kB gzip) e o build avisa. O PWA pré-carrega 3.877,99 KiB.
      depois: separar do chunk principal o que só uma tela usa (o caminho mais claro é o que já foi feito com o apex e o cardápio, `lazy` por rota de `/app`).
      evidência: saída do `npm run build` de 2026-09-12, "Some chunks are larger than 2000 kB".
      valor: 3 | esforço: 3 | risco: 2 | score: -1 (abaixo do corte; vale medir por rota antes, não entra nesta rodada)

## Parte 2, achados da leitura de código por fluxo

<!-- preenchido com os relatórios das quatro frentes -->
### Frente C, cadastros, dinheiro e fiscal

Score calculado por mim sobre os números da frente. Onde eu discordei, a nota
está reavaliada e o motivo fica escrito.

- [ ] C01 | eixo: robustez | onde: relatorio/RelatorioView.jsx:890 e 531 (Relatórios, Vendas detalhado e export)
      hoje: venda cancelada sai dos relatórios, mas ITEM cancelado dentro de venda válida continua listado como vendido, conta no "3 itens" do cabeçalho e vai para o PDF e o Excel. A soma dos subtotais exibidos não fecha com o total da comanda, porque o total foi calculado sem ele. O mesmo item também aparece na aba Cancelamentos, então é contado duas vezes em dois lugares que se contradizem.
      depois: filtrar `it.cancelado` na lista, na contagem e no export, ou marcar a linha como cancelada e mantê-la fora da soma.
      evidência: verifiquei eu mesmo. `RelatorioView.jsx:890` monta `itens` sem filtro, `:891` soma tudo, `:976` mapeia tudo, `:531` repete no export. `useFinalizarPagamento.js:69` calcula o total com `filter(i => !i.cancelado)`, e a aba Cancelamentos em `:438` filtra `it.cancelado`, prova de que o campo existe.
      valor: 5 | esforço: 1 | risco: 1 | score: 7
- [ ] C04 | eixo: ux | onde: ProdutosView.jsx:417 (Produtos, excluir)
      hoje: `confirmarDelete` ignora o retorno de `removeProduct`, grava "Produto removido" no log e fecha o modal. Quando a RLS barra, o contexto devolve `no_rows_deleted`, o produto continua na tela e o log registra exclusão que não houve.
      depois: checar o erro, manter o modal aberto com aviso, e só registrar no log quando não houver erro, que é o padrão que a própria função `salvar` usa na linha 409.
      evidência: verifiquei eu mesmo. `ProdutosView.jsx:417` descarta o retorno, `AppContext.jsx:1295` devolve `{ error: { code: "no_rows_deleted" } }`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] C02 | eixo: robustez | onde: FinanceiroView.jsx:88 (Financeiro, card Lucro)
      hoje: a receita vem de `sales`, limitada a 90 dias no bootstrap, e as saídas vêm de `lancamentos`, sem recorte. Escolher um mês de mais de 90 dias atrás dá receita zero e despesa cheia: prejuízo inventado, em vermelho, num mês que pode ter sido o melhor do ano.
      depois: quando o período pedido começa antes da janela que `sales` cobre, não calcular o card e dizer que o lucro daquele período não está disponível na tela, como a tela já faz com `naoLido`.
      evidência: `FinanceiroView.jsx:89`, `AppContext.jsx:340` (janela de 90 dias), `FinanceiroView.jsx:97`.
      valor: 5 | esforço: 2 | risco: 2 | score: 4
- [ ] C05 | eixo: robustez | onde: NotasFiscaisTab.jsx:274 (Notas de entrada, lista)
      hoje: falha de leitura cai em `setNotas(data || [])` e a tela afirma "Nenhuma nota importada". Quem acabou de importar lê que a nota não existe e importa de novo; nota lançada à mão não tem chave de acesso, então a duplicidade passa e dá entrada dobrada no estoque.
      depois: capturar o erro, marcar estado de falha e mostrar o motivo com "Tentar de novo", o mesmo para `openDetalhe`.
      evidência: `NotasFiscaisTab.jsx:274`, textos em `:1237` e `:1260`, verificação de duplicidade por chave em `:405`.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [ ] C06 | eixo: produto | onde: fiscal/HistoricoNfce.jsx:153 (Notas emitidas)
      hoje: a fila offline avisa bem, mas nota que chegou à SEFAZ e voltou rejeitada, ou ficou pendente, não tem sinal em nenhum lugar do front. Para achar é preciso suspeitar e clicar no chip "Rejeitadas". Venda sem nota válida fica invisível por tempo indeterminado.
      depois: contagem por situação nos chips, com destaque quando for maior que zero.
      evidência: `HistoricoNfce.jsx:153` reage só a `naFila`; `nfceEmitidasRepo.js:22` não expõe contagem.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [ ] C11 | eixo: robustez | onde: EstoqueView.jsx:535 (Estoque, entrada)
      hoje: o botão Adicionar tem trava de duplo clique, o Enter não. Como o campo só limpa depois da gravação, dois Enter disparam duas entradas com a mesma quantidade, e quem soma é o banco: entrada em dobro no saldo e no histórico.
      depois: `if (e.key === "Enter" && !busy)`.
      evidência: verifiquei eu mesmo. `EstoqueView.jsx:535` contra `:554`, e nem `handleAdicionar` nem o helper `gravar` consultam `busy`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] C08 | eixo: robustez | onde: relatorio/RelatorioView.jsx:355 (Relatórios, Logs)
      hoje: a carga de `operator_logs` ignora o erro e a aba fica vazia, indistinguível de "não houve atividade". É o que o dono consulta justamente quando desconfia de algo.
      depois: guardar o erro e mostrar aviso com "Tentar de novo".
      evidência: verifiquei eu mesmo, `:355` tem `.then(({ data }) => ...)` sem `error`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] C09 | eixo: robustez | onde: ProdutosView.jsx:174 (Produtos, cadastro)
      hoje: a leitura de `unidades_medida` ignora o erro. Falhando, o modal diz "Nenhuma unidade de estoque cadastrada" (afirmação falsa) e a validação bloqueia o salvamento sem caminho de saída. O bloco das categorias, logo acima, trata isso certo.
      depois: capturar o erro e trocar o texto de vazio por falha de leitura com "Tentar de novo".
      evidência: verifiquei eu mesmo. `:174` descarta `error`, contra `:167` que trata.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] C03 | eixo: robustez | onde: CombosView.jsx:74 e 93 (Produtos, Combos, editar)
      hoje: as duas leituras da composição ignoram o erro. Se a de `combo_produtos` falhar e a outra passar, o modal abre sem os produtos e salvar apaga a composição sem reinserir nada, regravando o preço mais baixo. O teste que existe cobre falha no DELETE, não na LEITURA.
      depois: guardar o erro das duas leituras, avisar e bloquear o Salvar, como a tela já faz na carga da lista.
      evidência: `CombosView.jsx:74`, `:93`, `:199`, `:221`.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [ ] C10 | eixo: qualidade | onde: RelatorioView.jsx:78, DesempenhoReport.jsx:33, NotasFiscaisTab.jsx:26, financeiro/ResumoCards.jsx:6, CombosView.jsx:36
      hoje: cinco formatadores locais e idênticos de dinheiro, todos `"R$ " + toFixed(2)`, que mostram "R$ 1234.56" onde o dono lê R$ 1.234,56. O projeto já formata certo em outros lugares, então a tela de dinheiro do desktop é a exceção.
      depois: um formatador único com `Intl.NumberFormat("pt-BR")` e as cinco telas importando dele.
      evidência: as cinco linhas citadas contra `MovimentoCaixaModal.jsx:10` e `deliveryPedidos.js:189`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [ ] C07 | eixo: robustez | onde: lib/financeiro.js:129 com FinanceiroView.jsx:53 (Financeiro)
      hoje: a tela chama `listarLancamentos({})` sem data e sem limite e recorta na memória. Passando do teto de linhas do PostgREST, o mês antigo aparece zerado sem aviso.
      depois: passar `de` e `ate` na chamada, os filtros já existem na função.
      evidência: `financeiro.js:129`, `FinanceiroView.jsx:53`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [ ] C12 | eixo: ux | onde: RelatorioView.jsx:52 com lib/exportReport.js:16
      hoje: o chip "Tudo" não recorta, mas a lista que ele não recorta já vem limitada a 90 dias. O PDF sai com "Período: Todo o período" sobre dados de 90 dias, e é esse arquivo que vai para o contador.
      depois: renomear o atalho para o que ele mostra, ou buscar sob demanda.
      evidência: `RelatorioView.jsx:52`, `AppContext.jsx:340`, `exportReport.js:16`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1

### Frente B, delivery, vitrine pública, cozinha e clientes

- [ ] B03 | eixo: ux | onde: DeliveryView.jsx:2402 e 2662 (Delivery, Entrega e taxas)
      hoje: a lixeira da faixa de taxa grava no banco na hora, sem confirmação, sem desfazer e sem aviso. Um toque errado apaga a faixa do bairro e, daquele segundo em diante, todo cliente do bairro lê "fora da nossa área de entrega" na vitrine, sem ninguém perceber. A mesma tela confirma em dois outros lugares.
      depois: reusar a confirmação em duas etapas do cartão de produto, dizendo qual faixa sai.
      evidência: `:2402` grava direto, chamada no `onClick` de `:2662`; confirmação existente em `:2192` e `:982`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] B04 | eixo: robustez | onde: DeliveryView.jsx:682 (Delivery, Pedidos, ver itens)
      hoje: "Ver itens" descarta o erro, a lib devolve lista vazia em qualquer falha e a tela escreve "Sem itens detalhados". Como `itens` deixou de ser nulo, fechar e abrir não tenta de novo: a mentira fica colada até recarregar a página. O módulo mobile já corrigiu isso, e o comentário de lá diz o prejuízo: "o entregador saía sem a comida certa".
      depois: guardar o erro como o mobile guarda e refazer a busca quando a tentativa anterior falhou.
      evidência: `DeliveryView.jsx:682` contra `DeliveryModulo.jsx:226` e `:420`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] B02 | eixo: ux | onde: CozinhaView.jsx:53 e 64 (Cozinha, fila)
      hoje: "Iniciar Preparo" e "Marcar Pronto" tratam falha com `console.error` e nada mais. O botão volta ao normal, o cartão não muda e a cozinha não recebe uma palavra. E a falha não é rara: o guard otimista responde erro justamente quando outra estação já avançou a comanda.
      depois: mostrar no cartão o mesmo tipo de aviso que a falha de carga já mostra, com texto humano para o caso de outra estação ter avançado.
      evidência: `CozinhaView.jsx:53` e `:64`; `role="alert"` só em `:92`.
      valor: 4 | esforço: 2 | risco: 1 | score: 5
- [ ] B05 | eixo: qualidade | onde: lib/travessaoGuard.test.js:64 mais 5 telas
      hoje: o guard da regra absoluta do dono está furado, e o furo é contra o que o próprio arquivo documenta: o comentário diz que a comparação é exata, "sem `trim`, porque `" — "` com espaço dos dois lados é separador", e o código faz `texto.trim() === "—"` para `JSXText`. Em JSX o separador sempre nasce com espaço em volta, então a única forma que a regra proíbe é a que o guard libera. Passam hoje 5 separadores reais: a observação do item no cartão do pedido do Delivery, o mesmo na Cozinha mobile e no Delivery mobile, e o cabeçalho da nota em dois pontos de NotasFiscaisTab.
      depois: fechar o furo no `marcadorDeVazio` (o `JSXText` só é marcador quando é o conteúdo inteiro do elemento) e trocar as 5 ocorrências por vírgula.
      evidência: verifiquei eu mesmo. `travessaoGuard.test.js:64` contra o comentário em `:22`; ocorrências em `DeliveryView.jsx:748`, `CozinhaModulo.jsx:277`, `DeliveryModulo.jsx:430`, `NotasFiscaisTab.jsx:841` e `:1110`. A suíte do guard passa verde com as cinco no repositório.
      valor: 4 | esforço: 2 | risco: 1 | score: 4 (reavaliei o risco de 2 para 1: é um teste mais cinco trocas de texto, nada de fluxo)
- [ ] B01 | eixo: robustez | onde: lib/deliveryPedidos.js:224 com DeliveryView.jsx:517 (Delivery, Pedidos)
      hoje: a consulta traz todos os pedidos de delivery do tenant, sem limite, sem recorte de data e sem paginação, e a coluna "Entregue" renderiza um cartão por pedido entregue desde o primeiro dia, sem altura máxima. Acima do teto de linhas o PostgREST corta em silêncio e o número da coluna passa a mentir.
      depois: recortar as colunas terminais ao dia, mantendo as não terminais sempre visíveis, ou limite com "ver mais".
      evidência: `deliveryPedidos.js:224` sem `range`/`limit`, `DeliveryView.jsx:517`.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [ ] B06 | eixo: produto | onde: DeliveryView.jsx:886 (Delivery, Cardápio)
      hoje: a grade do cardápio não tem busca, nem filtro de disponibilidade, nem contagem de quantos estão fora do ar. Para trocar a foto de um item o dono rola a grade inteira. O helper `filtrarItensDelivery` já existe e já é usado na mesma tela, só não nesta aba.
      depois: campo de busca sobre a grade usando o helper que já existe, mais atalho de "só indisponíveis".
      evidência: `DeliveryView.jsx:886`, helper em `deliveryAdmin.js:142` usado em `:2237`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [ ] B09 | eixo: qualidade | onde: DeliveryView.jsx:2519 e 2523 (Delivery, Entrega e taxas)
      hoje: "Pedido mínimo" e "Tempo de preparo" gravam no `onBlur` sem comparar com o valor anterior. Passar o foco pelo campo e sair escreve no banco, escreve no `activity_log` e diz "Configurações salvas". A trilha de auditoria ganha alterações que não existiram.
      depois: sair sem fazer nada quando o payload sanitizado é igual ao que já está em `config`.
      evidência: `:2519`, `:2523`, corpo de `salvar` em `:2369`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [ ] B08 | eixo: ux | onde: DeliveryView.jsx:523 e 766 (Delivery, Pedidos)
      hoje: "Aceitar e preparar" e "Cancelar" não têm estado de em andamento: entre o clique e o fim do recarregamento o botão segue clicável e com o mesmo rótulo. O módulo mobile do mesmo fluxo tem esse controle, o desktop não.
      depois: `processando[pedido.id]` como o mobile faz.
      evidência: `:523` sem estado local, `:766` sem `disabled`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [ ] B07 | eixo: produto | onde: migration 20260804_delivery_fundacao.sql:256 com CardapioLista.jsx:57 (vitrine pública)
      hoje: na única tela que o cliente final vê, o combo é um nome e um preço: a RPC publica só `combo_id`, `nome` e `preco_total`, e a vitrine normaliza com `grupos: []`. O cliente paga às cegas, e o banco já tem o conteúdo.
      depois: devolver no JSON do combo os nomes dos produtos que o formam e mostrar no cartão e no modal.
      evidência: migration `:256`, `CardapioLista.jsx:57`.
      valor: 3 | esforço: 3 | risco: 2 | score: -1 (mexe em migration, e migration não aplicada é pendência do dono; fica no backlog)
### Frente A, venda no balcão e no salão

- [ ] A01 | eixo: robustez | onde: PDVView/index.jsx:1219 (PDV, cancelar item pelo carrinho)
      hoje: cancelando parcialmente um item lançado, a metade cancelada nasce com o MESMO `uid` da metade que continua ativa. O caminho do checkout já resolve isso com `uid: crypto.randomUUID()`, e o comentário de lá explica o prejuízo: com uid herdado, `mesclarItensComanda` trata a linha cancelada como já conhecida e a descarta no primeiro lançamento vindo do Palm, então o item volta inteiro para a conta e o cliente paga o que foi cancelado. Nenhum teste cobre `onRemoveAcumulado`.
      depois: dar `uid` novo à metade cancelada, igual ao checkout.
      evidência: `index.jsx:1219` contra `:509`, e o comentário em `:502`.
      valor: 5 | esforço: 1 | risco: 1 | score: 7
- [ ] A02 | eixo: qualidade | onde: MobilePage.jsx:258 e 297 (Palm, abrir comanda e lançar itens)
      hoje: as duas chamadas passam o tipo da ação na posição do usuário. A assinatura é `logAction(operatorId, actionType, payload)`, então o banco recebe `operator_id: "comanda:abrir"`, `action_type: "[object Object]"` e `payload: null`. Toda comanda aberta e todo lançamento do garçom entram na trilha sem operador e fora de qualquer filtro por tipo.
      depois: passar `currentUser?.username` como primeiro argumento, como a chamada correta do mesmo arquivo na linha 791.
      evidência: `logger.js:24`, `MobilePage.jsx:258`, `:297`, contra `:791`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] A04 | eixo: robustez | onde: PDVView/index.jsx:738 (modal Nova Comanda)
      hoje: nada impede abrir duas comandas com o mesmo nome. No Palm o mapa por número mantém só uma, então o garçom lança na comanda errada por sorteio de ordem.
      depois: repetir a checagem que o próprio arquivo já faz na transferência, bloqueando com "Comanda 5 já existe".
      evidência: `index.jsx:594` tem a checagem; `schema.sql:294` não tem unicidade.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] A03 | eixo: ux | onde: modals/FechamentoModal.jsx:323 (Fechar Caixa)
      hoje: dá para fechar o caixa com falta de R$ 80,00 sem escrever uma palavra, e grava `observacao: null`. A regra escrita diz o contrário: `docs/03_REGRAS_DE_NEGOCIO/CAIXA.md:20` exige justificativa quando há divergência.
      depois: com `situacao !== "conferido"`, exigir a observação, desabilitando o botão com o motivo ao lado.
      evidência: `FechamentoModal.jsx:371` só olha `salvando`; `:114` já calcula a situação.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [ ] A06 | eixo: produto | onde: PDVView/index.jsx:1104 (Frente de Caixa, buscar comanda)
      hoje: o campo descarta tudo que não é dígito, então digitar "Balcão" não escreve nada e não dá retorno nenhum. A capacidade de achar por nome e por garçom já existe embaixo (`ComandaGrid.jsx:60`), e o modal de nova comanda sugere justamente nomes não numéricos ("Ex: Mesa 1, Balcão, Delivery").
      depois: aceitar texto no campo, sem tocar no resto.
      evidência: `index.jsx:1104`, `ComandaGrid.jsx:60`, `index.jsx:1284`; no Palm a busca por nome já funciona (`MobilePage.jsx:464`).
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] A10 | eixo: ux | onde: PDVView/index.jsx:1748 (modal Mesa)
      hoje: clicar no fundo do modal de mesa CONFIRMA, e a confirmação não valida o campo. O campo é obrigatório, mostra "Campo obrigatório." e desabilita o botão, mas o clique fora é um atalho que entra na comanda com mesa em branco, e comanda sem mesa não aparece no mapa do salão. É o único overlay do arquivo cujo clique fora não é cancelamento.
      depois: clique fora fecha, e a confirmação sai cedo com campo vazio.
      evidência: `index.jsx:1748` contra `:1267`, `:1311`, `:1417`, `:1671`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] A05 | eixo: ux | onde: MobilePage.jsx:788 e 797 (Palm, excluir item)
      hoje: as duas mensagens do fluxo de exclusão não agendam a limpeza, e o aviso fica colado no topo da tela até outro toast aparecer. Todas as outras chamadas do arquivo pareiam `setToast` com o timeout.
      depois: acrescentar o `setTimeout` nas duas.
      evidência: `Toast.jsx:18`, `MobilePage.jsx:355`, `:392`, `:421`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] A09 | eixo: robustez | onde: MobilePage.jsx:135 (Palm, pedidos em espera)
      hoje: a fila de esperas vive só em `useState`. Recarregar a tela, ou tocar no botão que troca de endereço para lançar pelo Wi-Fi do caixa, apaga os pedidos acumulados de várias mesas sem aviso, e nada foi ao servidor. A própria lib diz que "a tela cuida de estado e persistência", e a persistência não existe.
      depois: persistir no `localStorage` do aparelho e reidratar validando o que voltou.
      evidência: `pedidosEmEspera.js:3`, nenhum `localStorage` em `MobilePage.jsx`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [ ] A11 | eixo: robustez | onde: PDVView/CheckoutView.jsx:755 (pagamento dividido)
      hoje: o valor de cada pagamento do split aceita negativo, então R$ 100,00 mais R$ -50,00 fecha uma conta de R$ 50,00 e grava pagamento negativo na venda e no caixa. O campo "Recebido", no mesmo arquivo, já foi protegido disso.
      depois: clampar em zero na entrada.
      evidência: `CheckoutView.jsx:755` contra `:29` e `:788`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [ ] A12 | eixo: robustez | onde: PDVView/index.jsx:1886 (modal Saldo do Dia)
      hoje: a consulta dos logs de comanda cancelada não olha o erro nem tem estado de carregando, então o card "Cancelamentos do Dia" pode mostrar menos do que o real sem o gerente saber.
      depois: tratar o erro e marcar carregando.
      evidência: `index.jsx:1886`, valor usado em `:1915`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1

### Frente D, acesso, plataforma e contexto

- [ ] D01 | eixo: qualidade | onde: AppContext.jsx:734 com lib/tenant.js:46 (sessão da plataforma)
      hoje: quando o super-admin entra, `buscarTenantAtual()` devolve o estabelecimento mais antigo (a policy de `tenants` tem o ramo de super-admin e o `limit(1)` pega um cliente real). A guarda que protege a marca neutra só vale quando `ehConsoleHost()` é verdadeiro, e esse switch nasce desligado. Então o Console é pintado com a paleta daquele cliente, a aba recebe o nome dele e, pior, a marca é gravada no cache POR ORIGEM: o próximo funcionário daquele endereço abre o login vendo a marca de outro estabelecimento. É exatamente o que a decisão 017 proíbe.
      depois: tratar `role === "plataforma"` igual a `ehConsoleHost()` na guarda que já existe, limpando os tokens, fixando o título neutro e não gravando cache.
      evidência: `AppContext.jsx:734` e o comentário acima dela, `tenant.js:46`, migration `20260726:61`, `consoleHost.js:43`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] D02 | eixo: qualidade | onde: AdminView.jsx:994 e 1194 (Gestão, card Impostos)
      hoje: `ImpostosTab` existe e nunca é usado, quem abre a seção é `ImpostosAdmin`, que lê outra fonte. Sobrou a leitura da chave morta `config.impostos` alimentando o contador, então o card anuncia "0 registros" para quem tem alíquotas configuradas, e o dono clica achando que nunca configurou nada. Junto ficam cerca de 175 linhas de tela morta que ainda gravam na chave abandonada.
      depois: contador vindo de `itens_fiscal`, com o mesmo `head: true` já usado para notas, e o componente morto sai.
      evidência: `AdminView.jsx:994`, `:1194`, `:1253`, `:1326`, `ImpostosAdmin.jsx:469`.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [ ] D03 | eixo: ux | onde: LoginPage.jsx:232 (porta de entrada do estabelecimento)
      hoje: a tela que a equipe usa todo dia não é um `form`: dois `div` com Enter em cada campo, botão sem `type`, nenhum `autoFocus`. O login do Console, irmão desta tela, foi corrigido exatamente nisso, e o comentário de lá diz o motivo: sem o `form` o gerenciador de senha não reconhece a tela e o botão "ir" do teclado do celular não envia.
      depois: `form` com `onSubmit`, botão `type="submit"`, `autoFocus` no usuário, e os dois `onKeyDown` saem.
      evidência: `LoginPage.jsx:232` contra `ConsoleLoginPage.jsx:89`, `:110`, `:150`.
      valor: 4 | esforço: 1 | risco: 2 | score: 3
- [ ] D04 | eixo: ux | onde: ConfiguracoesView.jsx:336 (Configurações, Usuários)
      hoje: `isAdmin` inclui gerente e libera "+ Novo Usuário", "Editar" e "Excluir", mas as quatro policies de `public.users` exigem admin, então tudo volta recusado. E sem a policy de leitura ampla o gerente só lê a própria linha, então o cabeçalho anuncia "1 usuário ativo" num estabelecimento com dez. Fere "prevenção de erro antes de mensagem de erro".
      depois: usar `isAdminReal`, que já existe quatro linhas abaixo, e trocar a contagem por uma linha dizendo que só o administrador gerencia a equipe.
      evidência: `ConfiguracoesView.jsx:336`, `:474`, `:476`, `:539`, migration `20260739:54`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [ ] D08 | eixo: ux | onde: ConfiguracoesView.jsx:1045 (Configurações, Unidades de Medida)
      hoje: mesma confusão de papel do D04 em outra aba, e a mensagem de falha manda "tentar de novo" uma coisa que nunca vai funcionar para o gerente. A aba vizinha de meios de pagamento já faz certo.
      depois: `isAdmin` só admin nesta aba, e a mensagem diz que só o administrador altera as unidades.
      evidência: `ConfiguracoesView.jsx:1045`, `:1071`, contra `:808`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [ ] D05 | eixo: ux | onde: AdminView.jsx:88 e ConfiguracoesView.jsx:569 e 731 (modais do lado do estabelecimento)
      hoje: os sete modais do Console fecham com Esc e prendem o foco; três modais do estabelecimento tratam só o clique no fundo, então Esc não faz nada e o Tab passeia pela tela atrás do modal.
      depois: trocar por `useFecharModal` mais `useFocoDoModal`, que já existem com teste.
      evidência: `useFecharModal.js:3`, `overlayFechar.js:32`, `AdminView.jsx:88`, `ConfiguracoesView.jsx:569`, `:731`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [ ] D06 | eixo: robustez | onde: routes/PrivateRoute.jsx:33 (toda rota protegida)
      hoje: o redirecionamento para o login não consulta `loading`, embora a checagem de assinatura logo abaixo consulte. Numa aba nova aberta direto em `/app/pdv`, a tela de login pisca no meio do turno antes de a sessão ser restaurada.
      depois: enquanto `loading` e sem `currentUser`, mostrar a espera em vez de redirecionar.
      evidência: `PrivateRoute.jsx:33` contra `:46`, `AppContext.jsx:169`, `utils/session.js:23`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [ ] D07 | eixo: produto | onde: AdminView.jsx:860 (Gestão, Compras)
      hoje: a tabela de compras renderiza tudo, sempre, sem busca por fornecedor e sem recorte por situação. Depois de um ano é rolagem cega, e a pergunta do dia (o que está pendente com o fornecedor X) não tem resposta na tela. O Console já tem o desenho pronto para copiar.
      depois: busca por fornecedor, três atalhos de situação com contagem, e corte de renderização em blocos.
      evidência: `AdminView.jsx:860`, contraste em `ConsolePage.jsx:1064`.
      valor: 3 | esforço: 3 | risco: 1 | score: 1

## Resumo da varredura

Fluxos verificados, contando as quatro frentes: 53. Achados com evidência: 41.
Nenhum fluxo apareceu quebrado no caminho felizment; o padrão dos furos é outro, e
ele se repete nas quatro frentes:

1. **Falha de leitura virando estado vazio.** A tela afirma "não existe" quando o
   certo era "não deu para ler". Aparece em C05, C08, C09, B04, A12, e é o engano
   mais perigoso porque convida a refazer o que já foi feito.
2. **Falha de gravação sem retorno na tela.** C04, B02, e no C04 o log de
   atividade ainda registra o que não aconteceu.
3. **O mesmo fluxo corrigido no celular e não no desktop.** B04, B08, A07, A06.
   O mobile virou a referência e o desktop ficou atrás.
4. **Permissão checada no cliente com mais folga do que no banco.** D04, D08,
   onde o botão existe e a gravação sempre volta recusada.

O que NÃO apareceu, e é resultado tanto quanto o resto: nenhum segredo, chave ou
URL de API no código, nenhum `console.log` de dado sensível em todo o `src`,
nenhum `select *` em tabela sensível da lista do CLAUDE.md, nenhum caminho para um
usuário comum alcançar o papel de super-admin, e o isolamento entre tenants
íntegro nas leituras do app. O fluxo de fechar a conta (troco, split, TEF offline,
fiado, NFC-e, retry da pendência) é o mais bem defendido do sistema.
