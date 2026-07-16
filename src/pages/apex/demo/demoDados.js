// Dados FICTÍCIOS do protótipo /demo do site institucional (kora.codes).
// Contrato compartilhado entre as telas da demo — nada aqui vem do banco,
// nada aqui é de um cliente real. A demo nunca importa Supabase/AppContext.

/** Formata número como moeda pt-BR (a demo é autocontida — não importa utils do app). */
export function formatarBRL(valor) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const CATEGORIAS_DEMO = ["Lanches", "Pratos", "Bebidas", "Cafés", "Sobremesas"];

export const PRODUTOS_DEMO = [
  { id: 1,  nome: "Burger da casa",        preco: 34.9, categoria: "Lanches",    emoji: "🍔" },
  { id: 2,  nome: "X-Salada duplo",        preco: 29.9, categoria: "Lanches",    emoji: "🥪" },
  { id: 3,  nome: "Batata rústica",        preco: 22.0, categoria: "Lanches",    emoji: "🍟" },
  { id: 4,  nome: "Parmegiana + fritas",   preco: 42.0, categoria: "Pratos",     emoji: "🍛" },
  { id: 5,  nome: "Executivo do dia",      preco: 28.5, categoria: "Pratos",     emoji: "🍽️" },
  { id: 6,  nome: "Chopp artesanal 500ml", preco: 14.0, categoria: "Bebidas",    emoji: "🍺" },
  { id: 7,  nome: "Suco natural 300ml",    preco: 9.5,  categoria: "Bebidas",    emoji: "🍊" },
  { id: 8,  nome: "Refrigerante lata",     preco: 6.5,  categoria: "Bebidas",    emoji: "🥤" },
  { id: 9,  nome: "Espresso duplo",        preco: 8.0,  categoria: "Cafés",      emoji: "☕" },
  { id: 10, nome: "Cappuccino cremoso",    preco: 12.0, categoria: "Cafés",      emoji: "🍮" },
  { id: 11, nome: "Pudim de leite",        preco: 11.0, categoria: "Sobremesas", emoji: "🍮" },
  { id: 12, nome: "Brownie com sorvete",   preco: 16.0, categoria: "Sobremesas", emoji: "🍫" },
];

/** Comanda que já chega aberta na Frente de Caixa (Mesa 12, como no hero). */
export const COMANDA_INICIAL = [
  { produtoId: 1, qtd: 1 },
  { produtoId: 6, qtd: 2 },
  { produtoId: 3, qtd: 1 },
];

export const TAXA_SERVICO_DEMO = 0.1;

export const ESTOQUE_DEMO = [
  { id: 1, produto: "Pão brioche",          quantidade: 46,  minimo: 20, unidade: "un" },
  { id: 2, produto: "Blend bovino 160g",    quantidade: 12,  minimo: 24, unidade: "un" },
  { id: 3, produto: "Chopp artesanal",      quantidade: 38,  minimo: 15, unidade: "L"  },
  { id: 4, produto: "Batata pré-frita",     quantidade: 9,   minimo: 10, unidade: "kg" },
  { id: 5, produto: "Queijo prato fatiado", quantidade: 3.2, minimo: 2,  unidade: "kg" },
  { id: 6, produto: "Café em grãos",        quantidade: 7,   minimo: 4,  unidade: "kg" },
  { id: 7, produto: "Leite integral",       quantidade: 18,  minimo: 12, unidade: "L"  },
];

export const CLIENTES_DEMO = [
  { id: 1, nome: "Ana Beatriz",   telefone: "(51) 99999-0101", fiado: 0,     ultimaVisita: "hoje" },
  { id: 2, nome: "Carlos Mendes", telefone: "(51) 99999-0202", fiado: 45.4,  ultimaVisita: "ontem" },
  { id: 3, nome: "Dona Lúcia",    telefone: "(51) 99999-0303", fiado: 0,     ultimaVisita: "há 3 dias" },
  { id: 4, nome: "Equipe da obra", telefone: "(51) 99999-0404", fiado: 182.5, ultimaVisita: "hoje" },
  { id: 5, nome: "Felipe Rocha",  telefone: "(51) 99999-0505", fiado: 0,     ultimaVisita: "há 1 semana" },
];

export const RELATORIO_DEMO = {
  faturamentoHoje: 2846.4,
  vendasHoje: 87,
  ticketMedio: 32.72,
  comparativoOntem: 0.12, // +12% vs ontem
  topProdutos: [
    { nome: "Burger da casa",        qtd: 26, total: 907.4 },
    { nome: "Chopp artesanal 500ml", qtd: 41, total: 574.0 },
    { nome: "Executivo do dia",      qtd: 18, total: 513.0 },
    { nome: "Batata rústica",        qtd: 15, total: 330.0 },
  ],
  // Vendas por hora (12h às 22h) — barras simples do protótipo
  vendasPorHora: [
    { hora: "12h", valor: 420 },
    { hora: "13h", valor: 610 },
    { hora: "14h", valor: 280 },
    { hora: "15h", valor: 120 },
    { hora: "16h", valor: 90 },
    { hora: "17h", valor: 150 },
    { hora: "18h", valor: 260 },
    { hora: "19h", valor: 380 },
    { hora: "20h", valor: 536 },
  ],
  meiosPagamento: [
    { meio: "Pix",      pct: 0.44 },
    { meio: "Crédito",  pct: 0.28 },
    { meio: "Débito",   pct: 0.18 },
    { meio: "Dinheiro", pct: 0.10 },
  ],
};
