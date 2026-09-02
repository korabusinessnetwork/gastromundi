/**
 * Catálogo comercial do SITE (apex kora.codes) — módulos, add-ons e os
 * planos prontos, com os preços de referência da decisão 029.
 *
 * Mora fora do componente porque duas telas dependem dos MESMOS números:
 * o construtor de plano (`ApexPlanos`) e o cadastro de conta
 * (`ApexCriarContaPage`), onde a pessoa escolhe com que plano quer
 * começar. Dois catálogos iam divergir no primeiro reajuste — e o preço
 * que o cliente escolheu é o assunto da conversa comercial que vem
 * depois.
 *
 * São valores de REFERÊNCIA, não a tabela de cobrança: o plano real do
 * estabelecimento nasce no provisionamento (catálogo `public.planos`), e o
 * preço fechado vai para a mensalidade da assinatura. Ao mudar preço aqui,
 * mudar também em `memory/decisions.md` (decisão 029).
 */

export const ESSENCIAL = {
  nome: "Essencial",
  preco: 149,
  itens: ["Cardápio e pedidos", "PDV (1 caixa)", "Controle de caixa"],
};

export const MODULOS = [
  {
    codigo: "estoque",
    nome: "Estoque",
    descricao: "Controle de insumos com alerta de mínimo",
    preco: 40,
  },
  {
    codigo: "pedidos_avancado",
    nome: "Comandas",
    descricao: "Pedidos organizados por comanda, com transferência entre mesas",
    preco: 40,
  },
  {
    codigo: "mesas_comandas",
    nome: "Mesas & Salão",
    descricao: "Layout do salão com status das mesas em tempo real",
    preco: 50,
  },
  {
    codigo: "cozinha",
    nome: "Cozinha (KDS)",
    descricao: "Tela de preparo com impressão automática por categoria",
    preco: 40,
  },
  {
    codigo: "financeiro",
    nome: "Financeiro",
    descricao: "Contas a pagar/receber e fluxo de caixa do mês",
    preco: 60,
  },
  {
    codigo: "clientes",
    nome: "Clientes & Fiado",
    descricao: "Cadastro de clientes e conta corrente (fiado)",
    preco: 50,
  },
  {
    codigo: "relatorios",
    nome: "Relatórios avançados",
    descricao: "Faturamento, produtos mais vendidos e comparativos por período",
    preco: 38,
  },
  {
    codigo: "multiloja",
    nome: "Multi-loja",
    descricao: "Painel consolidado para mais de uma unidade",
    preco: 150,
  },
  {
    codigo: "jarvas",
    nome: "JARVAS, gerente virtual com IA",
    descricao: "Alertas de queda de venda, sugestões de compra e resumo diário",
    preco: 700,
    destaque: true,
  },
];

export const ADDONS = [
  {
    codigo: "nfe",
    nome: "NF-e / NFC-e",
    descricao: "Emissão fiscal com contingência automática",
    preco: 80,
  },
  {
    codigo: "tef",
    nome: "TEF",
    descricao: "Maquininha integrada ao caixa",
    preco: 60,
  },
];

// Planos prontos (presets): combinações curadas para quem não quer montar
// módulo por módulo. Um clique preenche a seleção; a pessoa ainda pode
// ligar/desligar itens depois. O último ("Kora Total") é o topo de linha —
// tudo ligado, com JARVAS e emissão fiscal — e ganha destaque roxo→dourado.
export const PLANOS_PRONTOS = [
  {
    codigo: "balcao",
    nome: "Balcão",
    resumo: "Vende no balcão e quer controle básico de estoque e vendas",
    modulos: ["estoque", "relatorios"],
    addons: [],
  },
  {
    codigo: "restaurante",
    nome: "Restaurante",
    resumo: "Salão, comandas e cozinha rodando juntos, com fiado e financeiro",
    modulos: [
      "estoque",
      "pedidos_avancado",
      "mesas_comandas",
      "cozinha",
      "financeiro",
      "clientes",
      "relatorios",
    ],
    addons: [],
  },
  {
    codigo: "kora_total",
    nome: "Kora Total",
    resumo: "Tudo ligado, com JARVAS (IA) e emissão fiscal, o topo de linha",
    modulos: MODULOS.map((m) => m.codigo),
    addons: ADDONS.map((a) => a.codigo),
    premium: true,
  },
];

/**
 * Preço mensal de referência de um plano pronto: o essencial (sempre
 * incluído) mais os módulos e add-ons que o preset liga.
 *
 * @param {{modulos?: string[], addons?: string[]}} preset
 * @returns {number} total em reais
 */
export function totalDoPreset(preset) {
  const soma = (codigos = [], catalogo = []) =>
    catalogo.filter((item) => codigos.includes(item.codigo))
            .reduce((acc, item) => acc + item.preco, 0);
  return (
    ESSENCIAL.preco +
    soma(preset?.modulos, MODULOS) +
    soma(preset?.addons, ADDONS)
  );
}

/**
 * Nomes legíveis do que um plano pronto inclui além do essencial — é o que
 * viaja junto da solicitação para o Console saber do que a conversa trata.
 *
 * @param {{modulos?: string[], addons?: string[]}} preset
 * @returns {string[]}
 */
export function itensDoPreset(preset) {
  return [
    ...MODULOS.filter((m) => (preset?.modulos ?? []).includes(m.codigo)).map((m) => m.nome),
    ...ADDONS.filter((a) => (preset?.addons ?? []).includes(a.codigo)).map((a) => a.nome),
  ];
}
