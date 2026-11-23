import { createContext, useContext } from "react";

/**
 * Fatia offline do `AppContext` (tarefa 2.3 do plano de refatoração): se há
 * rede, se o app abriu sem internet, quantas operações esperam na fila local,
 * as notas fiscais pendentes, e as ações de enfileirar e de recarregar os dados.
 *
 * Tela que só precisa disto usa `useOffline()` em vez de `useApp()`. O estado
 * ainda mora no `AppProvider` (ver a tarefa 2.9 do plano).
 */
export const OfflineContext = createContext(null);

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline deve ser usado dentro de <AppProvider>");
  return ctx;
}
