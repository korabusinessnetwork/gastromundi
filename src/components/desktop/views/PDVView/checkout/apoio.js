import { LuBanknote, LuCreditCard, LuZap, LuSmartphone } from "react-icons/lu";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.

// Formatação e catálogo de métodos da finalização, usados pela tela e pelo gancho.
export const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

/**
 * Dinheiro na mão nunca é negativo. `min="0"` num <input type="number"> só
 * limita a setinha e a validação nativa do form — digitar "-50" passa direto.
 * E "-50" fazia mais do que exibir número errado: a trava de dinheiro
 * insuficiente perguntava `recebido > 0`, então valor negativo escapava dela
 * e LIBERAVA o "Confirmar Pagamento" de uma conta que não foi paga. Prevenir
 * na entrada é melhor do que avisar depois.
 */
export const valorRecebido = (texto) => {
  const n = parseFloat(texto);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const METODOS_CATALOG = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];
