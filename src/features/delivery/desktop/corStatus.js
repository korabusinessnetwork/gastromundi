import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { statusCor } from "@/features/delivery/dados/deliveryPedidos";

// Chaves de cor semânticas (statusCor) → token do design system. O âmbar era
// o hex `#f59e0b` cravado aqui; `--gm-warn` vale exatamente esse valor
// (src/styles/tema.css) e está na lista de tokens que o tenant pode
// sobrescrever (src/lib/tema.js), então a cor do status segue o tema como
// todas as outras — white-label sem exceção (decisão 017).
export const COR_STATUS = {
  blue:   C.blue,
  accent: C.accent,
  green:  C.green,
  red:    C.red,
  muted:  C.muted,
  amber:  C.warn,
};
export const baseCorStatus = (status) => COR_STATUS[statusCor(status)] || C.muted;
export const cssCor = (base) =>
  typeof base === "string" && base.startsWith("--gm-") ? varColor(base) : base;
