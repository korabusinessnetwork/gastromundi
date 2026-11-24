import { LuBanknote, LuCreditCard, LuZap, LuSmartphone } from "react-icons/lu";

// Os quatro meios de pagamento de fábrica, com nome, ícone e descrição. Estava
// copiado em quatro telas: finalização do PDV, fechamento de caixa, Meios de
// Pagamento das Configurações do computador e do celular (refatoração 4.10).
export const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote,   desc: "Pagamento em espécie" },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard, desc: "Cartão de crédito" },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone, desc: "Cartão de débito" },
  { id: "pix",      label: "Pix",      Icon: LuZap,        desc: "Pagamento via Pix" },
];

/** O mesmo catálogo, indexado pelo identificador do meio. */
export const METODOS_POR_ID = Object.fromEntries(METODOS_CATALOG.map((m) => [m.id, m]));
