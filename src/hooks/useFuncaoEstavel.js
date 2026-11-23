import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Devolve uma função com identidade fixa que sempre chama a versão MAIS
 * RECENTE de `fn` (tarefa 2.2 do plano de refatoração).
 *
 * Para que serve: as ações do contexto (`login`, `addSale`...) são recriadas a
 * cada render, porque leem o estado do momento. Se entrassem assim no valor
 * memorizado de um contexto, o `useMemo` nunca acertaria e toda tela seria
 * redesenhada do mesmo jeito. Com a identidade fixa, o valor do contexto só
 * muda quando muda um DADO, e quem chama a ação continua recebendo o
 * comportamento atual, nunca uma cópia velha.
 *
 * Não use para função chamada durante o render: a referência é atualizada no
 * layout effect, depois do render.
 */
export function useFuncaoEstavel(fn) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args) => ref.current(...args), []);
}
