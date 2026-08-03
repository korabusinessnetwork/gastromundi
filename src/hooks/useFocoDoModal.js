import { useEffect, useRef } from "react";

// O que o teclado consegue alcançar dentro do modal. Sem checagem de
// visibilidade de propósito: no jsdom nenhum elemento tem layout, e os modais
// do Console não escondem campo focável com CSS — quem some, some do DOM.
const FOCAVEIS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const listarFocaveis = (caixa) =>
  Array.from(caixa.querySelectorAll(FOCAVEIS)).filter((el) => !el.disabled);

// O primeiro CAMPO, não o primeiro focável: o primeiro focável é sempre o "X"
// do cabeçalho, e abrir um modal com o dedo em cima de "Fechar" é convite a
// fechar sem querer (CONSOLE-UX 25).
const primeiroCampo = (caixa) =>
  Array.from(caixa.querySelectorAll("input,select,textarea")).find(
    (el) => !el.disabled && el.type !== "hidden"
  ) ?? null;

/**
 * O foco dentro de um modal (CONSOLE-UX 25), em três partes:
 *
 * 1. ao abrir, o foco vai para o primeiro campo — ou para a própria caixa,
 *    quando o modal não tem campo nenhum (histórico, add-ons), para que o Tab
 *    comece de dentro;
 * 2. Tab e Shift+Tab circulam dentro do modal e nunca escapam para a página que
 *    está por baixo do fundo escuro;
 * 3. ao fechar, o foco volta para o elemento que abriu o modal.
 *
 * @returns {import("react").RefObject<HTMLElement>} ref para pôr na caixa do
 *   modal (`div.nem-modal`), que precisa de `tabIndex={-1}` para poder receber
 *   o foco quando não houver campo.
 */
export function useFocoDoModal() {
  const caixa = useRef(null);

  useEffect(() => {
    // Quem estava focado antes é para onde o foco volta no fim — normalmente o
    // botão da linha da tabela que abriu este modal.
    const anterior = document.activeElement;
    if (caixa.current) (primeiroCampo(caixa.current) ?? caixa.current).focus();

    const aoTeclar = (e) => {
      if (e.key !== "Tab" || !caixa.current) return;

      // Recalculado a cada Tab, nunca congelado na montagem: o conteúdo do
      // modal muda embaixo do dono (a confirmação de descarte troca o rodapé,
      // o histórico carrega a lista, o envio desabilita tudo).
      const lista = listarFocaveis(caixa.current);
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }

      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const atual = document.activeElement;

      if (!caixa.current.contains(atual)) {
        e.preventDefault();
        primeiro.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (e.shiftKey && (atual === primeiro || atual === caixa.current)) {
        e.preventDefault();
        ultimo.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      // A linha que abriu o modal pode ter sumido na recarga da lista depois de
      // criar ou renovar — nesse caso não há para onde voltar, e tudo bem.
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  return caixa;
}
