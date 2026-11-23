import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuCreditCard, LuZap, LuSmartphone
} from "react-icons/lu";

export const ABAS_BASE = ["Vendas", "Desempenho", "Cancelamentos", "Fechamentos", "Logs", "Credenciais"];
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

export const SALE_PREFIXES = new Set(["comanda", "itens", "produto"]);

export function filtrarPorPeriodo(list, campo, periodo, customInicio, customFim) {
  if (periodo === "tudo") return list;
  if (periodo === "custom") {
    if (!customInicio && !customFim) return list;
    const ini = customInicio ? new Date(customInicio + "T00:00:00").getTime() : 0;
    const fim = customFim    ? new Date(customFim    + "T23:59:59").getTime() : Infinity;
    return list.filter(r => {
      const t = r[campo] ? new Date(r[campo]).getTime() : 0;
      return t >= ini && t <= fim;
    });
  }
  const hojeInicio = new Date(new Date().toDateString()).getTime();
  const dias  = periodo === "semana" ? 7 : 30;
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  return list.filter(r => {
    const t = r[campo] ? new Date(r[campo]).getTime() : 0;
    return periodo === "hoje" ? t >= hojeInicio : t >= desde;
  });
}

export function fmtData(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export const fmtR = (v) => "R$ " + Number(v ?? 0).toFixed(2);

// ── Componentes auxiliares ────────────────────────────────────────

export const METODOS_DETALHE = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];
