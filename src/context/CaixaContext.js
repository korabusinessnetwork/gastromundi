import { createContext, useContext } from "react";

/**
 * Fatia do caixa do `AppContext` (tarefa 2.7 do plano de refatoração):
 * vendas, fechamentos, fundo e abertura do caixa, sangrias e suprimentos, com
 * as ações de vender, cancelar venda, fechar o caixa e registrar movimento.
 *
 * Tela que só precisa disto usa `useCaixa()` em vez de `useApp()`. O estado
 * ainda mora no `AppProvider` (ver a tarefa 2.9 do plano).
 */
export const CaixaContext = createContext(null);

export function useCaixa() {
  const ctx = useContext(CaixaContext);
  if (!ctx) throw new Error("useCaixa deve ser usado dentro de <AppProvider>");
  return ctx;
}
