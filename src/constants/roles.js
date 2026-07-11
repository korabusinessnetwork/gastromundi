import C from "./colors";
import { varColor } from "@/lib/tema";

export const ROLES = {
  garcom: {
    label: "Garçom",
    color: varColor(C.blue),
    description: "Tira pedidos via Palm",
    icon: "🛎️",
    permissions: {
      pdv: false, produtos: false, relatorio: false,
      configuracoes: false, transferir: false, palm: true, estoque: false,
      financeiro: false, cozinha: true, clientes: true,
    },
  },
  caixa: {
    label: "Caixa",
    color: varColor(C.green),
    description: "Tira pedidos e opera a frente de caixa",
    icon: "🧾",
    permissions: {
      pdv: true, produtos: false, relatorio: false,
      configuracoes: false, transferir: true, palm: true, estoque: false,
      financeiro: false, cozinha: true, clientes: true,
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
      financeiro: true, cozinha: true, clientes: true,
    },
  },
  admin: {
    label: "Administrador",
    color: varColor(C.accent),
    description: "Acesso completo ao sistema",
    icon: "⚙️",
    permissions: {
      pdv: true, produtos: true, relatorio: true,
      configuracoes: true, transferir: true, palm: true, estoque: true,
      financeiro: true, cozinha: true, clientes: true,
    },
  },
};

export const ROLE_FEATURES = {
  garcom:  ["Palm — tirar pedidos", "Cozinha (KDS)", "Clientes"],
  caixa:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Cozinha (KDS)", "Clientes"],
  gerente: ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos", "Financeiro", "Cozinha (KDS)", "Clientes"],
  admin:   ["Palm — tirar pedidos", "Frente de Caixa", "Transferir Comandas", "Relatório de Vendas", "Cadastro de Produtos", "Configurações", "Financeiro", "Cozinha (KDS)", "Clientes"],
};

export const getPermissions = (role) =>
  ROLES[role]?.permissions || ROLES.garcom.permissions;
