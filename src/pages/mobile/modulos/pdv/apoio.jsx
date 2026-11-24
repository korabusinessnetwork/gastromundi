import {
  LuBanknote, LuCreditCard, LuSmartphone, LuZap
} from "react-icons/lu";

/** Ícone dos métodos nativos. Método personalizado do estabelecimento cai
 *  no genérico — a LISTA em si nunca é fixa, vem sempre do tenant. */
export const ICONES_METODO = {
  dinheiro: LuBanknote,
  credito: LuCreditCard,
  debito: LuSmartphone,
  pix: LuZap,
};

/** Mesmo default do AppContext, usado só quando o tenant não configurou nada. */
export const METODOS_PADRAO = ["dinheiro", "credito", "debito", "pix"];

/** Rótulo da venda sem comanda. Genérico do varejo, não é marca de cliente. */
export const COMANDA_BALCAO = "Balcão";

export function precoDoItem(item) {
  return (Number(item?.price) || 0) * (item?.qty ?? 1);
}
