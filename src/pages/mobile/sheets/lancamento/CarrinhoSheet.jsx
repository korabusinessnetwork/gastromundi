/**
 * CarrinhoSheet — bottom sheet do carrinho atual, no fluxo de lançamento
 * do /palm (garçom). Mostra os itens já adicionados antes de lançar na
 * comanda. Puramente apresentacional: todo estado e toda regra (o que
 * "lançar" significa, o que fazer quando a quantidade zera) vêm do shell
 * via props — este componente só desenha e dispara callbacks.
 *
 * Intuitividade (princípio nº 1): o preço de cada item some, o total geral
 * some, e o botão principal já mostra a ação e o valor — nada aqui exige
 * cálculo mental do garçom. Reduzir a quantidade até 0 vira uma lixeira
 * (não "−0"), deixando óbvio que o próximo toque remove o item.
 */
import { useRef, useState } from "react";
import {
  LuCheck,
  LuMinus,
  LuPlus,
  LuShoppingCart,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import "./lancamento.css";

/** Distância de arraste (px) a partir da qual soltar fecha a sheet. */
const LIMIAR_FECHAR_PX = 90;

export default function CarrinhoSheet({
  aberto,
  itens,
  onFechar,
  onQtd,
  onLimpar,
  onLancar,
  total,
  podeConfirmar,
  textoConfirmar,
}) {
  const listaItens = itens || [];
  const vazio = listaItens.length === 0;

  const painelRef = useRef(null);
  const arrasteRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);

  function aoIniciarArraste(e) {
    arrasteRef.current = { inicioY: e.clientY, deltaY: 0 };
    setArrastando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function aoMoverArraste(e) {
    if (!arrasteRef.current) return;
    const deltaY = Math.max(0, e.clientY - arrasteRef.current.inicioY);
    arrasteRef.current.deltaY = deltaY;
    if (painelRef.current) {
      painelRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }

  function aoSoltarArraste() {
    const delta = arrasteRef.current?.deltaY || 0;
    arrasteRef.current = null;
    setArrastando(false);
    if (painelRef.current) {
      painelRef.current.style.transform = "";
    }
    if (delta > LIMIAR_FECHAR_PX) {
      onFechar();
    }
  }

  return (
    <div
      className={
        aberto ? "carrinho-sheet carrinho-sheet--aberto" : "carrinho-sheet"
      }
      aria-hidden={!aberto}
    >
      <button
        type="button"
        className="carrinho-sheet__backdrop"
        onClick={onFechar}
        tabIndex={aberto ? 0 : -1}
        aria-label="Fechar carrinho"
      />

      <div
        ref={painelRef}
        className="carrinho-sheet__painel"
        role="dialog"
        aria-modal="true"
        aria-label="Carrinho"
        style={arrastando ? { transition: "none" } : undefined}
      >
        <div
          className="carrinho-sheet__puxador-alvo"
          onPointerDown={aoIniciarArraste}
          onPointerMove={aoMoverArraste}
          onPointerUp={aoSoltarArraste}
          onPointerCancel={aoSoltarArraste}
        >
          <span className="carrinho-sheet__puxador" aria-hidden="true" />
        </div>

        <header className="carrinho-sheet__cabecalho">
          <div className="carrinho-sheet__titulo-linha">
            <h2 className="carrinho-sheet__titulo">Seu pedido</h2>
            <span className="carrinho-sheet__contagem">
              {listaItens.length}{" "}
              {listaItens.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <button
            type="button"
            className="carrinho-sheet__fechar"
            onClick={onFechar}
            tabIndex={aberto ? 0 : -1}
            aria-label="Fechar"
          >
            <LuX aria-hidden="true" />
          </button>
        </header>

        <div className="carrinho-sheet__corpo">
          {vazio ? (
            <div className="carrinho-sheet__vazio">
              <LuShoppingCart
                className="carrinho-sheet__vazio-icone"
                aria-hidden="true"
              />
              <p className="carrinho-sheet__vazio-titulo">Carrinho vazio</p>
              <p className="carrinho-sheet__vazio-dica">
                Toque nos itens do cardápio para adicionar.
              </p>
            </div>
          ) : (
            <ul className="carrinho-sheet__lista">
              {listaItens.map((item, index) => {
                const ehRemover = item.qty <= 1;
                return (
                  <li className="carrinho-sheet__item" key={item._key}>
                    <div className="carrinho-sheet__item-info">
                      <span className="carrinho-sheet__item-nome">
                        {item.emoji ? (
                          <span
                            className="carrinho-sheet__item-emoji"
                            aria-hidden="true"
                          >
                            {item.emoji}
                          </span>
                        ) : null}
                        {item.name}
                      </span>
                      <span className="carrinho-sheet__item-preco">
                        {fmtDinheiro(item.price)} cada
                      </span>
                    </div>

                    <div className="carrinho-sheet__item-controles">
                      <div className="carrinho-sheet__stepper">
                        <button
                          type="button"
                          className={
                            ehRemover
                              ? "carrinho-sheet__stepper-botao carrinho-sheet__stepper-botao--remover"
                              : "carrinho-sheet__stepper-botao carrinho-sheet__stepper-botao--menos"
                          }
                          onClick={() => onQtd(index, item.qty - 1)}
                          aria-label={
                            ehRemover
                              ? `Remover ${item.name}`
                              : `Diminuir quantidade de ${item.name}`
                          }
                        >
                          {ehRemover ? (
                            <LuTrash2 aria-hidden="true" />
                          ) : (
                            <LuMinus aria-hidden="true" />
                          )}
                        </button>
                        <span
                          className="carrinho-sheet__stepper-valor"
                          aria-live="polite"
                        >
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          className="carrinho-sheet__stepper-botao carrinho-sheet__stepper-botao--mais"
                          onClick={() => onQtd(index, item.qty + 1)}
                          aria-label={`Aumentar quantidade de ${item.name}`}
                        >
                          <LuPlus aria-hidden="true" />
                        </button>
                      </div>
                      <span className="carrinho-sheet__item-total">
                        {fmtDinheiro(item.price * item.qty)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="carrinho-sheet__rodape">
          {vazio ? null : (
            <button
              type="button"
              className="carrinho-sheet__limpar"
              onClick={onLimpar}
            >
              Limpar carrinho
            </button>
          )}

          <div className="carrinho-sheet__total-linha">
            <span className="carrinho-sheet__total-rotulo">Total</span>
            <span className="carrinho-sheet__total-valor">
              {fmtDinheiro(total)}
            </span>
          </div>

          <button
            type="button"
            className="carrinho-sheet__cta"
            onClick={onLancar}
            disabled={!podeConfirmar}
          >
            <LuCheck aria-hidden="true" />
            <span>{textoConfirmar}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
