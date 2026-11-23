import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuClipboardList, LuTruck, LuShoppingCart, LuPercent, LuFileText, LuWallet, LuReceipt, LuFileCheck
} from "react-icons/lu";

export const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

export const fmtR  = (v) => "R$ " + Number(v ?? 0).toFixed(2);

export const fmtDt = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

export const STATUS_COMPRA = {
  pendente:  { label: "Pendente",  color: varColor(C.warn)    },
  pago:      { label: "Pago",      color: varColor(C.green)   },
  cancelado: { label: "Cancelado", color: varColor(C.muted)   },
};

// ── Shared UI ─────────────────────────────────────────────────────

export const FICHA_VAZIA = { id: "", produtoId: null, nome: "", categoria: "", rendimento: "1", ingredientes: [], preparo: "" };

export const ING_VAZIO   = { produtoId: null, nome: "", emoji: "", qtd: "", unidade: "g", custoUnit: "" };

export const FORN_VAZIO = { id: "", nome: "", cnpj: "", categoria: "", contato: "", telefone: "", email: "", observacoes: "" };

export const COMPRA_VAZIA = { id: "", fornecedor: "", data: "", itens: [], status: "pendente", observacoes: "" };

export const ITEM_VAZIO   = { nome: "", qtd: "", unidade: "un", valorUnit: "" };

// Seções com `secao` são abas internas da Área Admin (abrem aqui mesmo).
// Seções com `to` são atalhos para telas próprias (Financeiro, Notas Emitidas,
// Config. Fiscal) — saíram da sidebar (que estava lotada) e agora vivem aqui.
// `perm` esconde o atalho de quem não tem acesso à tela de destino.
export const SECOES = [
  { id: "fichas",         label: "Ficha Técnica",       desc: "Receitas, ingredientes e custo por porção",         Icon: LuClipboardList, color: varColor(C.accent) },
  { id: "fornecedores",   label: "Fornecedores",        desc: "Contatos e cadastro de fornecedores",               Icon: LuTruck,         color: varColor(C.blue)  },
  { id: "compras",        label: "Compras",             desc: "Registro de compras e pedidos",                     Icon: LuShoppingCart,  color: varColor(C.green) },
  { id: "impostos",       label: "Impostos",            desc: "Alíquotas por categoria",                           Icon: LuPercent,       color: "#f97316" },
  { id: "notas_fiscais",  label: "Notas de Entrada",    desc: "Importação de NF-e (XML) dos fornecedores",         Icon: LuFileText,      color: varColor(C.blue) },
  { id: "financeiro",     label: "Financeiro",          desc: "Fluxo de caixa, contas e lucro",                    Icon: LuWallet,        color: varColor(C.green), to: "/app/financeiro",    perm: "financeiro"    },
  { id: "notas_emitidas", label: "Notas Emitidas",      desc: "Consulta, reimpressão e cancelamento de NFC-e",     Icon: LuReceipt,       color: varColor(C.blue),  to: "/app/notas-fiscais", perm: "relatorio"     },
  { id: "config_fiscal",  label: "Configuração Fiscal", desc: "CNPJ, série, ambiente e certificado do emissor",    Icon: LuFileCheck,     color: "#f97316",         to: "/app/fiscal",        perm: "configuracoes" },
];
