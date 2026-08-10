// Timeout de rede para as chamadas ao Supabase.
//
// O defeito que isto conserta: uma requisição que fica PENDURADA (o preflight
// CORS parado, a rede do salão oscilando) não falha nunca — o `await` no PDV
// simplesmente não volta. A tela ficava 30–45 segundos sem responder, sem erro
// e sem indicação nenhuma, e o operador só tinha "parece que travou". Pior: em
// "Lançar Pedido" o pedido chegava ao banco enquanto a tela seguia parada.
//
// Com prazo, a chamada VIRA ERRO — e erro o sistema já sabe tratar: a tela
// mostra a mensagem, o botão destrava e a operação entra na fila offline
// (a mensagem diz "tempo limite", que `isErroDeRede` reconhece como falha de
// rede, então nada é dado como perdido).

/** Prazo padrão. Acima disso a rede não está lenta, está parada. */
export const TIMEOUT_PADRAO_MS = 20000;

/**
 * Upload/download de arquivo (fotos do cardápio) passa por aqui e é
 * legitimamente demorado em conexão ruim — cortar um upload pela metade seria
 * trocar um defeito por outro.
 */
export function ehTransferenciaDeArquivo(url) {
  return /\/storage\/v1\//.test(String(url ?? ""));
}

/**
 * Envolve um `fetch` para que ele desista depois de `ms`.
 *
 * Preserva o `signal` de quem chamou (o supabase-js cancela requisição na
 * troca de sessão): abortar de fora continua abortando, e nesse caso o erro
 * repassado é o original — só o estouro de prazo vira mensagem de tempo
 * limite.
 */
export function criarFetchComTimeout(fetchBase, ms = TIMEOUT_PADRAO_MS) {
  return function fetchComTimeout(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (ehTransferenciaDeArquivo(url)) return fetchBase(input, init);

    const controle = new AbortController();
    const doChamador = init.signal;
    let estourou = false;

    const timer = setTimeout(() => {
      estourou = true;
      controle.abort();
    }, ms);

    if (doChamador) {
      if (doChamador.aborted) controle.abort();
      else doChamador.addEventListener("abort", () => controle.abort(), { once: true });
    }

    return fetchBase(input, { ...init, signal: controle.signal })
      .catch((err) => {
        if (estourou) {
          // Texto reconhecido por isErroDeRede (offline/rede.js): a operação
          // vai para a fila em vez de ser dada como perdida.
          throw new Error(
            "A conexão com o servidor demorou demais (tempo limite). Verifique a internet e tente de novo.",
          );
        }
        throw err;
      })
      .finally(() => clearTimeout(timer));
  };
}
