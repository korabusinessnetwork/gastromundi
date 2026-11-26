// Notas de atualização do sistema, publicadas em kora.codes/patchnotes.
//
// Regra do dono (2026-11-26): toda atualização entregue entra aqui, na mesma
// rodada. A mais nova vai em cima. Escreva para quem usa o sistema no
// restaurante: o que mudou para ele, em português do dia a dia, sem nome de
// arquivo nem termo técnico. Mudança só por dentro, sem efeito na tela, entra
// como "Por dentro", em uma linha.
//
// tipo de cada item: "novo" (algo que não existia), "corrigido" (algo que
// estava errado) ou "melhoria" (algo que existia e ficou melhor).
// `anexo` (opcional): { href, rotulo }, um arquivo em `public/relatorios/` que a
// página oferece para baixar ao lado do item.

export const TIPOS_DE_NOTA = {
  novo: "Novo",
  melhoria: "Melhoria",
  corrigido: "Corrigido",
  interno: "Por dentro",
};

export const NOTAS_DE_ATUALIZACAO = [
  {
    data: "2026-11-26",
    titulo: "Cores do seu estabelecimento em todo lugar e datas no dia certo",
    itens: [
      { tipo: "novo", texto: "Relatório completo da reorganização do sistema, de 23 a 26 de novembro: o que mudou para quem usa, o que mudou por dentro e como cada etapa foi conferida.", anexo: { href: "/relatorios/reorganizacao-2026-11.pdf", rotulo: "Baixar o relatório (PDF)" } },
      { tipo: "novo", texto: "Página de novidades do sistema, em kora.codes/patchnotes, com tudo o que muda a cada atualização. O link fica no rodapé do site." },
      { tipo: "corrigido", texto: "No PDV do celular, a busca de produto passou a ignorar acento, como no resto do sistema: digitar \"cafe\" encontra \"Café\"." },
      { tipo: "corrigido", texto: "A data da compra, na Área Admin, aparecia um dia antes do escolhido. Agora mostra o dia certo." },
      { tipo: "corrigido", texto: "O vencimento do fiado, no detalhe do cliente, também aparecia um dia antes. Corrigido." },
      { tipo: "melhoria", texto: "A prévia do cupom em Configurações, Impressão, e a impressão pelo navegador usam as cores do seu estabelecimento." },
      { tipo: "melhoria", texto: "Reforçamos a segurança da impressão pelo navegador: só as cores válidas do seu estabelecimento entram no cupom." },
      { tipo: "melhoria", texto: "O aviso \"sem valor fiscal\" do cupom e a barra de força da senha seguem as cores do seu estabelecimento." },
      { tipo: "interno", texto: "Organização do sistema por assunto (nota fiscal, delivery, estoque, caixa, PDV, clientes, Console, cardápio, Configurações, impressão, mesas, Área Admin, cozinha, financeiro, relatório, Jarvas, importação de planilha, assinatura, ponte e login) e das rotas por tipo de acesso (site, Console, cardápio público e estabelecimento), sem mudança nas telas. Os programas da ponte e do importador de cardápio ganharam guia próprio, e a documentação técnica passou a descrever o sistema como ele está. A revisão final de qualidade e segurança da reorganização terminou, com os caminhos mais usados (abrir e fechar o caixa, vender, lançar pelo celular do garçom, vender sem internet, pedido pelo cardápio e cadastro no Console) testados de ponta a ponta, e os salvamentos que acontecem de uma vez só (combo, nota de compra, unidade de medida e subproduto) testados direto no banco. A página da Kora e as pautas ganharam conferência visual automática. As ferramentas de trabalho automático da equipe foram consertadas e passaram a fazer parte do projeto. Começou a integração das novidades de combos, delivery e feedback que estavam paradas desde setembro; elas entram no sistema quando estiverem prontas e conferidas." },
    ],
  },
  {
    data: "2026-11-25",
    titulo: "Sistema sem emoji, com ícones na cor do seu estabelecimento",
    itens: [
      { tipo: "melhoria", texto: "Os emojis saíram das telas, dos avisos e do cupom. No lugar entram ícones que seguem as cores do seu estabelecimento e aparecem iguais em qualquer aparelho." },
      { tipo: "corrigido", texto: "A observação do item no cupom saía como um quadrado na impressora térmica. Agora sai como \"Obs.:\"." },
      { tipo: "melhoria", texto: "A planilha de produtos não tem mais a coluna de emoji. Planilhas antigas continuam sendo aceitas, e a coluna é ignorada." },
    ],
  },
  {
    data: "2026-11-24",
    titulo: "Mesmas regras no computador e no celular",
    itens: [
      { tipo: "corrigido", texto: "O Financeiro no celular passa a mostrar também as contas já marcadas como vencidas." },
      { tipo: "corrigido", texto: "Na Cozinha do computador, pedido sem etapa definida volta a mostrar o botão \"Iniciar Preparo\"." },
      { tipo: "corrigido", texto: "No Estoque, saldo negativo passa a aparecer como em falta, e não mais como baixo. No celular, digitar uma contagem negativa não grava mais zero." },
      { tipo: "corrigido", texto: "O troco em dinheiro registrado no computador sai sempre em centavos exatos, igual ao celular." },
      { tipo: "melhoria", texto: "A busca por nome ignora acento em todo o sistema: digitar \"cafe\" encontra \"Café\"." },
      { tipo: "interno", texto: "Unificamos as regras de PDV, Delivery, Estoque, Clientes, Relatórios, Cozinha, Cardápio e Configurações entre computador e celular, sem mudar a aparência das telas." },
    ],
  },
  {
    data: "2026-11-23",
    titulo: "Salvamentos que nunca ficam pela metade",
    itens: [
      { tipo: "melhoria", texto: "Salvar um combo agora grava tudo de uma vez: se algo falhar no meio, nada fica pela metade." },
      { tipo: "corrigido", texto: "Importar nota fiscal de compra passou a ser tudo ou nada, e depois de uma falha dá para importar a mesma nota de novo." },
      { tipo: "corrigido", texto: "Salvar subproduto não cria mais um item duplicado quando você tenta de novo depois de uma falha." },
      { tipo: "corrigido", texto: "Excluir unidade de medida não diz mais \"excluída\" quando nada foi apagado. Agora a exclusão acontece por inteiro ou nada muda." },
      { tipo: "melhoria", texto: "Adicionar e remover unidade de medida aparece só para o administrador. O gerente vê a lista com um aviso de que só o administrador altera." },
      { tipo: "melhoria", texto: "Reforçamos a proteção da composição dos combos, que agora só a gerência altera." },
      { tipo: "melhoria", texto: "O PDV ficou mais leve: cada tela só se atualiza quando muda a informação que ela mostra." },
      { tipo: "interno", texto: "Reorganizamos a base do sistema em partes menores, sem mudar nada do que aparece na tela." },
    ],
  },
  {
    data: "2026-09-14",
    titulo: "Segurança reforçada",
    itens: [
      { tipo: "melhoria", texto: "Reforçamos a proteção dos dados do estabelecimento, conferindo tudo o que é gravado, inclusive o que fica guardado no aparelho durante a falta de internet." },
      { tipo: "corrigido", texto: "Corrigimos um defeito que impediria o reenvio automático das notas fiscais pendentes." },
      { tipo: "interno", texto: "Adicionamos revisões de segurança automáticas ao nosso processo de desenvolvimento." },
    ],
  },
  {
    data: "2026-09-11",
    titulo: "Saúde da operação no Console",
    itens: [
      { tipo: "novo", texto: "O Console da plataforma ganhou a aba \"Saúde da operação\", com notas fiscais recusadas ou paradas e erros de impressão por estabelecimento, os casos mais antigos primeiro." },
      { tipo: "corrigido", texto: "No Console, os botões de cada estabelecimento voltaram a ficar dentro do próprio cartão." },
      { tipo: "corrigido", texto: "A barra de abas do Console voltou a caber inteira na tela, sem rolagem." },
      { tipo: "melhoria", texto: "Os textos das telas ficaram mais simples de ler, com vírgula no lugar do travessão." },
      { tipo: "interno", texto: "Continuamos organizando o visual da tela de Notas Fiscais, sem mudança na aparência." },
    ],
  },
  {
    data: "2026-09-10",
    titulo: "Vendas sem internet guardadas com mais segurança",
    itens: [
      { tipo: "melhoria", texto: "As operações feitas sem internet ficam guardadas de forma mais segura no aparelho até a conexão voltar." },
      { tipo: "melhoria", texto: "O bloqueio após 5 tentativas erradas de login passa a ser controlado pelo sistema, e não mais pelo navegador." },
      { tipo: "melhoria", texto: "Cancelar uma venda fechada agora mantém o registro com o motivo do cancelamento, em vez de apagá-lo." },
      { tipo: "interno", texto: "Registramos as decisões do funcionamento sem internet e organizamos as listas das telas." },
    ],
  },
  {
    data: "2026-09-01",
    titulo: "Entrar e criar conta pela página da Kora",
    itens: [
      { tipo: "novo", texto: "Na página da Kora, o botão \"Entrar\" pergunta o endereço do estabelecimento e leva direto ao login dele." },
      { tipo: "novo", texto: "Quem ainda não é cliente pode pedir a própria conta pela página, informando o nome do negócio, o endereço desejado e o plano de interesse." },
      { tipo: "novo", texto: "O Console da plataforma ganhou a aba \"Pedidos de conta\": aprovar um pedido abre o cadastro do estabelecimento já preenchido." },
    ],
  },
  {
    data: "2026-08-24",
    titulo: "Layout da comanda e programa da impressora",
    itens: [
      { tipo: "novo", texto: "Nova aba \"Layout da comanda\" em Configurações, Impressão, com prévia ao vivo. Edite logo, endereço, CNPJ e mensagem final, e monte o papel bloco a bloco, escolhendo o que sai, alinhamento, tamanho e negrito." },
      { tipo: "novo", texto: "Botão para baixar o programa da impressora na tela de Impressão e na aba \"Pedidos sem Internet\", com a instrução de descompactar o arquivo antes de abrir." },
      { tipo: "corrigido", texto: "A etiqueta de itens e o tempo no cartão da comanda não ficam mais brancos em paletas claras." },
      { tipo: "melhoria", texto: "Na página da Kora, o pedido de demonstração passou a ser registrado de verdade, a confirmação diz o próximo passo e os campos do formulário ficaram legíveis." },
      { tipo: "corrigido", texto: "Na página da Kora, o quadro \"Seu plano\" não some mais por baixo do menu ao rolar." },
      { tipo: "melhoria", texto: "Reforçamos a proteção do sistema no navegador." },
      { tipo: "interno", texto: "Organizamos onde o programa da impressora fica guardado para download." },
    ],
  },
  {
    data: "2026-08-23",
    titulo: "Permissões e proteção de dados reforçadas",
    itens: [
      { tipo: "melhoria", texto: "Reforçamos a proteção dos dados entre estabelecimentos." },
      { tipo: "melhoria", texto: "Emitir e reenviar nota fiscal fica restrito a caixa, gerente e administrador. O garçom deixa de ver vendas, fechamentos e a configuração fiscal." },
      { tipo: "melhoria", texto: "A página de pedidos no celular do garçom, usada quando a internet cai, ficou mais protegida." },
      { tipo: "melhoria", texto: "O Delivery ficou mais protegido contra pedidos falsos em sequência." },
      { tipo: "interno", texto: "Reforços adicionais de segurança nos bastidores." },
    ],
  },
  {
    data: "2026-08-22",
    titulo: "Botão de dinheiro do caixa mais limpo",
    itens: [
      { tipo: "melhoria", texto: "O botão \"Retirar / Colocar Dinheiro\" do caixa passa a mostrar só o texto, sem ícone." },
      { tipo: "interno", texto: "Preparamos o lugar e as instruções do programa da impressora para quem for instalá-lo." },
    ],
  },
  {
    data: "2026-08-20",
    titulo: "Impressão sem internet mais confiável",
    itens: [
      { tipo: "corrigido", texto: "Na impressão de pedidos sem internet, nomes com acento não saem mais trocados por pontos de interrogação na comanda." },
      { tipo: "melhoria", texto: "O programa da impressora não fecha mais sozinho quando algo dá errado, e uma reimpressão que falhou volta para a fila." },
      { tipo: "novo", texto: "O painel do programa avisa quando o firewall do computador está bloqueando o celular do garçom e oferece um botão para liberar." },
    ],
  },
  {
    data: "2026-08-18",
    titulo: "Notas fiscais e importação mais seguras",
    itens: [
      { tipo: "melhoria", texto: "Reforçamos a segurança das notas fiscais emitidas." },
      { tipo: "corrigido", texto: "Importar cardápio em PDF não trava mais a tela com arquivos muito grandes." },
      { tipo: "melhoria", texto: "As mensagens de erro da nota fiscal e da importação passam a explicar o problema, sem mostrar detalhes técnicos." },
      { tipo: "interno", texto: "Removemos acessos de teste antigos e melhoramos a ferramenta interna de pautas da equipe Kora." },
    ],
  },
  {
    data: "2026-08-17",
    titulo: "Grade de produtos do PDV corrigida",
    itens: [
      { tipo: "corrigido", texto: "A grade de produtos do PDV voltou a receber todo o seu ajuste de layout." },
      { tipo: "melhoria", texto: "Reforçamos a segurança da importação de planilhas." },
      { tipo: "interno", texto: "Atualizamos as bases do sistema e ajustamos a ferramenta interna de pautas da equipe Kora." },
    ],
  },
  {
    data: "2026-08-15",
    titulo: "Toda venda dá baixa no estoque",
    itens: [
      { tipo: "corrigido", texto: "Produtos cadastrados pelo sistema não descontavam o estoque na venda. Agora toda venda dá baixa, e o Estoque mostra a situação real desde o cadastro." },
      { tipo: "melhoria", texto: "Quando várias baixas de estoque falham na mesma venda, o Jarvas mostra um único alerta sobre o problema geral, em vez de um cartão por produto." },
      { tipo: "interno", texto: "Padronizamos a cor de atenção para seguir o tema do estabelecimento e deixamos os testes mais confiáveis." },
    ],
  },
  {
    data: "2026-08-13",
    titulo: "Ferramenta interna da equipe Kora",
    itens: [
      { tipo: "interno", texto: "Criamos uma ferramenta interna para a equipe Kora organizar suas pautas, sem efeito no seu sistema." },
    ],
  },
  {
    data: "2026-08-10",
    titulo: "Vinte correções vindas do teste manual",
    itens: [
      { tipo: "corrigido", texto: "A tela de assinatura bloqueada não aparece mais por engano logo após o login, e o PDV não congela mais quando a conexão demora a responder." },
      { tipo: "corrigido", texto: "Falha ao emitir NFC-e agora aparece com uma mensagem clara, sem detalhes técnicos." },
      { tipo: "corrigido", texto: "Insumos internos e produtos sem preço não aparecem mais no cardápio público." },
      { tipo: "corrigido", texto: "O navegador não preenche mais sozinho a senha de aprovação do gerente." },
      { tipo: "corrigido", texto: "Os produtos sem estoque do PDV agora batem com o Estoque, e Produtos e Estoque não aparecem vazios logo após o login." },
      { tipo: "corrigido", texto: "O cadastro de novo usuário não vem mais preenchido com o login do administrador, e o campo de troco não aceita valor negativo." },
      { tipo: "melhoria", texto: "O telefone do cliente passa a ser validado, e o CPF fica oculto por padrão, visível só para gerente ou administrador." },
      { tipo: "novo", texto: "Aviso dois minutos antes de a sessão expirar por inatividade, com o botão \"Continuar conectado\"." },
    ],
  },
  {
    data: "2026-08-07",
    titulo: "Melhoria no nosso jeito de trabalhar",
    itens: [
      { tipo: "interno", texto: "Passamos a detalhar cada pedido com perguntas antes de construir, para entregar exatamente o que foi pedido." },
    ],
  },
  {
    data: "2026-08-03",
    titulo: "Console mais rápido para cadastrar e cobrar",
    itens: [
      { tipo: "melhoria", texto: "A lista de estabelecimentos do Console ganhou atalho por plano, marca de quem está sem mensalidade, endereço visível e buscável, e carregamento por partes." },
      { tipo: "novo", texto: "O cadastro de estabelecimento aceita a mensalidade combinada, a escolha do endereço do cardápio e sugere o usuário a partir do nome do responsável. Um botão gera a senha provisória e avisa se ela for fraca." },
      { tipo: "novo", texto: "Cartão de primeiro acesso logo após o cadastro, com o endereço do estabelecimento e botão para copiar. Também dá para copiar o acesso de quem já existe." },
      { tipo: "novo", texto: "Prévia do cardápio direto do cartão do estabelecimento no Console." },
      { tipo: "melhoria", texto: "Quando o usuário escolhido já está em uso, o Console sugere outro livre em um clique." },
      { tipo: "melhoria", texto: "As janelas do Console perguntam antes de descartar um cadastro pela metade, fecham com Esc ou clique fora e funcionam bem pelo teclado." },
      { tipo: "melhoria", texto: "O Console avisa quando a internet cai, trava o que não dá para fazer e se atualiza sozinho quando a conexão volta. Também ficou fácil de usar no celular." },
      { tipo: "interno", texto: "As cores do Console e do módulo fiscal passam a seguir o tema, sem mudança visível, e ganhamos mais testes." },
    ],
  },
  {
    data: "2026-08-02",
    titulo: "Sangria e suprimento no caixa",
    itens: [
      { tipo: "novo", texto: "O caixa passa a registrar sangria e suprimento, o dinheiro que sai e entra na gaveta no meio do turno. O fechamento soma esses valores, e acima do limite definido em Configurações a retirada pede a senha de um gerente." },
      { tipo: "novo", texto: "No Console, dá para ligar e desligar adicionais, como NF-e e TEF, para cada estabelecimento." },
      { tipo: "melhoria", texto: "A lista do Console mostra a situação da cobrança e o vencimento de cada estabelecimento, ordena por urgência e tem busca por nome e filtro por situação." },
      { tipo: "novo", texto: "Registrar pagamento e ver o histórico de pagamentos direto do cartão do estabelecimento no Console." },
      { tipo: "melhoria", texto: "O Console lembra a aba, o filtro e o período escolhidos ao recarregar a página." },
      { tipo: "melhoria", texto: "No primeiro dia, com o cardápio ainda vazio, o PDV explica o que fazer e aponta para o cadastro de produtos." },
      { tipo: "corrigido", texto: "Bordas que sumiam voltaram a aparecer, como a borda vermelha de senha errada, e os campos do Delivery voltaram a se destacar ao receber o clique." },
      { tipo: "interno", texto: "Separamos o visual do PDV, do Delivery e do Relatório para seguir as cores de cada estabelecimento, e conferimos a documentação." },
    ],
  },
  {
    data: "2026-08-01",
    titulo: "Assinatura, identidade e Console",
    itens: [
      { tipo: "novo", texto: "No Console, a assinatura de um estabelecimento é renovada registrando o pagamento." },
      { tipo: "novo", texto: "Aba \"Uso e faturamento\" no Console, com faturamento, pedidos, ticket médio e última venda de cada estabelecimento em 7, 30 ou 90 dias." },
      { tipo: "novo", texto: "Histórico de pagamentos da assinatura no Console, com opção de cancelar um pagamento lançado por engano informando o motivo." },
      { tipo: "novo", texto: "Aba \"Minha assinatura\" em Configurações, para gerente e administrador verem se estão em dia, o plano e os pagamentos feitos." },
      { tipo: "novo", texto: "Aba \"Identidade\" em Configurações: o administrador define o nome de exibição e o logo do estabelecimento, com prévia antes de salvar." },
      { tipo: "corrigido", texto: "O botão de prévia do cardápio agora abre o cardápio do seu estabelecimento." },
      { tipo: "corrigido", texto: "Quando a baixa de estoque falha, o Jarvas avisa no painel em vez de mostrar um saldo estimado." },
      { tipo: "interno", texto: "Mais uma conferência automática na suíte de testes." },
    ],
  },
];

/**
 * Data da nota ("AAAA-MM-DD") por extenso, sem passar pelo fuso horário:
 * `new Date("AAAA-MM-DD")` é meia-noite UTC, que no Brasil ainda é o dia
 * anterior.
 *
 * @param {string} dia - "AAAA-MM-DD"
 * @returns {string} ex.: "26 de novembro de 2026"
 */
export function dataPorExtenso(dia) {
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [ano, mes, d] = String(dia ?? "").split("-").map(Number);
  if (!ano || !mes || !d || mes > 12) return "";
  return `${d} de ${MESES[mes - 1]} de ${ano}`;
}
