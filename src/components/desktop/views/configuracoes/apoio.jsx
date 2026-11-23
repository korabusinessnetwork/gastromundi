import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuBanknote, LuCreditCard, LuSmartphone, LuZap } from "react-icons/lu";
import {
  FAIXA_PADRAO, normalizarHorario
} from "@/lib/deliveryHorario";
import { novoUid, comUid } from "@/lib/uidLista";

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

export const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote,   desc: "Pagamento em espécie" },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard, desc: "Cartão de crédito" },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone, desc: "Cartão de débito" },
  { id: "pix",      label: "Pix",      Icon: LuZap,        desc: "Pagamento via Pix" },
];

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

// ── Aba Delivery (abertura automática por horário) ────────────────
// Centraliza a configuração do delivery nas Configurações. Por ora: o
// AGENDAMENTO de abertura/fechamento automático (dias da semana + horário).
// Mora em config_delivery.horario; quem reconcilia o flag `aberto` com o
// horário é o app do operador aberto (ver DeliveryView) — sem cron no
// servidor (fase de custo zero). Toda a lógica de horário é pura e testada
// em src/lib/deliveryHorario.js.
//
// TD015: as faixas são adicionadas e removidas do meio da lista, então cada uma
// precisa de identidade própria para renderizar. Esse `uid` vive SÓ no state desta
// tela: `normalizarHorario` reconstrói cada faixa como `{ abre, fecha }`, então ele
// morre na fronteira do save sem precisar de limpeza explícita. O módulo de horário
// se declara puro, por isso o carimbo mora aqui e não lá.
export const faixaNova = () => ({ ...FAIXA_PADRAO, uid: novoUid() });

export const horarioParaEdicao = (bruto) => {
  const h = normalizarHorario(bruto);
  return { ...h, faixas: comUid(h.faixas) };
};
