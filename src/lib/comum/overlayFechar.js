// ──────────────────────────────────────────────────────────────────
// Fechar modal ao clicar no fundo — sem fechar por engano.
//
// Problema: usar só `onClick` no overlay fecha o modal mesmo quando o
// usuário ARRASTA pra selecionar um texto de dentro do modal e solta o
// mouse fora dele. O navegador dispara o "click" no ancestral comum do
// mousedown e do mouseup (o overlay), e o modal fecha sem querer.
//
// Solução: só fechar quando o clique COMEÇA (mousedown) e TERMINA (click)
// no próprio fundo. Se a seleção começou dentro do modal, o mousedown não
// foi no fundo → não fecha. Um clique de verdade no fundo, sim, fecha.
//
// Uso:
//   <div {...fecharAoClicarFora(onClose)}> … </div>
//   <div {...fecharAoClicarFora(() => setAberto(false), !salvando)}> … </div>
//
// A interação de mouse é serial (só um modal por vez), então um sinalizador
// de módulo é suficiente e evita estado por componente.
// ──────────────────────────────────────────────────────────────────

let baixouNoFundo = false;

/**
 * Handlers (onMouseDown + onClick) para o overlay de um modal. Só chama
 * `onClose` quando o mousedown E o click aconteceram no próprio fundo
 * (`e.target === e.currentTarget`) e `podeFechar` é verdadeiro.
 *
 * @param {(e?: any) => void} onClose  o que fazer ao fechar
 * @param {boolean} [podeFechar=true]  guarda opcional (ex.: !salvando)
 * @returns {{ onMouseDown: (e:any)=>void, onClick: (e:any)=>void }}
 */
export function fecharAoClicarFora(onClose, podeFechar = true) {
  return {
    onMouseDown: (e) => {
      baixouNoFundo = e.target === e.currentTarget;
    },
    onClick: (e) => {
      const noFundo = e.target === e.currentTarget && baixouNoFundo;
      baixouNoFundo = false;
      if (noFundo && podeFechar && typeof onClose === "function") onClose(e);
    },
  };
}
