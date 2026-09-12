/**
 * Aviso de versão nova, com a hora do recarregamento na mão do operador.
 *
 * Antes o service worker estava em `autoUpdate` com `immediate`, e nesse modo o
 * cliente do vite-plugin-pwa chama `window.location.reload()` sozinho assim que
 * a versão nova ativa. Como a Vercel publica produção a cada push na `main`, um
 * deploy no meio do expediente recarregava a aba do caixa sem avisar, levando
 * junto o que estava só na memória: carrinho montado e ainda não lançado, modal
 * aberto, campo pela metade. O outro lado do mesmo problema é que a checagem só
 * acontece no carregamento da página, então uma aba aberta há dias segue na
 * versão velha sem nada na tela dizendo isso.
 *
 * Este módulo é a ponte entre o registro do service worker (que acontece antes
 * de existir árvore React) e a faixa que pergunta ao operador. Ele guarda a
 * função de atualizar que o plugin entrega e avisa quem estiver ouvindo.
 *
 * Fica fora do React de propósito: quem chama `anunciarNovaVersao` é o
 * `main.jsx`, no registro, e nesse momento não há componente montado.
 */

let aplicar = null;
const ouvintes = new Set();

/** Chamado pelo registro do service worker quando existe versão nova esperando. */
export function anunciarNovaVersao(fnAplicar) {
  aplicar = typeof fnAplicar === "function" ? fnAplicar : null;
  for (const ouvinte of ouvintes) ouvinte(true);
}

/** Assina o aviso. Devolve a função de cancelar, para o desmonte. */
export function assinarNovaVersao(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Já existe versão nova esperando? Serve para quem monta depois do anúncio. */
export function temNovaVersao() {
  return aplicar !== null;
}

/**
 * Ativa a versão nova e recarrega. O `true` é o que o plugin espera para
 * recarregar a página depois de trocar o service worker.
 *
 * Nunca levanta: se a troca falhar (rede caiu no meio), o operador continua na
 * versão que está funcionando, que é melhor do que uma tela branca.
 */
export async function aplicarNovaVersao() {
  if (!aplicar) return { error: "nenhuma versão nova esperando" };
  try {
    await aplicar(true);
    return { error: null };
  } catch (erro) {
    return { error: erro?.message ?? "não deu para atualizar agora" };
  }
}

/** Só para teste: esquece o que foi anunciado. */
export function esquecerNovaVersao() {
  aplicar = null;
  ouvintes.clear();
}
