import { createContext, useContext } from "react";

/**
 * Fatia do catálogo do `AppContext` (tarefa 2.5 do plano de refatoração):
 * produtos, saldos e mínimos de estoque, grupos de categoria, e as ações que
 * cadastram produto, ajustam saldo e dão baixa ou entrada de estoque.
 *
 * Tela que só precisa disto usa `useCatalogo()` em vez de `useApp()`. O estado
 * ainda mora no `AppProvider` (ver a tarefa 2.9 do plano).
 */
export const CatalogoContext = createContext(null);

export function useCatalogo() {
  const ctx = useContext(CatalogoContext);
  if (!ctx) throw new Error("useCatalogo deve ser usado dentro de <AppProvider>");
  return ctx;
}
