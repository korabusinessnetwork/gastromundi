import C from "@/constants/colors";
import { varColor } from "@/lib/tema";

export const ROLES = [
  { id: "admin",   label: "Administrador", color: varColor(C.accent) },
  { id: "gerente", label: "Gerente",       color: varColor(C.blue)   },
  { id: "caixa",   label: "Caixa",         color: varColor(C.green)  },
  { id: "garcom",  label: "Garçom",        color: varColor(C.warn)  },
];

export const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.id, r]));

// Ordem dos cargos na matriz de permissões (do menor para o maior acesso).
export const CARGOS_MATRIZ = ["garcom", "caixa", "gerente", "admin"].map(id => ROLE_MAP[id]);

// `permissions` = OVERRIDE do funcionário (parcial ou null). null = segue o cargo.
export const EMPTY_USER_FORM = { name: "", username: "", role: "caixa", password: "", confirmPassword: "", permissions: null };

// ── Helpers ───────────────────────────────────────────────────────

export function traduzirErro(error) {
  const msg = error?.message ?? "";
  if (msg.includes("users_username_key") || msg.includes("duplicate key"))
    return "Esse nome de usuário já está em uso (pode ser um usuário desativado).";
  if (msg.includes("not-null") || msg.includes("null value"))
    return "Campo obrigatório não preenchido.";
  if (error?.code === "no_rows_updated")
    return "Não foi possível salvar: só um administrador pode editar usuários.";
  if (error?.code === "no_rows_deleted")
    return "Não foi possível excluir: só um administrador pode remover usuários.";
  if (msg.includes("permission denied") || msg.includes("policy"))
    return "Sem permissão para realizar esta ação.";
  return "Erro ao salvar: " + msg;
}

// ── Aba Usuários ──────────────────────────────────────────────────


// ── Aba Meios de Pagamento ────────────────────────────────────────

export const TIPOS_UNIDADE = [
  { tipo: "estoque", label: "Unidade de estoque", color: varColor(C.blue)   },
  { tipo: "compra",  label: "Unidade de compra",  color: varColor(C.green)  },
  { tipo: "consumo", label: "Unidade de consumo", color: varColor(C.warn)   },
];

export const EMPTY_ADD = { abbr: "", nome: "" };

export const ABAS_CONFIG = [
  { id: "geral",            label: "Geral",               adminOnly: false },
  // Marca do estabelecimento (nome e logo) — quem responde pela marca é o
  // dono, e a escrita é por RPC de admin (20260914), então a aba acompanha.
  { id: "identidade",       label: "Identidade",          adminOnly: true  },
  { id: "usuarios",         label: "Usuários",            adminOnly: false },
  { id: "meios_pagamento",  label: "Meios de Pagamento",  adminOnly: false },
  { id: "unidades_medida",  label: "Unidades de Medida",  adminOnly: false },
  { id: "mesas",            label: "Mesas",               gerenteOnly: true },
  { id: "delivery",         label: "Delivery",            gerenteOnly: true },
  { id: "categorias",       label: "Radar de Oportunidades", gerenteOnly: true },
  { id: "impressao",        label: "Impressão",           adminOnly: true  },
  { id: "importar",         label: "Importar / Exportar", adminOnly: true  },
  // Assinatura é assunto de quem responde pelo estabelecimento — caixa e
  // garçom não veem (mesmo recorte do banner do topo).
  { id: "assinatura",       label: "Minha assinatura",    gerenteOnly: true },
];
