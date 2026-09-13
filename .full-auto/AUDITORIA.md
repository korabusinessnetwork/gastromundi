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

- [x] N01 | eixo: robustez | onde: src/pages/LoginPage.jsx:177 mais o `login` do AppContext (tela de login)
      hoje: com o servidor inalcançável, a tela diz "Usuário ou senha incorretos. 4 tentativa(s) restante(s)" e consome uma tentativa. Falha de rede é relatada como credencial errada.
      depois: distinguir falha de conexão de credencial recusada, mostrar "Sem conexão com o servidor, tente de novo em instantes" e não gastar tentativa nesse caso.
      evidência: navegador em `/login` com `VITE_SUPABASE_URL` apontando para um host morto. O console registra `net::ERR_CONNECTION_REFUSED` e a tela, no mesmo instante, escreve "Usuário ou senha incorretos. 4 tentativa(s) restante(s)".
      valor: 5 | esforço: 2 | risco: 2 | score: 4
- [x] N02 | eixo: ux | onde: src/pages/LoginPage.jsx:250 (botão de mostrar senha)
      hoje: no celular o botão do olho mede 26x26 px, menos da metade do alvo de toque confortável.
      depois: área de toque de no mínimo 44x44 px, mantendo o ícone do tamanho atual.
      evidência: medido no navegador em 390x844, `getBoundingClientRect` do botão "Mostrar senha" devolveu 26x26, contra 304x53 do botão Entrar e 304x51 dos campos.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] N03 | eixo: ux | onde: src/pages/LoginPage.jsx:234 e 244 (rótulos do login)
      hoje: os rótulos "Usuário" e "Senha" não estão associados ao campo (sem `htmlFor`, sem o campo dentro do rótulo). Clicar no rótulo não foca o campo e o leitor de tela não anuncia o par.
      depois: associar rótulo e campo por id.
      evidência: consulta no DOM devolveu `{"txt":"Usuário","htmlFor":null,"temInputDentro":false}` e o mesmo para "Senha".
      valor: 2 | esforço: 1 | risco: 1 | score: 1 (abaixo do corte, fica no backlog)
- [x] N04 | eixo: ux | onde: index.html mais as telas de `/app` (título da aba)
      hoje: a aba diz "Kora" em todas as telas do estabelecimento. Quem trabalha com PDV, cozinha e relatório abertos em três abas vê três abas idênticas, e o nome do estabelecimento nunca aparece, o que também é marca da plataforma na aba de um cliente white-label.
      depois: título por tela com o nome do tenant, no padrão "Nome do estabelecimento, PDV".
      evidência: navegador em `/login` devolveu `title = "Kora"`; `grep document.title` mostra ajuste só no apex, no console e nas pautas, nenhum nas telas de `/app`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] N05 | eixo: qualidade | onde: build (bundle principal)
      hoje: o chunk principal fecha em 2.442,98 kB (702,49 kB gzip) e o build avisa. O PWA pré-carrega 3.877,99 KiB.
      depois: separar do chunk principal o que só uma tela usa (o caminho mais claro é o que já foi feito com o apex e o cardápio, `lazy` por rota de `/app`).
      evidência: saída do `npm run build` de 2026-09-12, "Some chunks are larger than 2000 kB".
      valor: 3 | esforço: 3 | risco: 2 | score: -1 (abaixo do corte; vale medir por rota antes, não entra nesta rodada)

## Parte 2, achados da leitura de código por fluxo

<!-- preenchido com os relatórios das quatro frentes -->
### Frente C, cadastros, dinheiro e fiscal

Score calculado por mim sobre os números da frente. Onde eu discordei, a nota
está reavaliada e o motivo fica escrito.

- [x] C01 | eixo: robustez | onde: relatorio/RelatorioView.jsx:890 e 531 (Relatórios, Vendas detalhado e export)
      hoje: venda cancelada sai dos relatórios, mas ITEM cancelado dentro de venda válida continua listado como vendido, conta no "3 itens" do cabeçalho e vai para o PDF e o Excel. A soma dos subtotais exibidos não fecha com o total da comanda, porque o total foi calculado sem ele. O mesmo item também aparece na aba Cancelamentos, então é contado duas vezes em dois lugares que se contradizem.
      depois: filtrar `it.cancelado` na lista, na contagem e no export, ou marcar a linha como cancelada e mantê-la fora da soma.
      evidência: verifiquei eu mesmo. `RelatorioView.jsx:890` monta `itens` sem filtro, `:891` soma tudo, `:976` mapeia tudo, `:531` repete no export. `useFinalizarPagamento.js:69` calcula o total com `filter(i => !i.cancelado)`, e a aba Cancelamentos em `:438` filtra `it.cancelado`, prova de que o campo existe.
      valor: 5 | esforço: 1 | risco: 1 | score: 7
- [x] C04 | eixo: ux | onde: ProdutosView.jsx:417 (Produtos, excluir)
      hoje: `confirmarDelete` ignora o retorno de `removeProduct`, grava "Produto removido" no log e fecha o modal. Quando a RLS barra, o contexto devolve `no_rows_deleted`, o produto continua na tela e o log registra exclusão que não houve.
      depois: checar o erro, manter o modal aberto com aviso, e só registrar no log quando não houver erro, que é o padrão que a própria função `salvar` usa na linha 409.
      evidência: verifiquei eu mesmo. `ProdutosView.jsx:417` descarta o retorno, `AppContext.jsx:1295` devolve `{ error: { code: "no_rows_deleted" } }`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] C02 | eixo: robustez | onde: FinanceiroView.jsx:88 (Financeiro, card Lucro)
      hoje: a receita vem de `sales`, limitada a 90 dias no bootstrap, e as saídas vêm de `lancamentos`, sem recorte. Escolher um mês de mais de 90 dias atrás dá receita zero e despesa cheia: prejuízo inventado, em vermelho, num mês que pode ter sido o melhor do ano.
      depois: quando o período pedido começa antes da janela que `sales` cobre, não calcular o card e dizer que o lucro daquele período não está disponível na tela, como a tela já faz com `naoLido`.
      evidência: `FinanceiroView.jsx:89`, `AppContext.jsx:340` (janela de 90 dias), `FinanceiroView.jsx:97`.
      valor: 5 | esforço: 2 | risco: 2 | score: 4
- [x] C05 | eixo: robustez | onde: NotasFiscaisTab.jsx:274 (Notas de entrada, lista)
      hoje: falha de leitura cai em `setNotas(data || [])` e a tela afirma "Nenhuma nota importada". Quem acabou de importar lê que a nota não existe e importa de novo; nota lançada à mão não tem chave de acesso, então a duplicidade passa e dá entrada dobrada no estoque.
      depois: capturar o erro, marcar estado de falha e mostrar o motivo com "Tentar de novo", o mesmo para `openDetalhe`.
      evidência: `NotasFiscaisTab.jsx:274`, textos em `:1237` e `:1260`, verificação de duplicidade por chave em `:405`.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [x] C06 | eixo: produto | onde: fiscal/HistoricoNfce.jsx:153 (Notas emitidas)
      hoje: a fila offline avisa bem, mas nota que chegou à SEFAZ e voltou rejeitada, ou ficou pendente, não tem sinal em nenhum lugar do front. Para achar é preciso suspeitar e clicar no chip "Rejeitadas". Venda sem nota válida fica invisível por tempo indeterminado.
      depois: contagem por situação nos chips, com destaque quando for maior que zero.
      evidência: `HistoricoNfce.jsx:153` reage só a `naFila`; `nfceEmitidasRepo.js:22` não expõe contagem.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [x] C11 | eixo: robustez | onde: EstoqueView.jsx:535 (Estoque, entrada)
      hoje: o botão Adicionar tem trava de duplo clique, o Enter não. Como o campo só limpa depois da gravação, dois Enter disparam duas entradas com a mesma quantidade, e quem soma é o banco: entrada em dobro no saldo e no histórico.
      depois: `if (e.key === "Enter" && !busy)`.
      evidência: verifiquei eu mesmo. `EstoqueView.jsx:535` contra `:554`, e nem `handleAdicionar` nem o helper `gravar` consultam `busy`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] C08 | eixo: robustez | onde: relatorio/RelatorioView.jsx:355 (Relatórios, Logs)
      hoje: a carga de `operator_logs` ignora o erro e a aba fica vazia, indistinguível de "não houve atividade". É o que o dono consulta justamente quando desconfia de algo.
      depois: guardar o erro e mostrar aviso com "Tentar de novo".
      evidência: verifiquei eu mesmo, `:355` tem `.then(({ data }) => ...)` sem `error`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] C09 | eixo: robustez | onde: ProdutosView.jsx:174 (Produtos, cadastro)
      hoje: a leitura de `unidades_medida` ignora o erro. Falhando, o modal diz "Nenhuma unidade de estoque cadastrada" (afirmação falsa) e a validação bloqueia o salvamento sem caminho de saída. O bloco das categorias, logo acima, trata isso certo.
      depois: capturar o erro e trocar o texto de vazio por falha de leitura com "Tentar de novo".
      evidência: verifiquei eu mesmo. `:174` descarta `error`, contra `:167` que trata.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] C03 | eixo: robustez | onde: CombosView.jsx:74 e 93 (Produtos, Combos, editar)
      hoje: as duas leituras da composição ignoram o erro. Se a de `combo_produtos` falhar e a outra passar, o modal abre sem os produtos e salvar apaga a composição sem reinserir nada, regravando o preço mais baixo. O teste que existe cobre falha no DELETE, não na LEITURA.
      depois: guardar o erro das duas leituras, avisar e bloquear o Salvar, como a tela já faz na carga da lista.
      evidência: `CombosView.jsx:74`, `:93`, `:199`, `:221`.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [x] C10 | eixo: qualidade | onde: RelatorioView.jsx:78, DesempenhoReport.jsx:33, NotasFiscaisTab.jsx:26, financeiro/ResumoCards.jsx:6, CombosView.jsx:36
      hoje: cinco formatadores locais e idênticos de dinheiro, todos `"R$ " + toFixed(2)`, que mostram "R$ 1234.56" onde o dono lê R$ 1.234,56. O projeto já formata certo em outros lugares, então a tela de dinheiro do desktop é a exceção.
      depois: um formatador único com `Intl.NumberFormat("pt-BR")` e as cinco telas importando dele.
      evidência: as cinco linhas citadas contra `MovimentoCaixaModal.jsx:10` e `deliveryPedidos.js:189`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] C07 | eixo: robustez | onde: lib/financeiro.js:129 com FinanceiroView.jsx:53 (Financeiro)
      hoje: a tela chama `listarLancamentos({})` sem data e sem limite e recorta na memória. Passando do teto de linhas do PostgREST, o mês antigo aparece zerado sem aviso.
      depois: passar `de` e `ate` na chamada, os filtros já existem na função.
      evidência: `financeiro.js:129`, `FinanceiroView.jsx:53`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [x] C12 | eixo: ux | onde: RelatorioView.jsx:52 com lib/exportReport.js:16
      hoje: o chip "Tudo" não recorta, mas a lista que ele não recorta já vem limitada a 90 dias. O PDF sai com "Período: Todo o período" sobre dados de 90 dias, e é esse arquivo que vai para o contador.
      depois: renomear o atalho para o que ele mostra, ou buscar sob demanda.
      evidência: `RelatorioView.jsx:52`, `AppContext.jsx:340`, `exportReport.js:16`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1

### Frente B, delivery, vitrine pública, cozinha e clientes

- [x] B03 | eixo: ux | onde: DeliveryView.jsx:2402 e 2662 (Delivery, Entrega e taxas)
      hoje: a lixeira da faixa de taxa grava no banco na hora, sem confirmação, sem desfazer e sem aviso. Um toque errado apaga a faixa do bairro e, daquele segundo em diante, todo cliente do bairro lê "fora da nossa área de entrega" na vitrine, sem ninguém perceber. A mesma tela confirma em dois outros lugares.
      depois: reusar a confirmação em duas etapas do cartão de produto, dizendo qual faixa sai.
      evidência: `:2402` grava direto, chamada no `onClick` de `:2662`; confirmação existente em `:2192` e `:982`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] B04 | eixo: robustez | onde: DeliveryView.jsx:682 (Delivery, Pedidos, ver itens)
      hoje: "Ver itens" descarta o erro, a lib devolve lista vazia em qualquer falha e a tela escreve "Sem itens detalhados". Como `itens` deixou de ser nulo, fechar e abrir não tenta de novo: a mentira fica colada até recarregar a página. O módulo mobile já corrigiu isso, e o comentário de lá diz o prejuízo: "o entregador saía sem a comida certa".
      depois: guardar o erro como o mobile guarda e refazer a busca quando a tentativa anterior falhou.
      evidência: `DeliveryView.jsx:682` contra `DeliveryModulo.jsx:226` e `:420`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] B02 | eixo: ux | onde: CozinhaView.jsx:53 e 64 (Cozinha, fila)
      hoje: "Iniciar Preparo" e "Marcar Pronto" tratam falha com `console.error` e nada mais. O botão volta ao normal, o cartão não muda e a cozinha não recebe uma palavra. E a falha não é rara: o guard otimista responde erro justamente quando outra estação já avançou a comanda.
      depois: mostrar no cartão o mesmo tipo de aviso que a falha de carga já mostra, com texto humano para o caso de outra estação ter avançado.
      evidência: `CozinhaView.jsx:53` e `:64`; `role="alert"` só em `:92`.
      valor: 4 | esforço: 2 | risco: 1 | score: 5
- [x] B05 | eixo: qualidade | onde: lib/travessaoGuard.test.js:64 mais 5 telas
      hoje: o guard da regra absoluta do dono está furado, e o furo é contra o que o próprio arquivo documenta: o comentário diz que a comparação é exata, "sem `trim`, porque `" — "` com espaço dos dois lados é separador", e o código faz `texto.trim() === "—"` para `JSXText`. Em JSX o separador sempre nasce com espaço em volta, então a única forma que a regra proíbe é a que o guard libera. Passam hoje 5 separadores reais: a observação do item no cartão do pedido do Delivery, o mesmo na Cozinha mobile e no Delivery mobile, e o cabeçalho da nota em dois pontos de NotasFiscaisTab.
      depois: fechar o furo no `marcadorDeVazio` (o `JSXText` só é marcador quando é o conteúdo inteiro do elemento) e trocar as 5 ocorrências por vírgula.
      evidência: verifiquei eu mesmo. `travessaoGuard.test.js:64` contra o comentário em `:22`; ocorrências em `DeliveryView.jsx:748`, `CozinhaModulo.jsx:277`, `DeliveryModulo.jsx:430`, `NotasFiscaisTab.jsx:841` e `:1110`. A suíte do guard passa verde com as cinco no repositório.
      valor: 4 | esforço: 2 | risco: 1 | score: 4 (reavaliei o risco de 2 para 1: é um teste mais cinco trocas de texto, nada de fluxo)
- [x] B01 | eixo: robustez | onde: lib/deliveryPedidos.js:224 com DeliveryView.jsx:517 (Delivery, Pedidos)
      hoje: a consulta traz todos os pedidos de delivery do tenant, sem limite, sem recorte de data e sem paginação, e a coluna "Entregue" renderiza um cartão por pedido entregue desde o primeiro dia, sem altura máxima. Acima do teto de linhas o PostgREST corta em silêncio e o número da coluna passa a mentir.
      depois: recortar as colunas terminais ao dia, mantendo as não terminais sempre visíveis, ou limite com "ver mais".
      evidência: `deliveryPedidos.js:224` sem `range`/`limit`, `DeliveryView.jsx:517`.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [x] B06 | eixo: produto | onde: DeliveryView.jsx:886 (Delivery, Cardápio)
      hoje: a grade do cardápio não tem busca, nem filtro de disponibilidade, nem contagem de quantos estão fora do ar. Para trocar a foto de um item o dono rola a grade inteira. O helper `filtrarItensDelivery` já existe e já é usado na mesma tela, só não nesta aba.
      depois: campo de busca sobre a grade usando o helper que já existe, mais atalho de "só indisponíveis".
      evidência: `DeliveryView.jsx:886`, helper em `deliveryAdmin.js:142` usado em `:2237`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] B09 | eixo: qualidade | onde: DeliveryView.jsx:2519 e 2523 (Delivery, Entrega e taxas)
      hoje: "Pedido mínimo" e "Tempo de preparo" gravam no `onBlur` sem comparar com o valor anterior. Passar o foco pelo campo e sair escreve no banco, escreve no `activity_log` e diz "Configurações salvas". A trilha de auditoria ganha alterações que não existiram.
      depois: sair sem fazer nada quando o payload sanitizado é igual ao que já está em `config`.
      evidência: `:2519`, `:2523`, corpo de `salvar` em `:2369`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [x] B08 | eixo: ux | onde: DeliveryView.jsx:523 e 766 (Delivery, Pedidos)
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

- [x] A01 | eixo: robustez | onde: PDVView/index.jsx:1219 (PDV, cancelar item pelo carrinho)
      hoje: cancelando parcialmente um item lançado, a metade cancelada nasce com o MESMO `uid` da metade que continua ativa. O caminho do checkout já resolve isso com `uid: crypto.randomUUID()`, e o comentário de lá explica o prejuízo: com uid herdado, `mesclarItensComanda` trata a linha cancelada como já conhecida e a descarta no primeiro lançamento vindo do Palm, então o item volta inteiro para a conta e o cliente paga o que foi cancelado. Nenhum teste cobre `onRemoveAcumulado`.
      depois: dar `uid` novo à metade cancelada, igual ao checkout.
      evidência: `index.jsx:1219` contra `:509`, e o comentário em `:502`.
      valor: 5 | esforço: 1 | risco: 1 | score: 7
- [x] A02 | eixo: qualidade | onde: MobilePage.jsx:258 e 297 (Palm, abrir comanda e lançar itens)
      hoje: as duas chamadas passam o tipo da ação na posição do usuário. A assinatura é `logAction(operatorId, actionType, payload)`, então o banco recebe `operator_id: "comanda:abrir"`, `action_type: "[object Object]"` e `payload: null`. Toda comanda aberta e todo lançamento do garçom entram na trilha sem operador e fora de qualquer filtro por tipo.
      depois: passar `currentUser?.username` como primeiro argumento, como a chamada correta do mesmo arquivo na linha 791.
      evidência: `logger.js:24`, `MobilePage.jsx:258`, `:297`, contra `:791`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] A04 | eixo: robustez | onde: PDVView/index.jsx:738 (modal Nova Comanda)
      hoje: nada impede abrir duas comandas com o mesmo nome. No Palm o mapa por número mantém só uma, então o garçom lança na comanda errada por sorteio de ordem.
      depois: repetir a checagem que o próprio arquivo já faz na transferência, bloqueando com "Comanda 5 já existe".
      evidência: `index.jsx:594` tem a checagem; `schema.sql:294` não tem unicidade.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] A03 | eixo: ux | onde: modals/FechamentoModal.jsx:323 (Fechar Caixa)
      hoje: dá para fechar o caixa com falta de R$ 80,00 sem escrever uma palavra, e grava `observacao: null`. A regra escrita diz o contrário: `docs/03_REGRAS_DE_NEGOCIO/CAIXA.md:20` exige justificativa quando há divergência.
      depois: com `situacao !== "conferido"`, exigir a observação, desabilitando o botão com o motivo ao lado.
      evidência: `FechamentoModal.jsx:371` só olha `salvando`; `:114` já calcula a situação.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [x] A06 | eixo: produto | onde: PDVView/index.jsx:1104 (Frente de Caixa, buscar comanda)
      hoje: o campo descarta tudo que não é dígito, então digitar "Balcão" não escreve nada e não dá retorno nenhum. A capacidade de achar por nome e por garçom já existe embaixo (`ComandaGrid.jsx:60`), e o modal de nova comanda sugere justamente nomes não numéricos ("Ex: Mesa 1, Balcão, Delivery").
      depois: aceitar texto no campo, sem tocar no resto.
      evidência: `index.jsx:1104`, `ComandaGrid.jsx:60`, `index.jsx:1284`; no Palm a busca por nome já funciona (`MobilePage.jsx:464`).
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] A10 | eixo: ux | onde: PDVView/index.jsx:1748 (modal Mesa)
      hoje: clicar no fundo do modal de mesa CONFIRMA, e a confirmação não valida o campo. O campo é obrigatório, mostra "Campo obrigatório." e desabilita o botão, mas o clique fora é um atalho que entra na comanda com mesa em branco, e comanda sem mesa não aparece no mapa do salão. É o único overlay do arquivo cujo clique fora não é cancelamento.
      depois: clique fora fecha, e a confirmação sai cedo com campo vazio.
      evidência: `index.jsx:1748` contra `:1267`, `:1311`, `:1417`, `:1671`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] A05 | eixo: ux | onde: MobilePage.jsx:788 e 797 (Palm, excluir item)
      hoje: as duas mensagens do fluxo de exclusão não agendam a limpeza, e o aviso fica colado no topo da tela até outro toast aparecer. Todas as outras chamadas do arquivo pareiam `setToast` com o timeout.
      depois: acrescentar o `setTimeout` nas duas.
      evidência: `Toast.jsx:18`, `MobilePage.jsx:355`, `:392`, `:421`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] A09 | eixo: robustez | onde: MobilePage.jsx:135 (Palm, pedidos em espera)
      hoje: a fila de esperas vive só em `useState`. Recarregar a tela, ou tocar no botão que troca de endereço para lançar pelo Wi-Fi do caixa, apaga os pedidos acumulados de várias mesas sem aviso, e nada foi ao servidor. A própria lib diz que "a tela cuida de estado e persistência", e a persistência não existe.
      depois: persistir no `localStorage` do aparelho e reidratar validando o que voltou.
      evidência: `pedidosEmEspera.js:3`, nenhum `localStorage` em `MobilePage.jsx`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [x] A11 | eixo: robustez | onde: PDVView/CheckoutView.jsx:755 (pagamento dividido)
      hoje: o valor de cada pagamento do split aceita negativo, então R$ 100,00 mais R$ -50,00 fecha uma conta de R$ 50,00 e grava pagamento negativo na venda e no caixa. O campo "Recebido", no mesmo arquivo, já foi protegido disso.
      depois: clampar em zero na entrada.
      evidência: `CheckoutView.jsx:755` contra `:29` e `:788`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [x] A12 | eixo: robustez | onde: PDVView/index.jsx:1886 (modal Saldo do Dia)
      hoje: a consulta dos logs de comanda cancelada não olha o erro nem tem estado de carregando, então o card "Cancelamentos do Dia" pode mostrar menos do que o real sem o gerente saber.
      depois: tratar o erro e marcar carregando.
      evidência: `index.jsx:1886`, valor usado em `:1915`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1

### Frente D, acesso, plataforma e contexto

- [x] D01 | eixo: qualidade | onde: AppContext.jsx:734 com lib/tenant.js:46 (sessão da plataforma)
      hoje: quando o super-admin entra, `buscarTenantAtual()` devolve o estabelecimento mais antigo (a policy de `tenants` tem o ramo de super-admin e o `limit(1)` pega um cliente real). A guarda que protege a marca neutra só vale quando `ehConsoleHost()` é verdadeiro, e esse switch nasce desligado. Então o Console é pintado com a paleta daquele cliente, a aba recebe o nome dele e, pior, a marca é gravada no cache POR ORIGEM: o próximo funcionário daquele endereço abre o login vendo a marca de outro estabelecimento. É exatamente o que a decisão 017 proíbe.
      depois: tratar `role === "plataforma"` igual a `ehConsoleHost()` na guarda que já existe, limpando os tokens, fixando o título neutro e não gravando cache.
      evidência: `AppContext.jsx:734` e o comentário acima dela, `tenant.js:46`, migration `20260726:61`, `consoleHost.js:43`.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [x] D02 | eixo: qualidade | onde: AdminView.jsx:994 e 1194 (Gestão, card Impostos)
      hoje: `ImpostosTab` existe e nunca é usado, quem abre a seção é `ImpostosAdmin`, que lê outra fonte. Sobrou a leitura da chave morta `config.impostos` alimentando o contador, então o card anuncia "0 registros" para quem tem alíquotas configuradas, e o dono clica achando que nunca configurou nada. Junto ficam cerca de 175 linhas de tela morta que ainda gravam na chave abandonada.
      depois: contador vindo de `itens_fiscal`, com o mesmo `head: true` já usado para notas, e o componente morto sai.
      evidência: `AdminView.jsx:994`, `:1194`, `:1253`, `:1326`, `ImpostosAdmin.jsx:469`.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [x] D03 | eixo: ux | onde: LoginPage.jsx:232 (porta de entrada do estabelecimento)
      hoje: a tela que a equipe usa todo dia não é um `form`: dois `div` com Enter em cada campo, botão sem `type`, nenhum `autoFocus`. O login do Console, irmão desta tela, foi corrigido exatamente nisso, e o comentário de lá diz o motivo: sem o `form` o gerenciador de senha não reconhece a tela e o botão "ir" do teclado do celular não envia.
      depois: `form` com `onSubmit`, botão `type="submit"`, `autoFocus` no usuário, e os dois `onKeyDown` saem.
      evidência: `LoginPage.jsx:232` contra `ConsoleLoginPage.jsx:89`, `:110`, `:150`.
      valor: 4 | esforço: 1 | risco: 2 | score: 3
- [x] D04 | eixo: ux | onde: ConfiguracoesView.jsx:336 (Configurações, Usuários)
      hoje: `isAdmin` inclui gerente e libera "+ Novo Usuário", "Editar" e "Excluir", mas as quatro policies de `public.users` exigem admin, então tudo volta recusado. E sem a policy de leitura ampla o gerente só lê a própria linha, então o cabeçalho anuncia "1 usuário ativo" num estabelecimento com dez. Fere "prevenção de erro antes de mensagem de erro".
      depois: usar `isAdminReal`, que já existe quatro linhas abaixo, e trocar a contagem por uma linha dizendo que só o administrador gerencia a equipe.
      evidência: `ConfiguracoesView.jsx:336`, `:474`, `:476`, `:539`, migration `20260739:54`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] D08 | eixo: ux | onde: ConfiguracoesView.jsx:1045 (Configurações, Unidades de Medida)
      hoje: mesma confusão de papel do D04 em outra aba, e a mensagem de falha manda "tentar de novo" uma coisa que nunca vai funcionar para o gerente. A aba vizinha de meios de pagamento já faz certo.
      depois: `isAdmin` só admin nesta aba, e a mensagem diz que só o administrador altera as unidades.
      evidência: `ConfiguracoesView.jsx:1045`, `:1071`, contra `:808`.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [x] D05 | eixo: ux | onde: AdminView.jsx:88 e ConfiguracoesView.jsx:569 e 731 (modais do lado do estabelecimento)
      hoje: os sete modais do Console fecham com Esc e prendem o foco; três modais do estabelecimento tratam só o clique no fundo, então Esc não faz nada e o Tab passeia pela tela atrás do modal.
      depois: trocar por `useFecharModal` mais `useFocoDoModal`, que já existem com teste.
      evidência: `useFecharModal.js:3`, `overlayFechar.js:32`, `AdminView.jsx:88`, `ConfiguracoesView.jsx:569`, `:731`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] D06 | eixo: robustez | onde: routes/PrivateRoute.jsx:33 (toda rota protegida)
      hoje: o redirecionamento para o login não consulta `loading`, embora a checagem de assinatura logo abaixo consulte. Numa aba nova aberta direto em `/app/pdv`, a tela de login pisca no meio do turno antes de a sessão ser restaurada.
      depois: enquanto `loading` e sem `currentUser`, mostrar a espera em vez de redirecionar.
      evidência: `PrivateRoute.jsx:33` contra `:46`, `AppContext.jsx:169`, `utils/session.js:23`.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [x] D07 | eixo: produto | onde: AdminView.jsx:860 (Gestão, Compras)
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

---

# Varredura continuada, rodada 2 (2026-09-12)

As áreas que a primeira passagem não cobriu. Mesma regra: só entra o que tem
evidência vista, com arquivo e linha.

## Frente V1, pautas, offline, impressão, hooks, utils e PWA

- [x] V101 | eixo: robustez | onde: hooks/useImpressaoLancamentos.js:56 (impressão automática no caixa)
      hoje: quando o pedido chega pelo realtime, que é a razão de o hook existir, a falha de impressão só vai para `console.error`. E o lançamento é marcado como visto na linha 48, ANTES de imprimir, então nunca é tentado de novo: o papel some e ninguém no salão fica sabendo. O caminho irmão, o pedido que chega pela Ponte na rede local, faz o certo e alimenta o aviso vermelho da tela. Com o driver padrão isso é rotina, não exceção: a impressão automática abre janela sem gesto do usuário e o navegador bloqueia o pop-up.
      depois: passar o mesmo registrador de falha da Ponte para o hook e ligar no aviso que já existe.
      evidência: `useImpressaoLancamentos.js:56` contra `usePonteLocal.js:400` e `:192`.
      valor: 5 | esforço: 2 | risco: 2 | score: 4
- [x] V104 | eixo: qualidade | onde: ponte/palm.html:366 e 400, ponte/painel.html:215, 411, 431, 524, 703, 726
      hoje: oito frases de tela em português usam travessão. Escapam porque o guard varre só `src/`, e a Ponte é front servido fora do bundle. O marcador de célula vazia de `painel.html:199` é legítimo e continua valendo.
      depois: trocar as oito por vírgula e estender o guard aos `.html` da Ponte, senão o mesmo texto volta na próxima tela.
      evidência: as linhas citadas, todas em texto visível; `travessaoGuard.test.js:42` fixa a raiz em `src/`.
      valor: 4 | esforço: 2 | risco: 1 | score: 4
- [x] V102 | eixo: robustez | onde: AppContext.jsx:1003 com shared/IndicadorRede.jsx:15 (dreno da fila offline)
      hoje: o dreno só dispara quando a rede muda, o carregamento muda ou o contador de pendências muda. Se ele parar num erro de rede com o navegador ainda se dizendo online (Wi-Fi sem saída, portal cativo, Supabase fora), nada mais tenta, e o indicador afirma "Enviando N pedidos guardados" para sempre. Só sai disso quem enfileira outra operação ou recarrega a página.
      depois: reagendar o dreno em intervalo enquanto houver pendência, e dizer a verdade quando a última tentativa falhou.
      evidência: o `useEffect` citado é o único gatilho no arquivo inteiro.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [x] V103 | eixo: ux | onde: main.jsx:23 com vite.config.js:25 (atualização do PWA)
      hoje: o service worker usa `autoUpdate` com `immediate: true` e sem `onNeedRefresh`, então o cliente recarrega a aba sozinho assim que a versão nova ativa. Como a Vercel publica produção a cada push na `main`, um deploy no meio do expediente recarrega a tela do caixa sem avisar, levando o que está só na memória, como carrinho montado e ainda não lançado. E a checagem só acontece no carregamento, então aba aberta há dias segue na versão velha sem nada dizer.
      depois: faixa discreta de "nova versão disponível, atualizar", deixando o momento com o operador.
      evidência: `main.jsx:23`, `vite.config.js:25`, e nenhum `onNeedRefresh` em `src/`.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [x] V107 | eixo: ux | onde: components/pautas/PautaCard.jsx:72 (Pautas dos sócios)
      hoje: mudar o status descarta o `{ error }` que o contexto devolve. Falhando a escrita, o botão volta ao normal, o card não sai da coluna e nada é dito: o sócio acha que o clique não pegou e clica de novo. O formulário da mesma tela trata certo.
      depois: mostrar a mesma frase curta do formulário.
      evidência: `PautaCard.jsx:72` contra `PautaForm.jsx:53`.
      valor: 3 | esforço: 1 | risco: 1 | score: 3
- [x] V105 | eixo: robustez | onde: utils/hooks.js:142 (`useMesas`, mapa e reservas do PDV)
      hoje: a carga das mesas não checa erro nem tem `catch`. Falha de rede ou de RLS vira lista vazia com carregamento concluído, e a tela de Reservas diz "Nenhuma mesa cadastrada", convidando a cadastrar de novo mesas que existem. O `usePedidosCozinha`, no mesmo arquivo, expõe `erro` justamente por isso.
      depois: seguir o padrão do vizinho, expor `erro` e `recarregar`.
      evidência: `utils/hooks.js:138` contra `:221`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] V106 | eixo: robustez | onde: lib/offline/filaApp.js:46 com storageIdb.js:225
      hoje: quando o IndexedDB não abre (aba anônima, storage bloqueado, outra aba segurando versão antiga), a fila passa a viver só em memória e fechar a aba apaga venda que já saiu para o cliente. O sinal existe e é exportado como `prontoOffline`, e não tem um consumidor sequer, enquanto o indicador segue prometendo "pedidos guardados".
      depois: consumir o sinal e dizer que os pedidos estão guardados só nesta aba.
      evidência: `filaApp.js:46` sem nenhuma outra ocorrência no `src/`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] V108 | eixo: qualidade | onde: hooks/useImpressaoLancamentos.js (sem teste)
      hoje: o hook que faz o caixa imprimir os pedidos do Palm não tem teste nenhum, embora os vizinhos tenham. As três regras delicadas dele (semeadura que impede reimprimir a véspera, marcar antes de imprimir que impede papel dobrado, fila serial) estão sem rede.
      depois: teste de hook cobrindo semeadura, lançamento novo e eco do realtime.
      evidência: nenhum `*.test.js` cita `useImpressaoLancamentos`.
      valor: 3 | esforço: 2 | risco: 1 | score: 2
- [x] V109 | eixo: robustez | onde: shared/Notification.jsx:12 (toast compartilhado)
      hoje: o temporizador de 2,5 s nunca é guardado nem cancelado: duas notificações seguidas fazem o temporizador antigo apagar a mensagem nova antes da hora, e ele sobrevive à desmontagem.
      depois: guardar o id numa ref, limpar antes de agendar e no desmonte.
      evidência: `Notification.jsx:12`, sem `clearTimeout` no arquivo.
      valor: 2 | esforço: 1 | risco: 1 | score: 1
- [x] V110 | eixo: robustez | onde: shared/JarvasPanel.jsx:77 e 124
      hoje: a busca de insights ignora o erro e grava lista vazia, então busca falha fica idêntica a "não há insight", no painel que o gestor abre para saber se há algo errado. E mudar status faz remoção otimista sem ler o retorno: escrita recusada tira o cartão e ele reaparece na próxima carga.
      depois: aviso com "Tentar de novo" na carga, e desfazer a remoção quando a escrita falha.
      evidência: as duas linhas, sem `error` no destructuring.
      valor: 2 | esforço: 2 | risco: 1 | score: 0

Íntegros nesta frente, verificados e sem achado: a fila offline em si (inclusive
a corrida entre dreno e hidratação, que era a minha maior suspeita), os drivers e
telas de impressão, o fluxo de envio da Ponte, todos os hooks quanto a vazamento
de ouvinte ou temporizador, os utilitários de sessão, data, conversão e
pagamento, os cabeçalhos de cache do PWA e a recuperação de deploy, a fronteira
de dados das Pautas, e o protótipo do apex.

## Frente V2, banco, RLS, Edge Functions e libs de regra

A camada de dados está bem mais endurecida do que o resto: RLS ligada nas 52
tabelas, `search_path` fixo em toda função `SECURITY DEFINER` (com guard na
suíte), policies de tenant `RESTRICTIVE` no padrão do ADR-008, as 9 Edge
Functions revalidando papel e coluna `active`, e o `schema.sql` batendo com as
migrations. A tentativa de escalada mais óbvia (um admin promover funcionário a
`plataforma` para virar super-admin) está fechada por constraint mais `WITH
CHECK`. O que segue é o que sobrou.

- [x] V203 | eixo: qualidade | explorável: sim | onde: supabase/functions/jarvas-assistente/index.ts:148
      hoje: o Jarvas chamava a API paga sem teto e sem contador, e custa mais por chamada que a leitura de cardápio porque manda todo o contexto do negócio no system prompt. A tabela `ia_uso` e a RPC `registrar_uso_ia` existem desde a migration 20260817 e já eram usadas pela função irmã.
      feito: teto diário por estabelecimento no mesmo desenho da irmã, com fail-open, e a recusa chegando ao operador com a dica junto. Sem migration. Precisa de deploy da função.
      valor: 4 | esforço: 1 | risco: 1 | score: 5
- [ ] V201 | eixo: dados | explorável: sim | onde: lib/assinatura.js:60 com migration 20260719_assinaturas.sql:84
      hoje: o status da assinatura é calculado em dois lugares com fuso diferente. O JS lê o dia pelo calendário local do navegador, o SQL lê por `current_date`, que no Supabase é UTC. No Brasil, entre 21h e meia-noite, o banco já está no dia seguinte. No último dia de carência, a partir das 21h, `assinatura_atual_ativa()` passa a devolver falso e as policies RESTRICTIVE fecham até o SELECT de produtos, comandas, mesas e vendas: o PDV fica vazio no meio do movimento enquanto a tela continua dizendo que está tudo em dia, e ninguém liga uma coisa à outra.
      depois: DECISÃO SUA, e é por isso que não executei. Alinhar o JS ao UTC são duas linhas e nenhuma migration, mas contraria uma decisão sua que já está escrita e testada (`assinatura.test.js` tem o caso "um instante em UTC é lido no calendário local de quem opera", e a suíte fixa o fuso em São Paulo de propósito). O conserto de fundo é o banco decidir pelo fuso do estabelecimento, como a `20260903` já fez para o horário do delivery, e isso exige migration. Tentei a primeira via, vi que derrubava 7 testes que codificam a sua decisão, e revertei.
      evidência: `assinatura.js:60` usa getters locais; `20260719:84` usa `current_date`; o comentário em `assinatura.js:68` afirma espelhar a função do banco, e é isso que deixa de ser verdade três horas por dia.
      valor: 5 | esforço: 1 | risco: 2 | score: 5
- [ ] V202 | eixo: segurança | explorável: sim | onde: migration 20260921_delivery_rate_limit_sem_telefone.sql:96
      hoje: o freio do delivery público tem dois baldes, 5 pedidos sem telefone por tenant em 2 minutos e 3 pedidos do mesmo telefone em 2 minutos, e a RPC grava o telefone cru sem validar. Um script que mande um número aleatório a cada requisição cai sempre no ramo "com telefone", nunca chega a 3 para o mesmo número, e cria pedidos sem limite. A tela da Cozinha fica inutilizável no meio do serviço.
      depois: teto geral por tenant no mesmo trigger, como a `20260925_leads_apex` já faz. EXIGE MIGRATION, decisão sua.
      valor: 4 | esforço: 2 | risco: 2 | score: 2
- [ ] V204 | eixo: segurança | explorável: depende de configuração no painel | onde: migration 20260919_pautas.sql:156
      hoje: `eh_socio_pautas()` decide quem é sócio olhando só o domínio do e-mail no JWT (`LIKE '%@pautas.local'`). Se o cadastro público por e-mail e senha estiver habilitado no painel do Supabase, qualquer pessoa com a chave anon se cadastra com esse domínio e vira sócio, lendo e escrevendo as pautas internas da Kora. A tabela `pautas_pessoas`, que lista os três sócios reais, existe logo acima e não participa da checagem. A confirmação de e-mail, se estiver ligada, fecha o caminho, porque `@pautas.local` não recebe correio.
      depois: duas coisas independentes. Você conferir no painel se o signup público está desabilitado, custo zero. E a função passar a exigir que o sócio exista em `pautas_pessoas`, o que EXIGE MIGRATION.
      valor: 3 | esforço: 2 | risco: 2 | score: 2
- [ ] V205 | eixo: dados | explorável: não | onde: AppContext.jsx:344 e os índices de `vendas`
      hoje: `vendas` tem índices separados de `tenant_id` e de `at`, e nenhum composto, mas a consulta mais quente do app (bootstrap de toda sessão) filtra 90 dias por `at` e ordena por `at DESC` sob policy que filtra `tenant_id`. Com um estabelecimento é irrelevante; com vários na mesma tabela, o banco percorre os 90 dias de todos para devolver os de um. Mesmo desenho em `lancamentos` e `operator_logs`. `delivery_pedidos` e `caixa_movimentos` já nasceram com o composto certo, então o padrão existe no projeto.
      depois: índice composto nas três. EXIGE MIGRATION, e é a conta que chega junto com o cliente número dez, não otimização prematura.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
- [ ] V206 | eixo: segurança | explorável: sim, impacto pequeno | onde: migration 20260822_complementos_subgrupos.sql:82
      hoje: quatro funções `SECURITY DEFINER` nunca receberam `REVOKE EXECUTE FROM PUBLIC`, e no Postgres isso concede execução a todos por padrão: a role `anon` alcança as quatro com a chave pública. Duas expõem o que a vitrine já publica de graça; as outras duas respondem se a assinatura de um tenant está em dia e quais módulos o plano inclui, exigindo o UUID do tenant, que nenhuma superfície anônima publica. É a única exceção que sobrou ao padrão que todo o resto do projeto segue.
      depois: `REVOKE` mais `GRANT TO authenticated` nas quatro. EXIGE MIGRATION, ainda que de quatro pares de linhas.
      valor: 2 | esforço: 1 | risco: 1 | score: 1

Registrado sem virar achado, porque é decisão tomada e não defeito: o ramo
`OR is_super_admin()` em `tenant_fiscal_config` (ADR-008 §5) faz com que o raio
de exposição de um token de plataforma vazado inclua CNPJ, inscrição estadual e
`csc_id` de todos os estabelecimentos, e não só o billing. Vale você saber.

## Achado novo da rodada 3 (medição do bundle)

- [ ] N06 | eixo: qualidade | onde: dependências no chunk principal
      hoje: com o Console e o mapa já fora, os dois maiores pesos do chunk principal são `xlsx` (984 kB de fonte, 16% do total medido) e `react-icons` (778 kB, 12,6%). O `xlsx` serve só a importação e exportação de planilha, que é ação de clique, e os ícones entram por importação nomeada em dezenas de telas.
      depois: `xlsx` por import dinâmico no momento do clique, que é o caminho claro. Para os ícones é preciso medir antes se o peso vem de importação que o tree-shaking não alcança ou do volume real de ícones usados, porque a saída muda conforme a resposta.
      evidência: soma dos bytes do sourcemap por pacote, medida na rodada 3, com o chunk em 2.208,83 kB e gzip 639,46 kB depois das duas primeiras separações.
      valor: 3 | esforço: 3 | risco: 2 | score: -1 (abaixo do corte; entra quando houver medição de ganho real por tela)

---

# Varredura da operação 24 horas (2026-09-12)

Contexto que o dono deu e que mudou a leitura do sistema inteiro: **o PDV não
fecha nunca, a aba fica aberta 24 horas** num computador de balcão que não é
desligado. Tudo que o app fazia supondo "abre pela manhã, fecha à noite" virou
suspeito, e a aba atravessa a meia-noite todos os dias sem recarregar.

Duas frentes de varredura, uma sobre sessão e conexão, outra sobre o que
envelhece e o que acumula. O achado central não foi o logout: foi que **o projeto
já tem o conceito certo de turno** (`sessao_aberta_em`) e metade das telas usava
ele enquanto a outra metade usava o dia do calendário, então as duas metades
divergiam toda madrugada.

- [x] S03 | robustez | fila offline drenada sem sessão: cada operação batia na RLS, recusa da RLS não é erro de rede, e a fila DESCARTAVA a venda. Rotina numa operação 24 horas: a rede cai de madrugada, a sessão vence, e o dreno roda sem token quando a rede volta.
- [x] S01, S02 | ux | o teto de 8 horas e a inatividade deslogavam, e deslogar desmonta a árvore: ia o carrinho montado e ainda não lançado. Agora trancam a tela.
- [x] S08 (parte) | robustez | volta do sono reavalia por relógio, incluindo a inatividade, que antes disparava aviso e bloqueio juntos.
- [x] S09 | ux | ver V103 e a rodada 3: o PWA já não recarrega sozinho, e a verificação periódica entrou aqui.
- [x] S06, S07 | robustez | canais de realtime passaram a ler o status, e a lacuna da reconexão passou a refazer a carga. Canal morto em silêncio significava pedido do garçom que não chega ao caixa.
- [x] D01, D02 | dados | Saldo do Dia cortava pelo calendário enquanto o fechamento cortava pelo turno: dois números para o mesmo dinheiro, e o errado era o que o gerente consulta.
- [x] D03 | robustez | a lista de vendas só crescia numa aba que nunca recarrega.
- [x] D04, D05, D06, D13 | ux | recortes de período congelados no dia em que a aba abriu.
- [x] D07 | ux | coluna de entregues do delivery esvaziava sozinha na virada, com o entregador ainda na rua. Corrigido no desktop e no celular.
- [x] D08 | robustez | o motor de alertas do Jarvas rodava uma vez na vida da aba: estava construído, testado e desligado na prática.
- [x] D09 | ux | verificação periódica de versão nova.

Abertos desta varredura, e por quê:

- [ ] D10, D11, D12 | baixa | arestas de aba longa: o botão de cancelar NFC-e que continua oferecido depois do prazo vencer, o histórico fiscal que não recarrega sozinho, e quatro registros de controle que nunca esvaziam. Nenhum produz número errado nem perda; entram numa rodada de arestas.
- [ ] Recarga automática pisca "Conectando ao caixa" | decisão do dono | toda recarga (volta de rede, volta do sono, canal ruim) liga o `loading` por um instante. A frente manteve assim de propósito, para mostrar que o sistema está buscando o que perdeu em vez de fingir estar em dia. Se preferir recarga silenciosa, o `bootstrap` aceita um modo que não mexe no `loading`.

---

# Achados da tela do PDV no celular (2026-09-12, a partir de uma captura do dono)

- [x] L01 | ux | onde: PDVView.css, `.pdv__body`
      hoje: o corpo do PDV era `display: flex` sem direção, ou seja, linha, em qualquer largura. No celular e no tablet, onde o carrinho deixa de ser coluna fixa e entra a barra de abas Produtos e Carrinho, a barra virava uma COLUNA à esquerda. Medido no Chromium com o CSS real, a 390 px: barra com 161 px de largura por 600 de altura, cada botão com 80 por 599, rótulo centralizado no meio vertical da tela, e 229 px sobrando para a comanda inteira.
      feito: modificador `--empilhado` aplicado quando `sz.cartWidth === 0`, com a direção decidida por classe e não por media query, porque quem define o que é celular aqui é o breakpoint em JS. Medido de novo: barra 390 por 51 no topo, área 390 por 549 abaixo.
- [x] L02 | ux | onde: CartPanel, linha do item
      hoje: o nome do produto não aparecia nas linhas do carrinho, só o seletor de quantidade, o preço e a lixeira.
      feito: era consequência do L01, não defeito próprio. Medido: com o carrinho em 229 px o nome fica com 60 px e cortado; com 390 px aparece inteiro. Corrigiu junto.
- [x] L03 | ux | onde: JarvasPanel, sino flutuante, no celular
      hoje: o sino é `position: fixed` no canto inferior direito, e no celular ficava exatamente sobre o botão "Finalizar Comanda", escondendo o valor que o operador confere antes de cobrar.
      feito: no celular o sino sobe para acima da faixa de ação. A posição saiu do estilo inline para o CSS, que era onde ela precisava estar para variar com a largura.
- [ ] L04 | ux | onde: JarvasPanel, sino flutuante, no DESKTOP
      hoje: a mesma sobreposição existe no desktop, e não é a captura do dono, é medição minha: o carrinho é a coluna da direita e o rodapé dele termina no mesmo canto do sino. Só que ali o rodapé é mais alto (total, subtotal e dois botões), então subir 86 px resolveria um botão e cobriria o outro.
      depois: DECISÃO DE DESENHO SUA. O conserto de verdade é o sino se afastar da largura do carrinho (ficar à esquerda da coluna) ou mudar de canto. Não escolhi sozinho porque muda a posição de um elemento que aparece em todas as telas do sistema.
      valor: 3 | esforço: 2 | risco: 2 | score: 0
