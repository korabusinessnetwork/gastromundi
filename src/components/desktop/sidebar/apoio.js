import {
  LuReceipt, LuPackage, LuChartBar, LuArchive, LuSettings, LuBriefcase, LuWallet, LuChefHat, LuUsers, LuFileText, LuFileCheck, LuBike
} from "react-icons/lu";

// Cargos e ícones da navegação, usados pela barra lateral e pelo gancho dela.
// F005 — quem opera a gaveta. Mesma lista da policy de INSERT em
// caixa_movimentos: oferecer o botão a quem o banco vai recusar seria
// deixar o operador errar para só depois explicar (Princípio nº 1).
export const CARGOS_MOVIMENTO_CAIXA = ["admin", "gerente", "caixa"];

export const NAV_ICONS = {
  "/app/pdv":           LuReceipt,
  "/app/produtos":      LuPackage,
  "/app/delivery":      LuBike,
  "/app/relatorio":     LuChartBar,
  "/app/estoque":       LuArchive,
  "/app/financeiro":    LuWallet,
  "/app/cozinha":       LuChefHat,
  "/app/clientes":      LuUsers,
  "/app/notas-fiscais": LuFileText,
  "/app/fiscal":        LuFileCheck,
  "/app/configuracoes": LuSettings,
  "/app/admin":         LuBriefcase,
};
