import C from "./colors";

export const ROLES = {
  garcom: {
    label: "Garçom",
    color: C.blue,
    description: "Tira pedidos via Palm",
    icon: "🛎️",
    permissions: {
      pdv: false, produtos: false, relatorio: false,
      configuracoes: false, transferir: false, palm: true, estoque: false,
    },
  },
  caixa: {
    label: "Caixa",
    color: C.green,
    description: "Tira pedidos e opera a frente de caixa",
    icon: "🧾",
    permissions: {
      pdv: true, produtos: false, relatorio: false,
      configuracoes: false, transferir: true, palm: true, estoque: false,
    },
  },
  gerente: {
    label: "Gerente",
    color: "#f59e0b",
    description: "Caixa + relatórios e cadastro de produtos",
    icon: "📊",
    permissions: {
      pdv: true, produtos: true, relatorio: true,
      configuracoes: false, transferir: true, palm: true, estoque: true,
    },
  },
  admin: {
    label: "Administrador",
    color: C.accent,
    description: "Acesso completo ao sistema",
    icon: "⚙️",
    permissions: {
      pdv: true, produtos: true, relatorio: true,
      configuracoes: true, transferir: true, palm: true, estoque: true,
    },
  },
};

export const ROLE_FEATURES = {
  garcom:  ["Palm — tirar pedidos"],
  caixa:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas"],
  gerente: ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos"],
  admin:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos", "Configurações"],
};

export const getPermissions = (role) =>
  ROLES[role]?.permissions || ROLES.garcom.permissions;
