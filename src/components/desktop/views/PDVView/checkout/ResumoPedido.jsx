import { LuTrash2, LuNotebookPen } from "react-icons/lu";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { fmtComanda } from "@/lib/rotuloComanda";

// Resumo do pedido: os itens da comanda e os totais.
export default function ResumoPedido({ tela }) {
  const {
    aplicarTaxa, setAplicarTaxa, taxaServico, ajusteAplicado, setAjusteAplicado, modoRemocao, setModoRemocao, sz, itensVisiveis, subtotal, valorAjuste, total, abrirRemocao, isMob, comanda, onRemoverItem,
  } = tela;
  return (
    <div className={`checkout-view__resumo${isMob ? " checkout-view__resumo--mob" : ""}`} style={{ "--resumo-largura": `${sz.checkoutResumo}px` }}>
      {/* Área scrollável — itens */}
      <div className="checkout-view__resumo-lista">
      <div className="checkout-view__resumo-titulo">
        Resumo · {fmtComanda(comanda?.comanda)}
      </div>

      {itensVisiveis.map((item, i) => {
        const obsArr = Array.isArray(item.obs) ? item.obs : [];
        const qty = item.qty;
        return (
          <div key={item.uid ?? i} className="checkout-view__item">
            <div className="checkout-view__item-icone">
              {item.emoji
                ? <span className="checkout-view__item-emoji">{item.emoji}</span>
                : null}
              <span className={`checkout-view__item-qtd${item.emoji ? " checkout-view__item-qtd--compacta" : ""}`}>×{qty}</span>
            </div>

            <div className="checkout-view__item-corpo">
              <div className="checkout-view__item-nome">
                {item.name}
              </div>
              <div className="checkout-view__item-preco-unit">
                {qty}× R$ {Number(item.price).toFixed(2)}
              </div>
              {obsArr.map((obs, j) => (
                <div key={j} className="checkout-view__item-obs">
                  <LuNotebookPen size={12} className="gm-icone-texto" aria-hidden="true" /> {obs}
                </div>
              ))}
            </div>

            <div className="checkout-view__item-total">
              R$ {(item.price * qty).toFixed(2)}
            </div>

            {modoRemocao && (
              <button
                onClick={() => abrirRemocao(item)}
                className="checkout-view__item-remover"
                aria-label={`Remover ${item.name}`}
              >
                <LuTrash2 size={18} />
              </button>
            )}
          </div>
        );
      })}

      {itensVisiveis.length === 0 && (
        <div className="checkout-view__lista-vazia">
          Todos os itens foram removidos. Volte para a comanda para lançar novos itens.
        </div>
      )}

      {/* Leva 15.1 — botão abaixo do último item da lista */}
      {onRemoverItem && itensVisiveis.length > 0 && (
        <div className="checkout-view__remover-rodape">
          {modoRemocao && (
            <div className="checkout-view__remover-dica">
              Toque na lixeira do item que deseja remover
            </div>
          )}
          <button
            onClick={() => setModoRemocao(v => !v)}
            className={`checkout-view__btn-remover-lista${modoRemocao ? " checkout-view__btn-remover-lista--ativo" : ""}`}
          >
            <LuTrash2 size={15} /> {modoRemocao ? "Concluir remoção" : "Remover produto"}
          </button>
        </div>
      )}
      </div>{/* fim área scrollável */}

      {/* Rodapé fixo — taxa, desconto, total */}
      <div className="checkout-view__resumo-rodape">

      {/* Taxa de Serviço */}
      {taxaServico && (
        <div className="checkout-view__linha-ajuste">
          <div className="checkout-view__linha-ajuste-grupo">
            <span className="checkout-view__taxa-label">Taxa de Serviço (10%)</span>
            <button
              onClick={() => setAplicarTaxa(v => !v)}
              className={`checkout-view__btn-toggle-taxa checkout-view__btn-toggle-taxa--${aplicarTaxa ? "remover" : "aplicar"}`}
            >
              {aplicarTaxa ? "Remover" : "Aplicar"}
            </button>
          </div>
          <span className={`checkout-view__taxa-valor${aplicarTaxa ? "" : " checkout-view__taxa-valor--fora"}`}>
            R$ {(subtotal * 0.10).toFixed(2)}
          </span>
        </div>
      )}

      {/* Desconto / Acréscimo aplicado */}
      {ajusteAplicado && valorAjuste !== 0 && (
        <div className="checkout-view__linha-ajuste">
          <div className="checkout-view__linha-ajuste-grupo">
            <span className={`checkout-view__ajuste-aplicado-label checkout-view__ajuste-tom--${ajusteAplicado.tipo === "desconto" ? "desconto" : "acrescimo"}`}>
              {ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo"}
              {" "}({ajusteAplicado.mode === "percentual" ? `${ajusteAplicado.valor}%` : `R$ ${parseFloat(ajusteAplicado.valor).toFixed(2)}`})
            </span>
            <button
              onClick={() => setAjusteAplicado(null)}
              className="checkout-view__btn-remover-ajuste"
            >
              Remover
            </button>
          </div>
          <span className={`checkout-view__ajuste-aplicado-valor checkout-view__ajuste-tom--${ajusteAplicado.tipo === "desconto" ? "desconto" : "acrescimo"}`}>
            {valorAjuste < 0 ? "-" : "+"}R$ {Math.abs(valorAjuste).toFixed(2)}
          </span>
        </div>
      )}

      {/* Total */}
      <div className="checkout-view__total-linha">
        <span className="checkout-view__total-label">Total</span>
        <span className="checkout-view__total-valor">
          R$ {total.toFixed(2)}
        </span>
      </div>

      </div>{/* fim rodapé fixo */}
    </div>
  );
}
