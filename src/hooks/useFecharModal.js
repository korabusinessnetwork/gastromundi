import { useCallback, useEffect, useRef } from "react";

/**
 * As duas saídas que toda janela flutuante tem e os modais do Console não
 * tinham (CONSOLE-UX 24): a tecla **Esc** e o **clique no fundo escuro**.
 *
 * O gesto não fecha por conta própria: ele chama o MESMO caminho do botão de
 * fechar daquele modal. No cadastro de estabelecimento isso quer dizer cair na
 * confirmação de descarte (rodada 23) — Esc nunca joga trabalho fora.
 *
 * @param {() => void} aoPedirFechar o que o "X" daquele modal faz
 * @param {boolean} bloqueado enquanto o modal está enviando, as duas saídas
 *   ficam mudas — mesma regra dos botões desabilitados durante o envio
 * @returns {{onMouseDown: (e: MouseEvent) => void, onClick: (e: MouseEvent) => void}}
 *   handlers para pôr no elemento do fundo escuro (`.nem-overlay`)
 */
export function useFecharModal(aoPedirFechar, bloqueado = false) {
  // A função de fechar é recriada a cada render do modal. Guardada numa ref,
  // o ouvinte de teclado é assinado UMA vez em vez de sair e voltar a cada
  // tecla digitada num campo do formulário.
  const fechar = useRef(aoPedirFechar);
  fechar.current = aoPedirFechar;

  const travado = useRef(bloqueado);
  travado.current = bloqueado;

  useEffect(() => {
    const aoTeclar = (e) => {
      if (e.key !== "Escape" || travado.current) return;
      fechar.current();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  // Selecionar o texto de um campo e soltar o botão do mouse fora do modal é
  // um clique que TERMINA no fundo — sem esta memória do começo, o arrasto
  // fecharia o modal e o dono perderia o que estava lendo ou digitando.
  const comecouNoFundo = useRef(false);

  const onMouseDown = useCallback((e) => {
    comecouNoFundo.current = e.target === e.currentTarget;
  }, []);

  const onClick = useCallback((e) => {
    const valido = comecouNoFundo.current && e.target === e.currentTarget;
    comecouNoFundo.current = false;
    if (!valido || travado.current) return;
    fechar.current();
  }, []);

  return { onMouseDown, onClick };
}
