import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuCreditCard, LuZap, LuSmartphone
} from "react-icons/lu";

// "Admin" só entra para role admin (visão consolidada/sensível) — B3.

export const PERIODOS = [
  { id: "hoje",    label: "Hoje"    },
  { id: "semana",  label: "7 dias"  },
  { id: "mes",     label: "30 dias" },
  { id: "tudo",    label: "Tudo"    },
  { id: "custom",  label: "Período" },
];

export const METODOS_ICON  = { dinheiro: LuBanknote, credito: LuCreditCard, debito: LuSmartphone, pix: LuZap };

export const ACTION_TYPE_META = {
  auth:    { label: "Auth",    color: varColor(C.blue)      },
  caixa:   { label: "Caixa",  color: varColor(C.warn)      },
  comanda: { label: "Comanda", color: varColor(C.green)     },
  itens:   { label: "Itens",  color: varColor(C.green)     },
  produto: { label: "Produto", color: varColor(C.accent)    },
};

export function tipoLog(actionType) {
  const prefix = (actionType ?? "").split(":")[0];
  return ACTION_TYPE_META[prefix] ?? { label: actionType ?? "—", color: varColor(C.muted) };
}

export const fmtR = (v) => "R$ " + Number(v ?? 0).toFixed(2);

// ── Componentes auxiliares ────────────────────────────────────────

export const METODOS_DETALHE = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];

// Movidos para a feature na refatoração 4.10; reexportados para as telas.
export { ABAS_BASE, SALE_PREFIXES, filtrarPorPeriodo, fmtData } from "@/features/relatorios/regras/relatorio";
