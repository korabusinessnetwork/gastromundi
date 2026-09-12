# Mapa de fluxos, GastroMundi

Inventário do que o sistema faz hoje. É o contrato do que precisa ser testado: todo
fluxo daqui aparece em `COBERTURA.md` com um status, inclusive `NAO_TESTADO`.

- Levantado em 12/09/2026, por navegação no app rodando, leitura das rotas, das RPCs do
  banco, das policies de RLS e dos testes que já existem.
- Fontes cruzadas: `src/routes/index.jsx` (25 rotas), 26 RPCs chamadas pelo front, 47
  funções `SECURITY DEFINER` no banco, 60 tabelas, 209 policies, 238 arquivos de teste.
- **Os ids são estáveis.** Eles são usados em `SUITES.json`, em `BUGS.md`, nos testes de
  `tests/e2e/` e na matriz de cobertura. Nunca renumere.
- O esperado de cada fluxo foi inferido do comportamento atual do sistema e da
  documentação (`docs/`, `memory/`, ADRs), não de uma especificação nova. Onde os dois
  divergem, está anotado no fluxo.

Formato: `id | área | ator | criticidade` e, embaixo, o que a pessoa quer e o que se
observa quando dá certo, mais de onde o fluxo foi lido.

---

## A. Acesso, permissão e plataforma (F001 a F045)

F001 | autenticação | operador | alta
  Entrar no sistema pelo endereço do próprio estabelecimento. Espera-se o app abrindo na
  primeira rota permitida do papel, com a marca do estabelecimento e log `auth:login`.
  Origem: src/pages/LoginPage.jsx:167, AppContext.jsx:1013.

F002 | autenticação | operador | alta
  Saber que errou a senha e quantas tentativas restam. Espera-se "Usuário ou senha
  incorretos. N tentativa(s) restante(s)." e os pips marcados. Origem: LoginPage.jsx:162, RPC login_tentativas_falha.

F003 | autenticação | operador | alta
  Ser bloqueado após 5 senhas erradas. Espera-se "Muitas tentativas. Bloqueado por 2
  minutos." com contagem vinda do servidor. Origem: src/lib/loginTentativas.js:39, migration 20260927.

F004 | autenticação | atacante | alta
  Tentar zerar o bloqueio limpando o armazenamento local. Espera-se o bloqueio de pé,
  porque o contador é do servidor. Origem: migration 20260927:232.

F005 | multi-tenant | visitante | alta
  Abrir um endereço que não é de nenhum estabelecimento. Espera-se "Endereço não
  encontrado" sem campos de login. Origem: LoginPage.jsx:69, RPC branding_por_slug.

F006 | multi-tenant | visitante | alta
  Ver a marca do próprio estabelecimento na porta de entrada, nunca a de outro cliente.
  Espera-se logo, cores e título da aba do tenant. Origem: LoginPage.jsx:43, src/lib/brandingCache.js.

F007 | plataforma | super-admin | alta
  Ser recusado ao entrar pela porta de um estabelecimento quando o Console tem host
  próprio. Espera-se recusa sem revelar a URL do painel. Origem: LoginPage.jsx:140, src/lib/consoleHost.js:43.

F008 | plataforma | super-admin | alta
  Entrar no Console pelo host dedicado. Espera-se a aba "KORA · Console" e a lista de
  estabelecimentos, sem marca de tenant. Origem: ConsoleLoginPage.jsx:54.

F009 | plataforma, permissão negada | admin de estabelecimento | alta
  Ser recusado no login do Console. Espera-se sessão encerrada e "Esta conta não tem
  acesso ao Console.". Origem: ConsoleLoginPage.jsx:56, ConsoleRoute.jsx:29.

F010 | isolamento | operador do tenant A | alta
  Tentar entrar no endereço do tenant B com a credencial do A. Espera-se falha de
  autenticação, porque o e-mail é montado com o slug do endereço. Origem: tenantSlug.js:252.

F011 | autenticação | ex-funcionário | alta
  Não operar depois de desativado, mesmo com a senha certa. Espera-se "Usuário não
  encontrado ou inativo." e sessão encerrada. Origem: AppContext.jsx:1072.

F012 | autenticação | operador | alta
  Sair e não deixar a sessão para o próximo turno. Espera-se volta ao login e token
  apagado mesmo sem internet. Origem: AppContext.jsx:1087.

F013 | autenticação | operador | alta
  Ter a sessão encerrada sozinha após 30 minutos parado, com aviso 2 minutos antes.
  Origem: AppContext.jsx:191, src/utils/session.js:5.

F014 | permissão | qualquer papel | alta
  Cair na primeira tela que o papel realmente pode usar. Origem: InicioApp.jsx:22, src/lib/navegacaoInicial.js:38.

F015 | permissão negada | garçom | alta
  Ser barrado ao digitar na URL uma rota do cargo errado, sem laço de redirecionamento.
  Origem: PrivateRoute.jsx:50.

F016 | permissão negada | funcionário sem permissão | alta
  Ver "Você ainda não tem acesso a nenhuma tela" em vez de tela quebrada. Origem: SemAcesso.jsx, roles.js:62.

F017 | permissão, plano | gerente | alta
  Ver convite de upgrade quando o papel permite mas o plano não inclui o módulo.
  Origem: PrivateRoute.jsx:63, migration 20260717:139.

F018 | assinatura | qualquer papel | alta
  Ver a tela de assinatura bloqueada antes de qualquer outra checagem. Origem: PrivateRoute.jsx:46, migration 20260720.

F019 | gestão de usuários | admin | alta
  Cadastrar funcionário com cargo e senha inicial. Origem: ConfiguracoesView.jsx:233, src/lib/adminAuth.js:118.

F020 | gestão de usuários | admin | alta
  Excluir funcionário e o acesso dele, avisando quando o acesso fica órfão.
  Origem: ConfiguracoesView.jsx:297.

F021 | permissão | admin | alta
  Mudar as permissões de um cargo inteiro do próprio estabelecimento. Origem: ConfiguracoesView.jsx:353, migration 20260828:70.

F022 | permissão negada | gerente | alta
  Não conseguir editar permissões, apenas ver. Origem: ConfiguracoesView.jsx:336, migration 20260739.

F023 | permissão | admin | alta
  Dar exceção de permissão a um funcionário sem mudar o cargo dele. Origem: roles.js:123.

F024 | gate de senha | caixa ou garçom | alta
  Liberar ação destrutiva com a senha do administrador presente, com trava de 5
  tentativas por minuto. Origem: adminAuth.js:49, RPC verificar_senha_admin.

F025 | isolamento, gate de senha | operador do tenant A | alta
  Tentar autorizar com a senha de um admin de outro estabelecimento. Espera-se recusa.
  Origem: migration 20260802:253.

F026 | white-label | admin | alta
  Trocar nome de exibição e logo do próprio estabelecimento. Origem: IdentidadeTab.jsx:123, RPC atualizar_identidade_tenant.

F027 | permissão, navegação | caixa ou garçom | alta
  Não ver sequer as abas de Configurações que não pode usar. Origem: ConfiguracoesView.jsx:1306.

F028 | isolamento | operador autenticado | alta
  Tentar ler ou gravar dado de outro estabelecimento por id conhecido. Espera-se leitura
  vazia e escrita recusada pela policy RESTRICTIVE. Origem: migration 20260724.

F029 | isolamento, JWT | operador com sessão antiga | alta
  Perceber que precisa sair e entrar de novo quando o JWT não tem tenant_id.
  Origem: migration 20260724, AppContext.jsx:223.

F030 | plataforma | super-admin | alta
  Ver e filtrar todos os estabelecimentos, com os filtros gravados na URL. Origem: ConsolePage.jsx:120.

F031 | plataforma | super-admin | alta
  Provisionar estabelecimento novo com endereço, plano e administrador. Origem: console.js:1129, migration 20260727.

F032 | plataforma | super-admin | alta
  Trocar o plano de um estabelecimento e mudar os módulos dele na hora. Origem: console.js:1201, RPC alterar_plano_tenant.

F033 | plataforma | super-admin | alta
  Trocar o layout visual de um estabelecimento. Origem: console.js:1267, RPC alterar_layout_tenant.

F034 | plataforma | super-admin | alta
  Ligar ou desligar add-on de um estabelecimento. Origem: console.js:1381, RPC alternar_addon_tenant.

F035 | plataforma, cobrança | super-admin | alta
  Definir mensalidade, registrar pagamento e ver o histórico. Origem: ConsolePage.jsx:385, RPCs de assinatura.

F036 | plataforma | super-admin | alta
  Ver o uso agregado da plataforma no período. Origem: console.js:472, RPC analytics_plataforma.

F037 | plataforma | super-admin | alta
  Ver o que está quebrado na operação dos estabelecimentos. Origem: console.js:612, RPC saude_plataforma.

F038 | plataforma | super-admin | alta
  Aprovar um pedido de conta e criar o estabelecimento dele. Origem: ConsolePage.jsx:281, migration 20260926:261.

F039 | plataforma | super-admin | alta
  Recusar um pedido de conta com motivo. Origem: SolicitacoesFila.jsx:81.

F040 | isolamento de leitura | admin de estabelecimento | alta
  Tentar ler a fila de pedidos de conta ou a base de leads. Espera-se vazio.
  Origem: migration 20260926:104, migration 20260925:85.

F041 | apex | visitante cliente | alta
  Descobrir o endereço do próprio estabelecimento e ser levado ao login dele.
  Origem: ApexEntrarPage.jsx:47.

F042 | apex | visitante | alta
  Pedir a criação da conta escolhendo endereço e plano, sem provisionar nada na hora.
  Origem: ApexCriarContaPage.jsx:85, RPC registrar_solicitacao_conta.

F043 | apex | visitante | alta
  Deixar contato para agendar demonstração. Origem: ApexAgendamento.jsx:106, RPC registrar_lead_apex.

F044 | apex | visitante | alta
  Experimentar o produto sem conta, sem tocar em dado real e sem chamar o Supabase.
  Origem: DemoPage.jsx:29.

F045 | superfície anônima | cliente final | alta
  Abrir o cardápio público sem login, vendo só o cardápio daquele estabelecimento.
  Origem: routes/index.jsx:123, CardapioPage.jsx.

---

## B. Operação: PDV, Palm e cozinha (F046 a F100)

F046 | PDV | operador de caixa | alta
  Não operar o PDV com o caixa fechado. Espera-se a tela "Caixa Fechado" e nenhuma grade
  de comandas. Origem: PDVView/index.jsx:770, config caixa_aberto.

F047 | caixa | gerente ou admin | alta
  Abrir o caixa informando o fundo de troco. Espera-se o badge "● Aberto", o PDV liberado
  e log `caixa:abrir`. Origem: DesktopLayout.jsx:222, AppContext.jsx:1900.

F048 | caixa | gerente ou admin | alta
  Fechar o caixa conferindo o dinheiro contado contra as vendas. Espera-se linha em
  `fechamentos` e o PDV de volta ao bloqueio. Origem: DesktopLayout.jsx:200, AppContext.jsx:1575.

F049 | caixa | caixa com autorização | alta
  Registrar sangria ou suprimento, com senha de gerente acima do limite. Espera-se linha
  em `caixa_movimentos` com autor e autorizador. Origem: MovimentoCaixaModal.jsx:35, AppContext.jsx:1595.

F050 | PDV | operador de caixa | média
  Abrir comanda nova com nome ou número livre. Origem: PDVView/index.jsx:738, AppContext.jsx:1113.

F051 | PDV | operador de caixa | média
  Abrir comanda tocando um slot numerado vazio, sem gravar nada no banco antes do
  primeiro lançamento (comanda virtual). Origem: PDVView/index.jsx:524 e :548.

F052 | PDV | operador de caixa | média
  Abrir ou cobrar uma mesa pelo mapa visual do salão. Origem: MesaMapView.jsx:23, tabela mesas.

F053 | PDV | operador de caixa | baixa
  Marcar mesa como reservada ou em manutenção, ou devolvê-la a livre. Origem: MesaReservasView.jsx:68.

F054 | PDV | operador de caixa | média
  Definir ou corrigir mesa e apelido de uma comanda. Origem: PDVView/index.jsx:231.

F055 | PDV | operador de caixa | alta
  Vincular cliente cadastrado à comanda, para histórico, fiado e nota. Origem: PDVView/index.jsx:281.

F056 | PDV | operador de caixa | baixa
  Montar o carrinho por categoria, busca ou combo. Origem: PDVView/index.jsx:343, CartPanel.jsx.

F057 | PDV | operador de caixa | baixa
  Adicionar produto bipando o código de barras. Origem: PDVView/index.jsx:354, useBarcodeScanner.

F058 | PDV | operador de caixa | alta
  Lançar os itens do carrinho na comanda e mandar a via para a produção. Espera-se os
  itens acumulados com `launched_at` e o papel na impressora. Origem: PDVView/index.jsx:380.

F059 | PDV | operador de caixa | alta
  Ir ao fechamento gravando antes o que estava só no carrinho. Espera-se a conta completa
  no checkout. Origem: PDVView/index.jsx:431.   **Ver bug B01.**

F060 | checkout | operador de caixa | alta
  Aplicar ou tirar a taxa de serviço de 10 por cento. Origem: CheckoutView.jsx:65, config taxa_servico.

F061 | checkout | gerente ou admin | alta
  Dar desconto ou lançar acréscimo com autorização por senha. Origem: CheckoutView.jsx:259.

F062 | checkout | gerente ou admin | alta
  Cancelar item já lançado na hora de fechar a conta, com motivo e responsável.
  Origem: CheckoutView.jsx:293, PDVView/index.jsx:488.

F063 | checkout | operador de caixa | alta
  Dividir a conta entre pessoas ou combinar formas de pagamento, com os centavos do resto
  distribuídos. Origem: CheckoutView.jsx:217.

F064 | checkout | operador de caixa | alta
  Receber em dinheiro e ver o troco, com bloqueio quando o recebido é menor que o devido.
  Origem: CheckoutView.jsx:185.

F065 | checkout | operador de caixa | alta
  Fechar a conta no fiado identificando o cliente, gerando conta a receber em 30 dias.
  Origem: ClienteFiadoSelector.jsx:49, useFinalizarPagamento.js.

F066 | checkout | operador de caixa | alta
  Informar CPF ou CNPJ do cliente na nota antes de emitir a NFC-e. Origem: ModalCpfNota.jsx:29.

F067 | checkout | operador de caixa | alta
  Confirmar o pagamento e fechar a comanda, gravando venda, itens, pagamentos, baixando
  estoque, liberando a mesa e criando a receita. Origem: useFinalizarPagamento.js:53.

F068 | checkout | operador de caixa | alta
  Não conseguir cobrar na maquininha sem internet. Origem: CheckoutView.jsx:173, src/lib/tef.js.

F069 | checkout | operador de caixa | média
  Imprimir a conta do cliente ou o comprovante. Origem: ImpressaoAcoes.jsx:26.

F070 | PDV | operador de caixa | alta
  Transferir itens de uma comanda para outra, existente ou nova. Origem: PDVView/index.jsx:570.

F071 | PDV | gerente ou admin | alta
  Cancelar comanda inteira com itens já lançados, com senha e motivo. Origem: useCancelarComanda.js.

F072 | PDV | operador de caixa | média
  Cancelar comanda ainda sem consumo, informando o motivo. Origem: PDVView/index.jsx:1714.

F073 | PDV | gerente ou admin | alta
  Consultar o saldo do dia: vendas fechadas por método, contas em aberto e cancelamentos.
  Origem: PDVView/index.jsx:1871.

F074 | PDV | operador de caixa | alta
  Não mexer numa comanda que outra pessoa está editando em outro aparelho.
  Origem: AppContext.jsx:1204, src/lib/comandaLock.js.

F075 | PDV | operador de caixa | baixa
  Identificar comandas abertas há horas sem nenhum consumo. Origem: ComandaGrid.jsx:73.

F076 | PDV | operador de caixa | baixa
  Buscar comanda e alternar entre Grade, Mapa, Abertas e Reservas. Origem: PDVView/index.jsx:75.

F077 | PDV | operador de caixa | baixa
  Ver no PDV os avisos de estoque crítico e de validade próxima. Origem: PDVView/index.jsx:985.

F078 | cozinha | cozinheiro | média
  Ver em tempo real os pedidos por etapa de preparo, com atraso destacado. Origem: CozinhaView.jsx:31.

F079 | cozinha | cozinheiro | média
  Iniciar o preparo de um pedido, sem duas estações avançarem o mesmo. Origem: src/lib/cozinha.js:26.

F080 | cozinha | cozinheiro | média
  Marcar um pedido como pronto para o salão. Origem: src/lib/cozinha.js:52.

F081 | cozinha | cozinheiro | baixa
  Reimprimir a via de produção direto do painel. Origem: CozinhaView.jsx:74.

F082 | cozinha | cozinheiro | alta
  Perceber que o painel falhou em carregar em vez de achar que não há pedidos.
  Origem: CozinhaView.jsx:89.

F083 | Palm | garçom | alta
  Não lançar pedido com o caixa fechado. Origem: MobilePage.jsx:427.

F084 | Palm | garçom | média
  Montar o pedido do cliente escolhendo itens no celular. Origem: MobilePage.jsx:188.

F085 | Palm | garçom | alta
  Lançar o pedido numa comanda, criando a comanda se ainda não existir.
  Origem: MobilePage.jsx:238 e :312.

F086 | Palm | garçom | alta
  Acumular pedidos de mesas diferentes e enviar todos de uma vez. Origem: MobilePage.jsx:374, src/lib/pedidosEmEspera.js.

F087 | Palm | garçom | alta
  Ver o detalhe da comanda e excluir um item lançado por engano, com motivo.
  Origem: MobilePage.jsx:772, src/lib/comandaItens.js.

F088 | Palm | garçom | baixa
  Localizar comanda pela grade de números no celular. Origem: MobilePage.jsx:220.

F089 | Palm | garçom | baixa
  Acompanhar quanto o próprio garçom lançou no turno. Origem: MobilePage.jsx:503, src/lib/painelGarcom.js.

F090 | Palm | garçom ou gerente | média
  Abrir outros módulos do sistema sem sair do Palm, respeitando permissão e plano.
  Origem: MobilePage.jsx:64, src/pages/mobile/modulos/registro.js.

F091 | Palm | garçom | alta
  Continuar lançando pedidos pelo Wi-Fi do caixa quando a internet cai. Origem: MobilePage.jsx:600, PonteLocalBridge.jsx.

F092 | Palm, PDV rápido | operador de balcão | alta
  Vender no balcão pelo celular sem abrir comanda. Origem: PdvModulo.jsx:70.

F093 | fila offline | sistema | alta
  Não perder pedido, venda, baixa de estoque, receita nem nota fiscal quando a internet
  cai, drenando a fila sozinho ao voltar. Origem: AppContext.jsx:848, src/lib/offline/fila.js.

F094 | impressão | sistema | média
  Fazer o pedido lançado pelo celular sair na impressora do caixa. Origem: useImpressaoLancamentos.js:28.

F095 | RPC | sistema | alta
  Descontar o estoque da venda no servidor sem descontar duas vezes, nunca ficando
  negativo. Origem: RPCs baixar_estoque e baixar_estoque_subproduto.

F096 | RPC | sistema | média
  Liberar a reserva da mesa assim que a conta é paga. Origem: RPC limpar_reserva_mesa.

F097 | realtime | sistema | média
  Ver em cada terminal, sem recarregar, o que os outros fizeram nas comandas e mesas.
  Origem: canais de realtime no AppContext.jsx.

F098 | vendas | gerente ou admin | alta
  Cancelar uma venda já fechada e cobrada, tirando-a do total do dia e apagando os
  lançamentos financeiros dela. Origem: AppContext.jsx:1404, migration 20260920.

F099 | financeiro automático | sistema | alta
  Transformar cada pagamento recebido em receita no Financeiro sem ninguém digitar.
  Origem: useFinalizarPagamento.js, src/lib/financeiro.js.

F100 | integridade da venda | sistema | alta
  Garantir que a venda na tela corresponde ao que existe no banco, desfazendo a venda
  otimista quando o cabeçalho é recusado. Origem: AppContext.jsx:1334, src/lib/vendas.js.

---

## C. Cadastro, estoque, clientes e delivery (F101 a F157)

F101 | cadastro | admin ou gerente | alta
  Cadastrar produto de venda com preço, categoria e unidade de estoque. Origem: ProdutosView.jsx:337.

F102 | cadastro | admin ou gerente | média
  Cadastrar insumo, que não é vendido, sem informar preço. Origem: ProdutosView.jsx:277.

F103 | cadastro | admin ou gerente | média
  Cadastrar item de produção com unidade de consumo e fator. Origem: ProdutosView.jsx:356.

F104 | cadastro | admin ou gerente | média
  Cadastrar mais de uma unidade de compra por fornecedor, com fator de conversão.
  Origem: ProdutosView.jsx:320, campo unidades_compra.

F105 | cadastro | admin ou gerente | média
  Editar produto existente sem recriá-lo. Origem: ProdutosView.jsx:281.

F106 | cadastro | admin ou gerente | alta
  Excluir produto do catálogo, com confirmação. Origem: ProdutosView.jsx:405.

F107 | cadastro | admin ou gerente | média
  Criar categoria própria do estabelecimento. Origem: ProdutosView.jsx:191, config categorias_extra.

F108 | cadastro | admin ou gerente | alta
  Renomear categoria levando junto os produtos dela. Origem: ProdutosView.jsx:206.

F109 | cadastro | admin ou gerente | alta
  Excluir categoria sem perder os produtos, que caem em "Sem Categoria". Origem: ProdutosView.jsx:227.

F110 | cadastro | qualquer papel | baixa
  Achar um produto num catálogo grande por categoria e busca. Origem: ProdutosView.jsx:263.

F111 | cadastro | admin ou gerente | média
  Cadastrar subproduto, a porção intermediária que o combo consome. Origem: SubprodutosView.jsx:222.

F112 | cadastro | admin ou gerente | média
  Tirar subproduto de circulação sem excluí-lo. Origem: SubprodutosView.jsx:274.

F113 | cadastro | admin ou gerente | alta
  Excluir subproduto que não está em uso, bloqueando quando está em combo.
  Origem: SubprodutosView.jsx:290.

F114 | cadastro | admin ou gerente | média
  Montar combo com item principal, subprodutos e produtos, com preço próprio.
  Origem: CombosView.jsx:542.

F115 | cadastro | admin ou gerente | média
  Ativar ou desativar combo sem excluí-lo. Origem: CombosView.jsx:581.

F116 | cadastro | admin ou gerente | alta
  Excluir combo, em cascata nas ligações, sem apagar produto do catálogo. Origem: CombosView.jsx:596.

F117 | cadastro | admin ou gerente | média
  Criar unidade de medida própria para estoque, compra ou consumo. Origem: ConfiguracoesView.jsx:1035.

F118 | cadastro | admin ou gerente | alta
  Excluir unidade de medida sabendo antes quantos produtos usam ela. Origem: ConfiguracoesView.jsx:1079.

F119 | importação | admin | alta
  Importar o cardápio de uma planilha, conferindo o preview antes de gravar, e retomar
  de onde parou após falha parcial. Origem: ImportarExportarTab.jsx:95, src/lib/importacao/.

F120 | exportação | admin | alta
  Exportar o catálogo em CSV para backup ou migração. Origem: ImportarExportarTab.jsx:354.

F121 | estoque | admin ou gerente | alta
  Liberar a entrada de estoque com a senha de administrador. Origem: EstoqueView.jsx:248.

F122 | estoque | admin ou gerente | alta
  Dar entrada na unidade de compra do fornecedor, com a soma feita pelo servidor.
  Origem: EstoqueView.jsx:221, RPC entrada_estoque.

F123 | estoque | admin ou gerente | alta
  Corrigir o saldo de um produto para o número da contagem física. Origem: EstoqueView.jsx:194.

F124 | estoque | admin ou gerente | média
  Definir estoque mínimo para ser avisado antes de faltar. Origem: EstoqueView.jsx:207.

F125 | estoque | qualquer papel | baixa
  Enxergar rapidamente o que está faltando, com busca sem acento e ordem em português.
  Origem: EstoqueView.jsx:110, src/lib/estoqueSituacao.js.

F126 | estoque | sistema | alta
  Ver o saldo descer sozinho quando uma venda sai, inclusive por subproduto de combo.
  Origem: AppContext.jsx:1703, RPCs de baixa.

F127 | importação | admin | alta
  Carregar a contagem inicial de estoque por planilha. Origem: src/lib/importacao/estoque.js:22.

F128 | clientes | qualquer papel | alta
  Cadastrar cliente com nome e telefone, com documento opcional validado. Origem: ClientesView.jsx:93.

F129 | clientes | qualquer papel | média
  Achar cliente pelo nome ou telefone, com o termo sanitizado. Origem: ClientesView.jsx:76.

F130 | clientes | qualquer papel | alta
  Consultar histórico de compras e a situação de fiado de um cliente. Origem: ClientesView.jsx:333.

F131 | clientes | qualquer papel | alta
  Registrar o pagamento de uma conta de fiado. Origem: ClientesView.jsx:364, src/lib/clientes.js:285.

F132 | clientes, LGPD | admin ou gerente | alta
  Ver o CPF ou CNPJ completo deixando rastro de quem olhou. Origem: ClientesView.jsx:407, src/lib/clientes.js:272.

F133 | clientes, LGPD | admin ou gerente | alta
  Excluir cliente anonimizando os dados pessoais, bloqueado quando há fiado em aberto.
  Origem: ClientesView.jsx:374, src/lib/clientes.js:230.

F134 | clientes | qualquer papel | média
  Corrigir os dados de um cliente já cadastrado. Origem: ClientesView.jsx:569.

F135 | importação | admin | alta
  Trazer a base de clientes de outro sistema por planilha. Origem: src/lib/importacao/clientes.js:24.

F136 | delivery | admin ou gerente | alta
  Abrir ou fechar a loja de delivery na hora. Origem: DeliveryView.jsx:240.

F137 | delivery | admin ou gerente | alta
  Deixar a loja abrir e fechar sozinha pelo horário de funcionamento. Origem: DeliveryView.jsx:270, src/lib/deliveryHorario.js:160.

F138 | delivery | admin ou gerente | alta
  Acompanhar os pedidos e mover cada um pelo fluxo até a entrega. Origem: DeliveryView.jsx:528.

F139 | delivery | admin ou gerente | alta
  Cancelar um pedido de delivery, limpando o espelho dele no PDV. Origem: DeliveryView.jsx:546.

F140 | delivery | admin ou gerente | média
  Ver itens, endereço e pagamento de um pedido, e falar com o cliente pelo WhatsApp.
  Origem: DeliveryView.jsx:663.

F141 | delivery | admin ou gerente | média
  Ser avisado com som e notificação quando entra um pedido novo. Origem: DeliveryView.jsx:474.

F142 | delivery | admin ou gerente | média
  Trazer o cardápio do PDV para o delivery de uma vez, sem publicar insumo nem preço zero.
  Origem: DeliveryView.jsx:812, migration 20260918.

F143 | delivery | admin ou gerente | média
  Colocar foto e descrição num item do cardápio online. Origem: DeliveryView.jsx:1025, src/lib/deliveryFotos.js.

F144 | delivery | admin ou gerente | alta
  Tirar um item do ar quando acaba, sem excluir o cadastro. Origem: DeliveryView.jsx:903.

F145 | delivery | admin ou gerente | média
  Criar grupo de complementos reutilizável e escolher em quais produtos aparece.
  Origem: DeliveryView.jsx:1447.

F146 | delivery | admin ou gerente | média
  Aninhar um grupo dentro de outro como subgrupo, sem criar ciclo. Origem: src/lib/deliveryAdmin.js:318.

F147 | delivery | admin ou gerente | alta
  Cobrar taxa de entrega por bairro ou faixa de CEP. Origem: DeliveryView.jsx:2384, RPC calcular_taxa_entrega.

F148 | delivery | admin ou gerente | alta
  Cobrar taxa por distância, com o ponto de partida marcado no mapa e anéis em km.
  Origem: DeliveryView.jsx:2417, MapaRaioEntrega.jsx.

F149 | delivery | admin ou gerente | alta
  Definir pedido mínimo e tempo de preparo que o cliente vê. Origem: DeliveryView.jsx:2370.

F150 | delivery | admin ou gerente | média
  Conferir a própria loja como o cliente final a vê. Origem: DeliveryView.jsx:162.

F151 | vitrine pública | cliente anônimo | alta
  Abrir o link do restaurante e ver o cardápio com a marca certa, sem login.
  Origem: CardapioPage.jsx:96, RPCs branding_por_slug e cardapio_publico.

F152 | vitrine pública | cliente anônimo | alta
  Escolher produto, montar com os complementos obrigatórios e colocar na sacola.
  Origem: ProdutoModal.jsx:33, src/lib/delivery.js:112.

F153 | vitrine pública | cliente anônimo | alta
  Revisar a sacola, mudar quantidades e remover itens, com o item que saiu do cardápio
  bloqueando o avanço. Origem: SacolaModal.jsx, src/lib/delivery.js:283.

F154 | vitrine pública | cliente anônimo | alta
  Informar nome, telefone e endereço, e ver a taxa de entrega antes de pagar.
  Origem: CheckoutEntrega.jsx:25, RPC calcular_taxa_entrega.

F155 | vitrine pública | cliente anônimo | alta
  Escolher a forma de pagamento na entrega, com troco ou maquininha, e ver o total.
  Origem: CheckoutPagamento.jsx:10.

F156 | vitrine pública | cliente anônimo | alta
  Enviar o pedido e receber o número dele, com o total gravado pelo servidor e a sacola
  limpa no aceite. Origem: CardapioPage.jsx:155, RPC criar_pedido_delivery.

F157 | vitrine pública | cliente anônimo | alta
  Fazer um segundo pedido do zero, sem herdar endereço nem pagamento do anterior.
  Origem: CardapioPage.jsx:178.

---

## D. Dinheiro: financeiro, relatórios, fiscal e assinatura (F158 a F205)

F158 | financeiro | gerente ou admin | alta
  Lançar despesa ou receita manual no mês. Origem: NovoLancamentoModal.jsx:34, src/lib/financeiro.js:36.

F159 | financeiro | gerente ou admin | alta
  Dar baixa numa conta a pagar ou a receber já liquidada. Origem: FinanceiroView.jsx:111.

F160 | financeiro | sistema | alta
  Marcar como vencidas as contas previstas cujo vencimento passou. Origem: src/lib/financeiro.js:146.

F161 | financeiro | gerente ou admin | média
  Restringir a lista a um período, um tipo e um status. Origem: FinanceiroView.jsx:103.

F162 | financeiro | gerente ou admin | alta
  Ver quanto entrou e saiu de verdade e quanto ainda está previsto. Origem: src/lib/financeiro.js:197.

F163 | financeiro | dono ou admin | alta
  Saber se o período deu lucro descontando o custo dos produtos vendidos, marcando quando
  é parcial por falta de ficha técnica. Origem: FinanceiroView.jsx:88, src/lib/relatorios.js:169.

F164 | financeiro | caixa | alta
  Fazer cada pagamento de venda virar receita no financeiro sem lançamento manual.
  Origem: useFinalizarPagamento.js:103.

F165 | financeiro | caixa | alta
  Registrar venda no fiado como conta a receber ligada ao cliente. Origem: useFinalizarPagamento.js:112.

F166 | financeiro | caixa | alta
  Não perder a receita da venda quando a internet cai na hora de gravar o lançamento.
  Origem: useFinalizarPagamento.js:131, AppContext.jsx:869.

F167 | financeiro | gerente ou admin | alta
  Distinguir "não tem lançamento" de "não consegui ler o financeiro". Origem: FinanceiroView.jsx:50.

F168 | caixa | caixa | alta
  Registrar sangria com trava pelo dinheiro disponível e motivo obrigatório.
  Origem: MovimentoCaixaModal.jsx:55, src/lib/caixaMovimentos.js:138.

F169 | caixa | caixa | alta
  Registrar suprimento, que nunca exige autorização. Origem: src/lib/caixaMovimentos.js:110.

F170 | caixa | caixa com autorização | alta
  Autorizar com senha de gerente uma sangria acima do limite do estabelecimento.
  Origem: MovimentoCaixaModal.jsx:45.

F171 | caixa | caixa | alta
  Conferir o caixa no fim do turno método a método e ver a diferença. Origem: FechamentoModal.jsx:76, src/lib/caixa.js:29.

F172 | caixa | caixa | alta
  Persistir o fechamento e registrar o evento de caixa fechado. Origem: AppContext.jsx:1575.

F173 | relatórios | gerente ou admin | média
  Escolher o recorte de tempo de todas as abas de uma vez. Origem: RelatorioView.jsx:28.

F174 | relatórios | gerente ou admin | alta
  Ver as vendas do período em visão resumida, detalhada ou por dia, sem as canceladas.
  Origem: RelatorioView.jsx:313.

F175 | relatórios | gerente ou admin | alta
  Gerar o PDF das vendas do período. Origem: RelatorioView.jsx:500, src/lib/exportReport.js:27.

F176 | relatórios | gerente ou admin | alta
  Gerar a planilha das vendas do período. Origem: src/lib/exportReport.js:86.

F177 | relatórios | gerente ou admin | alta
  Auditar os fechamentos de caixa e abrir o detalhe de um deles. Origem: RelatorioView.jsx:1216.

F178 | relatórios | gerente ou admin | alta
  Exportar os fechamentos em PDF ou planilha. Origem: RelatorioView.jsx:546.

F179 | relatórios | gerente ou admin | alta
  Ver tudo que foi cancelado no período, com motivo e responsável, e exportar.
  Origem: RelatorioView.jsx:432.

F180 | relatórios | gerente ou admin | média
  Auditar os logs de operadores do período e exportá-los. Origem: RelatorioView.jsx:346.

F181 | relatórios | admin ou gerente | média
  Imprimir a lista de credenciais de acesso, sem nenhuma senha. Origem: RelatorioView.jsx:563.

F182 | relatórios | admin | alta
  Ver o faturamento consolidado por operador e comparar com o período anterior.
  Origem: RelatorioView.jsx:361, src/lib/relatorios.js:116.

F183 | relatórios | admin ou gerente | alta
  Ver faturamento, série diária, mix de métodos e top de produtos agregados no banco.
  Origem: DesempenhoReport.jsx:112, RPC relatorio_vendas.   **Ver bug B02.**

F184 | relatórios | admin ou gerente | média
  Escolher contra qual janela comparar o desempenho do período. Origem: src/lib/relatorios.js:69.

F185 | relatórios | dono ou admin | alta
  Ver a margem por produto cruzando venda com ficha técnica. Origem: src/lib/relatorios.js:133.

F186 | relatórios | banco | alta
  Devolver num único JSON o faturamento, a série por dia, o total por método e o top de
  produtos do intervalo. Origem: migration 20260746, RPC relatorio_vendas.   **Ver bug B02.**

F187 | relatórios | gerente ou admin | média
  Ver o nome do próprio estabelecimento no cabeçalho dos relatórios exportados.
  Origem: RelatorioView.jsx:328.

F188 | fiscal | gerente ou operador | alta
  Encontrar uma nota fiscal já emitida, pela chave ou pela data. Origem: HistoricoNfce.jsx:41.

F189 | fiscal | gerente ou operador | alta
  Saber que existem notas que nem chegaram à SEFAZ. Origem: HistoricoNfce.jsx:57.

F190 | fiscal | operador de caixa | alta
  Reimprimir a segunda via do cupom fiscal de uma venda já feita. Origem: BotaoReimprimirNfce.jsx:41.

F191 | fiscal | gerente | alta
  Cancelar junto à SEFAZ uma NFC-e autorizada emitida por engano. Origem: CancelarNfce.jsx:32, Edge Function cancelar-nfce.

F192 | fiscal | gerente | alta
  Inutilizar na SEFAZ uma faixa de numeração que pulou. Origem: InutilizarNumeracao.jsx:31.

F193 | fiscal | gestor ou admin | alta
  Cadastrar a identidade fiscal do estabelecimento, com allow-list de campos.
  Origem: PainelFiscal.jsx:72, src/lib/fiscalConfigRepo.js:55.

F194 | fiscal | gestor ou admin | alta
  Passar a emissão de Homologação para Produção, com confirmação explícita.
  Origem: PainelFiscal.jsx:110.

F195 | fiscal | gestor ou admin | alta
  Ligar ou desligar a emissão fiscal automática nas vendas. Origem: PainelFiscal.jsx:272.

F196 | fiscal | gestor ou admin | média
  Entender por que as notas estão pendentes quando a SEFAZ está fora. Origem: PainelFiscal.jsx:170.

F197 | fiscal | caixa | alta
  Emitir a NFC-e da venda no momento do pagamento sem travar o caixa. Origem: src/lib/fiscal.js:43.

F198 | fiscal | gerente ou admin | alta
  Lançar nota fiscal de compra a partir do XML e dar entrada no estoque.
  Origem: NotasFiscaisTab.jsx:275.

F199 | assinatura | dono do estabelecimento | alta
  Saber se a mensalidade está em dia, quanto custa e quando vence. Origem: MinhaAssinaturaTab.jsx:100.

F200 | assinatura | dono do estabelecimento | alta
  Conferir os pagamentos de mensalidade já registrados, com o estornado fora do total.
  Origem: MinhaAssinaturaTab.jsx:66.

F201 | assinatura | plataforma | alta
  Registrar o recebimento da mensalidade e empurrar o vencimento um ciclo.
  Origem: ConfirmarRenovacaoModal.jsx:88, RPC confirmar_renovacao_assinatura.

F202 | assinatura | plataforma | alta
  Cancelar um pagamento lançado por engano e devolver o ciclo. Origem: HistoricoPagamentosModal.jsx:93, RPC estornar_pagamento_assinatura.

F203 | assinatura | plataforma | alta
  Definir quanto a plataforma cobra por mês de um estabelecimento. Origem: DefinirMensalidadeModal.jsx:59.

F204 | assinatura | sistema | alta
  Atualizar no banco o cache de status da assinatura sem depender de job agendado.
  Origem: src/lib/assinatura.js:157, RPC sincronizar_status_assinatura.

F205 | assinatura | qualquer papel do tenant | alta
  Ser impedido de operar quando a mensalidade venceu e a carência acabou, com a decisão
  valendo no Postgres e não só na tela. Origem: PrivateRoute.jsx:46, migration 20260720.
