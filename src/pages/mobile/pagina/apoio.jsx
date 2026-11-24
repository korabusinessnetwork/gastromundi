import MODULOS from "@/constants/modulos";

export const TOTAL_COMANDAS = 1000;

export const PAGE = 50;

/**
 * Módulos oferecidos na aba "Mais".
 *
 * Os que já têm tela nativa de celular (`registro.js`) abrem aqui mesmo,
 * dentro do Palm, sem sair para o desktop. Os que ainda não têm continuam
 * levando para `rota` com o aviso "melhor no computador" — daí `rota` seguir
 * obrigatória em todos. Nada hardcodado por cliente: a lista é filtrada por
 * permissão do usuário e pelo plano do tenant (`moduloHabilitado`).
 */
export const MODULOS_MAIS = [
  { chave: "pdv", perm: "pdv", modulo: MODULOS.PDV, rota: "/app/pdv", icone: "pdv", rotulo: "PDV", descricao: "Caixa e cobrança" },
  { chave: "produtos", perm: "produtos", modulo: MODULOS.CARDAPIO, rota: "/app/produtos", icone: "cardapio", rotulo: "Cardápio", descricao: "Produtos e preços" },
  { chave: "estoque", perm: "estoque", modulo: MODULOS.ESTOQUE, rota: "/app/estoque", icone: "estoque", rotulo: "Estoque", descricao: "Insumos e validade" },
  { chave: "cozinha", perm: "cozinha", modulo: MODULOS.COZINHA, rota: "/app/cozinha", icone: "cozinha", rotulo: "Cozinha", descricao: "Painel de produção" },
  { chave: "delivery", perm: "produtos", modulo: MODULOS.DELIVERY, rota: "/app/delivery", icone: "delivery", rotulo: "Delivery", descricao: "Pedidos para entrega" },
  { chave: "financeiro", perm: "financeiro", modulo: MODULOS.FINANCEIRO, rota: "/app/financeiro", icone: "financeiro", rotulo: "Financeiro", descricao: "Contas e fluxo de caixa" },
  { chave: "relatorio", perm: "relatorio", modulo: MODULOS.RELATORIOS, rota: "/app/relatorio", icone: "relatorios", rotulo: "Relatórios", descricao: "Vendas e desempenho" },
  { chave: "clientes", perm: "clientes", modulo: MODULOS.CLIENTES, rota: "/app/clientes", icone: "clientes", rotulo: "Clientes", descricao: "Cadastro e histórico" },
];

/** "HH:MM" a partir de um ISO; undefined se não der para interpretar. */
export function formatHoraCurta(iso) {
  if (!iso) return undefined;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return undefined;
  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  return `${hora}:${min}`;
}
