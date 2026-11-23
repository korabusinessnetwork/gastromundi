import { createContext, useContext } from "react";

/**
 * Fatia das comandas do `AppContext` (tarefa 2.6 do plano de refatoração):
 * comandas em aberto, o que o garçom já lançou, e as ações de abrir, editar,
 * fechar e travar uma comanda para edição.
 *
 * Tela que só precisa disto usa `useComandas()` em vez de `useApp()`. O estado
 * ainda mora no `AppProvider` (ver a tarefa 2.9 do plano).
 */
export const ComandasContext = createContext(null);

export function useComandas() {
  const ctx = useContext(ComandasContext);
  if (!ctx) throw new Error("useComandas deve ser usado dentro de <AppProvider>");
  return ctx;
}
