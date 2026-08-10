import { EMPRESA, VERSAO_LEGAL, VIGENTE_DESDE, dataPorExtenso } from "./versaoLegal";

/**
 * Termos de Uso — conteúdo como DADO, não como marcação (decisão 018).
 *
 * Modelo-base para começar a vender: cobre o que um SaaS de PDV precisa ter
 * dito por escrito antes do primeiro contrato (o que o serviço é, quem
 * responde pelo quê, como se cancela, o que acontece com os dados na saída).
 * Não substitui revisão de advogado — está no backlog para quando houver
 * receita; o que não podia continuar era vender sem NADA escrito.
 *
 * Escrito na mesma língua da tela: dono de restaurante lendo, não jurista.
 * Cada seção é `{ id, titulo, paragrafos, itens? }` — o `id` vira âncora do
 * sumário, então mudar um `id` quebra link que alguém já mandou por e-mail.
 */

const quem = EMPRESA.razaoSocial || EMPRESA.nome;
const identificacao = [
  EMPRESA.razaoSocial,
  EMPRESA.cnpj && `CNPJ ${EMPRESA.cnpj}`,
  EMPRESA.endereco,
]
  .filter(Boolean)
  .join(", ");

export const TERMOS_DE_USO = {
  id: "termos",
  titulo: "Termos de Uso",
  versao: VERSAO_LEGAL,
  vigenteDesde: VIGENTE_DESDE,
  resumo:
    `Este é o contrato entre o seu estabelecimento e ${quem} pelo uso do ` +
    `${EMPRESA.nome}. Leia com calma: ele diz o que o sistema faz, o que é ` +
    "responsabilidade de cada lado, como cancelar e o que acontece com os " +
    "seus dados quando você sair.",
  secoes: [
    {
      id: "quem-somos",
      titulo: "1. Quem oferece o serviço",
      paragrafos: [
        identificacao
          ? `O ${EMPRESA.nome} é fornecido por ${identificacao} ("nós").`
          : `O ${EMPRESA.nome} é fornecido por nós.`,
        'Ao contratar, criar acesso ou usar o sistema, o estabelecimento ("você") concorda com estes Termos. Se você não concorda com alguma parte, não use o sistema — e fale com a gente antes de contratar.',
        `Estes Termos estão na versão ${VERSAO_LEGAL}, em vigor desde ${dataPorExtenso(VIGENTE_DESDE)}.`,
      ],
    },
    {
      id: "o-que-e",
      titulo: "2. O que o sistema faz",
      paragrafos: [
        `O ${EMPRESA.nome} é um sistema de ponto de venda e gestão, entregue pela internet (software como serviço). Você usa pelo navegador, no endereço do seu estabelecimento, e não precisa instalar nem manter servidor.`,
        "O que está incluído depende do plano contratado. Recursos ligados ou desligados por plano aparecem no próprio sistema — nada é cobrado por fora sem você contratar antes.",
      ],
      itens: [
        "Frente de caixa, comandas, mesas e delivery",
        "Cadastro de produtos, estoque e clientes",
        "Fechamento de caixa, relatórios e controle financeiro",
        "Acessos separados por função (caixa, garçom, cozinha, gerente)",
      ],
    },
    {
      id: "nao-incluso",
      titulo: "3. O que NÃO está incluído",
      paragrafos: [
        "Para não haver surpresa, o que hoje está fora do serviço:",
      ],
      itens: [
        "Emissão de nota fiscal (NFC-e/NF-e) e integração com máquina de cartão (TEF) — quando entrarem, entram como contratação à parte",
        "Equipamentos: computador, tablet, impressora, balança, internet e energia são do estabelecimento",
        "Contabilidade, obrigações fiscais e conferência de tributos — isso é com o seu contador",
        "Recuperação de dados que você mesmo apagou dentro do sistema, fora da janela de backup descrita no item 8",
      ],
    },
    {
      id: "acessos",
      titulo: "4. Contas e senhas",
      paragrafos: [
        "Cada pessoa que usa o sistema tem o próprio acesso. Você é responsável por criar, revisar e remover os acessos da sua equipe — principalmente quando alguém sai.",
        "Tudo que é feito com um acesso vale como feito por quem o detém. Guarde as senhas, não compartilhe usuário entre pessoas e troque a senha inicial no primeiro dia.",
        "Se você suspeitar que alguém entrou sem permissão, fale com a gente imediatamente para bloquearmos o acesso.",
      ],
    },
    {
      id: "pagamento",
      titulo: "5. Plano, pagamento e reajuste",
      paragrafos: [
        "O valor e a periodicidade são os do plano contratado. O pagamento é antecipado: o período começa depois de pago.",
        "Atraso pode suspender o acesso após aviso prévio. Suspensão não apaga nada — os dados continuam guardados e voltam assim que a pendência for resolvida.",
        "Reajuste só acontece com aviso de pelo menos 30 dias. Se você não concordar, pode cancelar sem multa até a data do reajuste.",
        "Estabelecimentos em cortesia (isentos) usam o sistema sem pagar pelo período combinado; passar a cobrar segue a mesma regra de aviso prévio.",
      ],
    },
    {
      id: "cancelamento",
      titulo: "6. Cancelamento e saída",
      paragrafos: [
        "Você pode cancelar quando quiser, sem multa e sem precisar justificar. Basta pedir pelo canal de contato.",
        "O cancelamento vale ao fim do período já pago — não há devolução proporcional de período em curso, e também não cobramos nada depois dele.",
        "Antes de sair, peça a exportação dos seus dados (item 8). Depois do cancelamento, guardamos os dados por 30 dias para você poder voltar ou exportar; passado esse prazo, eles são apagados em definitivo.",
        "Podemos encerrar o contrato se houver uso ilegal do sistema, tentativa de burlar segurança ou inadimplência prolongada — sempre com aviso e com a chance de exportar os dados antes.",
      ],
    },
    {
      id: "uso-correto",
      titulo: "7. Uso correto",
      paragrafos: ["Usando o sistema, você se compromete a não:"],
      itens: [
        "Usar para atividade ilegal, ou para registrar operação que não existiu",
        "Tentar acessar dados de outro estabelecimento, forçar senha ou explorar falha de segurança",
        "Revender, sublicenciar ou copiar o sistema, no todo ou em parte",
        "Automatizar acesso em volume que atrapalhe o funcionamento para os demais",
      ],
      paragrafosFinais: [
        "Encontrou uma falha de segurança? Avise a gente em vez de explorá-la — corrigimos e agradecemos.",
      ],
    },
    {
      id: "disponibilidade",
      titulo: "8. Disponibilidade, backup e suporte",
      paragrafos: [
        "Trabalhamos para o sistema ficar no ar o tempo todo, mas nenhum serviço pela internet é imune a queda, manutenção ou falha de fornecedor. Manutenções programadas são avisadas com antecedência e, quando possível, fora do horário de pico.",
        "Fazemos cópia de segurança diária do banco de dados, guardada por 30 dias. Ela existe para recuperar desastre — não é serviço de recuperação de item apagado por engano, embora a gente tente ajudar quando dá.",
        "O suporte é pelo canal de contato informado na contratação, em dias úteis. Emergência que trave o caixa tem prioridade sobre dúvida de uso.",
      ],
    },
    {
      id: "propriedade",
      titulo: "9. De quem é o quê",
      paragrafos: [
        `O sistema, o código, a marca e o visual são nossos. Contratar dá a você o direito de USAR o ${EMPRESA.nome} enquanto o contrato durar — não transfere propriedade.`,
        "Os dados que você e sua equipe lançam são SEUS: produtos, vendas, clientes, estoque, financeiro. Nós apenas os hospedamos e processamos para fazer o sistema funcionar, conforme a Política de Privacidade.",
        "Podemos usar números agregados e anônimos (sem identificar você, sua equipe ou seus clientes) para melhorar o produto.",
      ],
    },
    {
      id: "responsabilidade",
      titulo: "10. Responsabilidade",
      paragrafos: [
        "Respondemos pelo funcionamento do sistema conforme o contratado. Não respondemos por prejuízo causado por falta de internet ou energia no estabelecimento, equipamento com defeito, uso indevido por alguém da sua equipe, ou informação lançada errada por quem opera.",
        "Havendo responsabilidade nossa, ela fica limitada ao valor pago por você nos 12 meses anteriores ao fato — limite usual em software vendido por assinatura, e a única forma de manter a mensalidade no patamar em que está.",
        "Nada aqui afasta direito que a lei garanta de forma inafastável.",
      ],
    },
    {
      id: "dados",
      titulo: "11. Dados pessoais",
      paragrafos: [
        "O tratamento de dados pessoais está detalhado na Política de Privacidade, que faz parte destes Termos.",
        "Resumo do que importa: os dados dos SEUS clientes (nome, telefone, endereço de entrega, CPF em nota) são seus, e você é quem responde por eles perante a lei. Nós tratamos esses dados a seu pedido, para operar o sistema, e seguindo as suas instruções.",
      ],
    },
    {
      id: "mudancas",
      titulo: "12. Mudanças nestes Termos",
      paragrafos: [
        "Podemos atualizar estes Termos. Quando a mudança afetar direito ou obrigação sua, avisamos com pelo menos 30 dias de antecedência, e você pode cancelar sem multa se não concordar.",
        "A versão publicada nesta página é sempre a que está valendo, e a data de vigência fica no topo do documento.",
      ],
    },
    {
      id: "foro",
      titulo: "13. Lei e foro",
      paragrafos: [
        "Estes Termos seguem a lei brasileira.",
        EMPRESA.foro
          ? `Fica eleito o foro da comarca de ${EMPRESA.foro} para resolver o que não se resolver conversando.`
          : "Antes de qualquer disputa, procure a gente: quase tudo se resolve conversando. Não sendo possível, vale o foro do domicílio do estabelecimento contratante.",
        EMPRESA.email && `Contato: ${EMPRESA.email}`,
      ].filter(Boolean),
    },
  ],
};

export default TERMOS_DE_USO;
