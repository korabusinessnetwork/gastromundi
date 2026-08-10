import { EMPRESA, VERSAO_LEGAL, VIGENTE_DESDE, dataPorExtenso } from "./versaoLegal";

/**
 * Política de Privacidade — conteúdo como DADO (decisão 018), mesmo formato
 * dos Termos.
 *
 * O ponto que não pode sair daqui é a divisão de papéis da LGPD: sobre os
 * dados da CONTA do estabelecimento nós somos controladores; sobre os dados
 * que o estabelecimento coleta dos clientes finais dele (telefone e endereço
 * de delivery, CPF na nota, ficha de fiado) nós somos OPERADORES — quem
 * responde por eles é o estabelecimento. Trocar isso de lugar promete o que
 * não podemos cumprir e tira do cliente uma obrigação que é dele.
 *
 * Os subprocessadores estão nomeados de propósito: transparência é exigência
 * da lei, e é a primeira coisa que um cliente com contador atento pergunta.
 */

const quem = EMPRESA.razaoSocial || EMPRESA.nome;
const contato = EMPRESA.emailEncarregado || EMPRESA.email;

export const POLITICA_PRIVACIDADE = {
  id: "privacidade",
  titulo: "Política de Privacidade",
  versao: VERSAO_LEGAL,
  vigenteDesde: VIGENTE_DESDE,
  resumo:
    "Em uma frase: guardamos o mínimo necessário para o sistema funcionar, " +
    "não vendemos dado de ninguém, e os dados dos clientes do seu " +
    "estabelecimento continuam sendo seus — nós só os processamos a seu pedido.",
  secoes: [
    {
      id: "papeis",
      titulo: "1. Dois papéis diferentes (e por que isso importa)",
      paragrafos: [
        `A lei brasileira de proteção de dados (LGPD) separa quem DECIDE o uso do dado de quem apenas PROCESSA. No ${EMPRESA.nome} valem os dois papéis, dependendo do dado:`,
      ],
      itens: [
        `Dados da conta do estabelecimento (nome do negócio, contato do responsável, usuários, cobrança): quem decide somos nós, ${quem}. Somos controladores.`,
        "Dados dos clientes finais do estabelecimento (telefone e endereço de entrega, CPF pedido na nota, ficha de fiado, histórico de pedidos): quem decide é o estabelecimento. Ele é o controlador; nós somos operadores e agimos conforme as instruções dele.",
      ],
      paragrafosFinais: [
        "Na prática: se um cliente do restaurante quiser saber quais dados dele existem, ou pedir para apagá-los, quem responde é o restaurante — e nós damos as ferramentas para que isso seja cumprido.",
      ],
    },
    {
      id: "o-que-coletamos",
      titulo: "2. Que dados existem no sistema",
      paragrafos: ["Nada é coletado por curiosidade. O que existe, e para quê:"],
      itens: [
        "Cadastro do estabelecimento: nome, endereço do sistema, plano contratado e contato do responsável — para criar e manter a conta.",
        "Usuários do estabelecimento: nome, usuário de acesso, função e senha (guardada cifrada, nem nós conseguimos lê-la) — para dar acesso e registrar quem fez o quê.",
        "Operação do dia a dia: produtos, vendas, comandas, caixa, estoque e financeiro — é o serviço em si.",
        "Clientes finais, quando o estabelecimento os cadastra: nome, telefone, endereço de entrega, CPF na nota e histórico de compras — para delivery, fiado e programa de fidelidade.",
        "Registro de atividade: quem entrou, quando, e quais ações sensíveis foram feitas (cancelamento, sangria, desconto) — segurança e auditoria do próprio estabelecimento.",
        "Dados técnicos: erros do sistema, versão do aplicativo e informação de navegador — para consertar defeito. Erros passam por limpeza automática antes de sair do navegador, para não levar junto dado pessoal ou financeiro.",
      ],
      paragrafosFinais: [
        "Não pedimos, não guardamos e não temos acesso a número completo de cartão: o pagamento por cartão é feito na maquininha, fora do sistema.",
      ],
    },
    {
      id: "por-que",
      titulo: "3. Por que podemos tratar esses dados",
      paragrafos: [
        "As bases legais que usamos, na linguagem da LGPD:",
      ],
      itens: [
        "Execução de contrato: sem os dados da conta e da operação, não há sistema a entregar.",
        "Obrigação legal: registros que a lei manda guardar (fiscal, contábil).",
        "Legítimo interesse: segurança da plataforma, prevenção a fraude e correção de defeito.",
        "Consentimento: quando for o caso, pedido de forma clara e separada — e revogável.",
      ],
    },
    {
      id: "compartilhamento",
      titulo: "4. Com quem os dados são compartilhados",
      paragrafos: [
        "Não vendemos dados, não cedemos para publicidade e não repassamos para terceiros que não sejam necessários ao funcionamento do serviço.",
        "Para o sistema existir, usamos fornecedores de infraestrutura, que tratam os dados só para nos prestar serviço:",
      ],
      itens: [
        "Supabase — banco de dados, autenticação e arquivos.",
        "Vercel — hospedagem e entrega do sistema no navegador.",
        "Sentry — registro de erros técnicos (com limpeza de dado pessoal antes do envio).",
      ],
      paragrafosFinais: [
        "Também compartilhamos quando a lei ou uma ordem judicial obrigar. Se isso acontecer e for permitido avisar, avisamos.",
        "Parte da infraestrutura fica em servidores fora do Brasil. A transferência internacional segue as exigências da LGPD e é feita com fornecedores que oferecem garantias de proteção.",
      ],
    },
    {
      id: "prazo",
      titulo: "5. Por quanto tempo guardamos",
      paragrafos: [
        "Enquanto a conta estiver ativa, os dados ficam disponíveis para você usar.",
        "Cancelada a conta, guardamos por 30 dias — janela para você exportar ou voltar atrás. Depois disso, apagamos em definitivo, salvo o que a lei mandar reter por prazo maior (registros fiscais e contábeis).",
        "Cópias de segurança do banco são guardadas por 30 dias e depois descartadas.",
      ],
    },
    {
      id: "seguranca",
      titulo: "6. Como protegemos",
      paragrafos: ["O que já está em uso:"],
      itens: [
        "Separação por estabelecimento no próprio banco de dados: um estabelecimento não alcança o dado do outro, mesmo que tente.",
        "Senhas guardadas cifradas, nunca em texto legível.",
        "Tráfego criptografado entre o navegador e o servidor.",
        "Acesso por função: cada pessoa vê só o que o cargo dela precisa.",
        "Bloqueio após tentativas de senha erradas e expiração de sessão por inatividade.",
        "Registro das ações sensíveis, para dar rastro auditável.",
      ],
      paragrafosFinais: [
        "Nenhum sistema é 100% seguro. Se houver incidente que traga risco relevante, comunicamos os afetados e a Autoridade Nacional de Proteção de Dados, como a lei exige.",
      ],
    },
    {
      id: "direitos",
      titulo: "7. Seus direitos, e como exercê-los",
      paragrafos: ["A LGPD garante a você:"],
      itens: [
        "Saber se tratamos dados seus e quais são.",
        "Corrigir dado incompleto ou errado.",
        "Pedir cópia dos seus dados em formato legível (portabilidade).",
        "Pedir a exclusão dos dados, respeitado o que a lei manda reter.",
        "Revogar consentimento, quando o tratamento se basear nele.",
        "Saber com quem compartilhamos.",
      ],
      paragrafosFinais: [
        contato
          ? `Para exercer qualquer um deles, escreva para ${contato}. Respondemos em até 15 dias.`
          : "Para exercer qualquer um deles, use o canal de contato informado na contratação. Respondemos em até 15 dias.",
        "Se você é cliente de um estabelecimento que usa o sistema (pediu delivery, comprou fiado), fale primeiro com o estabelecimento: os dados são dele, e nós cumprimos o que ele determinar.",
        "Exportação e exclusão completa dos dados de um estabelecimento são feitas por nós a pedido do responsável, sem custo.",
      ],
    },
    {
      id: "armazenamento-local",
      titulo: "8. Cookies e armazenamento no navegador",
      paragrafos: [
        "Não usamos cookies de publicidade nem rastreamento de terceiros.",
        "O sistema guarda no seu próprio navegador o necessário para funcionar: a sessão de quem está logado, preferências de tela e a marca do estabelecimento para a tela de entrada abrir já com a identidade certa. Limpar os dados do navegador apaga tudo isso e só significa entrar de novo.",
      ],
    },
    {
      id: "criancas",
      titulo: "9. Crianças e adolescentes",
      paragrafos: [
        "O sistema é ferramenta de trabalho, destinada a maiores de 18 anos. Não coletamos dados de crianças de propósito. Se identificarmos cadastro assim, apagamos.",
      ],
    },
    {
      id: "mudancas-politica",
      titulo: "10. Mudanças nesta Política",
      paragrafos: [
        "Quando mudarmos algo relevante, avisamos pelos canais de contato e atualizamos a data de vigência no topo.",
        `Esta é a versão ${VERSAO_LEGAL}, em vigor desde ${dataPorExtenso(VIGENTE_DESDE)}.`,
      ],
    },
    {
      id: "encarregado",
      titulo: "11. Quem responde por proteção de dados",
      paragrafos: [
        contato
          ? `Dúvida, pedido ou reclamação sobre dados pessoais: ${contato}.`
          : "Dúvida, pedido ou reclamação sobre dados pessoais: use o canal de contato informado na contratação.",
        "Você também pode procurar diretamente a Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
  ],
};

export default POLITICA_PRIVACIDADE;
