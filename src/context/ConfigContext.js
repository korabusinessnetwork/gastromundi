import { createContext, useContext } from "react";

/**
 * Fatia de configuração do `AppContext` (tarefa 2.4 do plano de refatoração):
 * meios e métodos de pagamento, TEF, taxa de serviço, ponte local, alerta de
 * validade e limite de sangria, com as ações que gravam cada um.
 *
 * Tela que só precisa disto usa `useConfig()` em vez de `useApp()`. O estado
 * ainda mora no `AppProvider` (ver a tarefa 2.9 do plano).
 */
export const ConfigContext = createContext(null);

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig deve ser usado dentro de <AppProvider>");
  return ctx;
}
