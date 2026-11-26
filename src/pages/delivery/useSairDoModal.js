// ──────────────────────────────────────────────────────────────────
// Como se sai de um modal da vitrine: tocando fora dele, ou apertando
// Esc. As duas saídas juntas num hook só porque são a mesma pergunta —
// "o cliente quis sair daqui?" — e responder metade dela em cada tela é
// como uma delas passou a mentir.
//
// O defeito que isto conserta: os modais fechavam no `onClick` do fundo,
// confiando num `stopPropagation` no painel. Só que o navegador dispara
// `click` no ANCESTRAL COMUM entre onde o mouse desceu e onde ele subiu.
// Quem apertava o botão dentro do campo de endereço e arrastava para
// selecionar o que digitou — soltando o mouse um pixel fora do painel —
// fazia o alvo do clique virar o próprio fundo. O painel nem via o evento
// para poder detê-lo, e a tela de entrega inteira se fechava, levando
// junto o que a pessoa tinha acabado de escrever.
//
// A regra certa é: só fecha quando o gesto COMEÇOU e TERMINOU no fundo.
// Um arrasto que nasceu dentro do painel é do painel, não importa onde
// termine. Vale para o mouse e para o dedo — no celular, arrastar para
// rolar a lista sofria do mesmo problema.
// ──────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef } from "react";

/**
 * @param {() => void} aoSair - o que fazer quando o cliente quiser sair
 * @returns {{onMouseDown: Function, onClick: Function}} props do elemento de fundo
 */
export function useSairDoModal(aoSair) {
  // Onde o gesto começou. `useRef` e não estado: isto muda a cada
  // mousedown e não pinta nada na tela — re-renderizar o modal a cada
  // toque seria trabalho à toa.
  const comecouNoFundo = useRef(false);

  const onMouseDown = useCallback((e) => {
    comecouNoFundo.current = e.target === e.currentTarget;
  }, []);

  const onClick = useCallback(
    (e) => {
      // As duas condições juntas. Só a primeira deixaria passar o arrasto
      // que termina fora; só a segunda é o defeito de origem.
      if (e.target === e.currentTarget && comecouNoFundo.current) aoSair?.();
      comecouNoFundo.current = false;
    },
    [aoSair],
  );

  // Esc fecha. Sem isso, quem está no computador só saía com o mouse — e a
  // vitrine é a única tela do produto que um desconhecido usa: ela não pode
  // exigir que a pessoa descubra onde fica o × para sair de uma folha que
  // abriu por engano.
  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key === "Escape") aoSair?.();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoSair]);

  return { onMouseDown, onClick };
}
