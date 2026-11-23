import { createContext, useContext } from "react";

/**
 * Fatia da sessão do `AppContext` (tarefa 2.2 do plano de refatoração): quem
 * está logado, a equipe, o estabelecimento (tenant, plano, assinatura) e as
 * permissões por cargo, mais as ações de login, logout e cadastro de usuário.
 *
 * Tela que só precisa disto usa `useSessao()` em vez de `useApp()` e deixa de
 * ser redesenhada quando muda caixa, estoque, comanda ou configuração.
 *
 * O estado ainda mora no `AppProvider`, que também fornece este contexto. A
 * mudança de lugar do código vem depois, já protegida por este limite.
 */
export const SessaoContext = createContext(null);

export function useSessao() {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error("useSessao deve ser usado dentro de <AppProvider>");
  return ctx;
}
