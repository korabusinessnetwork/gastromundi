/**
 * Recuperação de "aba antiga + deploy novo".
 *
 * O app é dividido em pedaços com hash no nome (ApexPage-a1b2c3.js). Quando
 * sai um deploy, os pedaços antigos deixam de existir no servidor. Uma aba que
 * já estava aberta — ou um PWA que abriu com o index.html guardado pelo service
 * worker — continua pedindo os pedaços velhos e recebe 404. No PDV isso vira
 * tela branca no meio do expediente, que é justamente o que não pode acontecer.
 *
 * O Vite avisa esse caso pelo evento `vite:preloadError`. A resposta certa é
 * simples: recarregar a página uma vez, porque o recarregamento busca o
 * index.html novo e, com ele, os pedaços que existem.
 *
 * Trava anti-loop: a tentativa fica carimbada no `sessionStorage`. Se o
 * recarregamento não resolver (deploy realmente quebrado), NÃO tentamos de novo
 * em seguida — o usuário cai no aviso "Algo deu errado / Recarregar", que é
 * honesto, em vez de a página ficar piscando para sempre.
 */

export const CHAVE_ULTIMA_RECUPERACAO = "gm:recuperacao-deploy";

/** Só tenta de novo depois disso — cobre a aba deixada aberta por dias. */
export const JANELA_ANTI_LOOP_MS = 10 * 60 * 1000;

/**
 * Passou tempo suficiente desde a última tentativa para valer outra?
 *
 * @param {string|number|null} ultimaTentativa carimbo salvo (ms), se houver
 * @param {number} agora instante atual em ms
 * @param {number} [janelaMs] espera mínima entre tentativas
 */
export function podeRecarregar(ultimaTentativa, agora, janelaMs = JANELA_ANTI_LOOP_MS) {
  const carimbo = Number(ultimaTentativa);
  // Sem carimbo (ou carimbo ilegível): é a primeira vez, pode recarregar.
  if (!Number.isFinite(carimbo) || carimbo <= 0) return true;
  // Carimbo no futuro significa relógio ajustado para trás. Não dá para medir
  // o intervalo, então o lado seguro é não recarregar — loop é pior que aviso.
  if (agora < carimbo) return false;
  return agora - carimbo > janelaMs;
}

/**
 * Liga a recuperação. Devolve a função que executa o recarregamento (útil para
 * teste e para chamar de outro ponto), e ela responde se recarregou ou não.
 *
 * As dependências entram por parâmetro para o teste não precisar de DOM real.
 */
export function instalarRecuperacaoDeploy({
  janela = globalThis.window,
  armazenamento = globalThis.sessionStorage,
  agora = () => Date.now(),
} = {}) {
  const recuperar = () => {
    let ultima = null;
    // sessionStorage pode estourar em aba anônima/bloqueada: nunca deixar a
    // recuperação derrubar o app por causa do próprio mecanismo de segurança.
    try {
      ultima = armazenamento?.getItem(CHAVE_ULTIMA_RECUPERACAO) ?? null;
    } catch {
      ultima = null;
    }

    if (!podeRecarregar(ultima, agora())) return false;

    try {
      armazenamento?.setItem(CHAVE_ULTIMA_RECUPERACAO, String(agora()));
    } catch {
      // Sem carimbo não há trava anti-loop; ainda assim recarregar uma vez é
      // melhor que deixar o operador olhando para tela branca.
    }

    janela?.location?.reload();
    return true;
  };

  janela?.addEventListener?.("vite:preloadError", (evento) => {
    // O preventDefault só vale quando o recarregamento REALMENTE vai acontecer:
    // ele engole o erro (o Vite deixa de relançar), e engolir sem recarregar
    // deixaria a rota pendurada em silêncio, sem nem o aviso "Algo deu errado".
    // Barrado pela trava anti-loop, o erro segue seu caminho de propósito.
    if (recuperar()) evento?.preventDefault?.();
  });

  return recuperar;
}
