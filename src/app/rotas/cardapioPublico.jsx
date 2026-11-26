import { lazy, Suspense } from "react";

// Vitrine pública de delivery (cardápio online, sem login, pelo endereço do
// estabelecimento). Lazy: só quem abre /cardapio baixa esse código.
const CardapioPage = lazy(() => import("@/pages/delivery/CardapioPage"));

/**
 * Superfície do cardápio público. Fica fora do `PrivateRoute` de propósito: é
 * a única superfície anônima do app além do login. A segurança real está nas
 * funções do banco que o cardápio chama.
 */
export const rotaCardapioPublico = {
  path: "/cardapio",
  element: <Suspense fallback={null}><CardapioPage /></Suspense>,
};
