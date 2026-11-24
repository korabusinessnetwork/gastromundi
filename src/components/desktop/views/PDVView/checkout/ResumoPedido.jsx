import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuTrash2 } from "react-icons/lu";
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
    <div className="checkout-view__resumo" style={{
      width: isMob ? "100%" : sz.checkoutResumo,
      maxHeight: isMob ? "38%" : undefined,
      borderRight: isMob ? "none" : `1px solid var(${C.border})`,
      borderBottom: isMob ? `1px solid var(${C.border})` : "none",
    }}>
      {/* Área scrollável — itens */}
      <div className="checkout-view__resumo-lista" style={{ padding: isMob ? "16px 20px" : "28px 32px" }}>
      <div className="checkout-view__resumo-titulo" style={{ color: varColor(C.muted) }}>
        Resumo · {fmtComanda(comanda?.comanda)}
      </div>

      {itensVisiveis.map((item, i) => {
        const obsArr = Array.isArray(item.obs) ? item.obs : [];
        const qty = item.qty;
        return (
          <div key={item.uid ?? i} className="checkout-view__item" style={{ borderBottom: `1px solid var(${C.border})` }}>
            <div className="checkout-view__item-icone" style={{
              background: "var(--gm-alow)", border: `1.5px solid ${alfa(C.accent, "44")}`,
            }}>
              {item.emoji
                ? <span className="checkout-view__item-emoji">{item.emoji}</span>
                : null}
              <span className={`checkout-view__item-qtd${item.emoji ? " checkout-view__item-qtd--compacta" : ""}`} style={{ color: varColor(C.accent) }}>×{qty}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="checkout-view__item-nome">
                {item.name}
              </div>
              <div className="checkout-view__item-preco-unit" style={{ color: varColor(C.muted), marginTop: 4 }}>
                {qty}× R$ {Number(item.price).toFixed(2)}
              </div>
              {obsArr.map((obs, j) => (
                <div key={j} className="checkout-view__item-obs" style={{
                  color: varColor(C.accent), background: "var(--gm-alow)",
                }}>
                  📝 {obs}
                </div>
              ))}
            </div>

            <div className="checkout-view__item-total" style={{ color: varColor(C.text) }}>
              R$ {(item.price * qty).toFixed(2)}
            </div>

            {modoRemocao && (
              <button
                onClick={() => abrirRemocao(item)}
                className="checkout-view__item-remover"
                style={{
                  background: alfa(varColor(C.red), "14"),
                  border: `1.5px solid ${alfa(varColor(C.red), "55")}`,
                  color: varColor(C.red),
                }}
                aria-label={`Remover ${item.name}`}
              >
                <LuTrash2 size={18} />
              </button>
            )}
          </div>
        );
      })}

      {itensVisiveis.length === 0 && (
        <div className="checkout-view__lista-vazia" style={{ color: varColor(C.muted) }}>
          Todos os itens foram removidos. Volte para a comanda para lançar novos itens.
        </div>
      )}

      {/* Leva 15.1 — botão abaixo do último item da lista */}
      {onRemoverItem && itensVisiveis.length > 0 && (
        <div className="checkout-view__remover-rodape">
          {modoRemocao && (
            <div className="checkout-view__remover-dica" style={{ color: varColor(C.muted) }}>
              Toque na lixeira do item que deseja remover
            </div>
          )}
          <button
            onClick={() => setModoRemocao(v => !v)}
            className="checkout-view__btn-remover-lista"
            style={{
              background: modoRemocao ? alfa(varColor(C.red), "18") : "transparent",
              border: `1.5px dashed ${modoRemocao ? alfa(varColor(C.red), "66") : varColor(C.border)}`,
              color: modoRemocao ? varColor(C.red) : varColor(C.muted),
            }}
          >
            <LuTrash2 size={15} /> {modoRemocao ? "Concluir remoção" : "Remover produto"}
          </button>
        </div>
      )}
      </div>{/* fim área scrollável */}

      {/* Rodapé fixo — taxa, desconto, total */}
      <div className="checkout-view__resumo-rodape" style={{ padding: isMob ? "12px 20px 16px" : "16px 32px 24px", borderTop: `1px solid var(${C.border})` }}>

      {/* Taxa de Serviço */}
      {taxaServico && (
        <div className="checkout-view__linha-ajuste">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="checkout-view__taxa-label" style={{ color: varColor(C.muted), fontWeight: 600 }}>Taxa de Serviço (10%)</span>
            <button
              onClick={() => setAplicarTaxa(v => !v)}
              className="checkout-view__btn-toggle-taxa"
              style={{
                fontWeight: 700, padding: "3px 10px",
                borderRadius: 8, border: `1.5px solid ${aplicarTaxa ? alfa(C.red, "88") : alfa(C.green, "88")}`,
                background: aplicarTaxa ? alfa(C.red, "15") : alfa(C.green, "15"),
                color: aplicarTaxa ? varColor(C.red) : varColor(C.green),
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {aplicarTaxa ? "Remover" : "Aplicar"}
            </button>
          </div>
          <span className="checkout-view__taxa-valor" style={{ fontWeight: 700, color: aplicarTaxa ? varColor(C.text) : varColor(C.muted), textDecoration: aplicarTaxa ? "none" : "line-through" }}>
            R$ {(subtotal * 0.10).toFixed(2)}
          </span>
        </div>
      )}

      {/* Desconto / Acréscimo aplicado */}
      {ajusteAplicado && valorAjuste !== 0 && (
        <div className="checkout-view__linha-ajuste">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="checkout-view__ajuste-aplicado-label" style={{ color: ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green) }}>
              {ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo"}
              {" "}({ajusteAplicado.mode === "percentual" ? `${ajusteAplicado.valor}%` : `R$ ${parseFloat(ajusteAplicado.valor).toFixed(2)}`})
            </span>
            <button
              onClick={() => setAjusteAplicado(null)}
              className="checkout-view__btn-remover-ajuste"
              style={{
                fontWeight: 700, padding: "2px 8px",
                borderRadius: 6, border: `1px solid var(${C.border})`,
                background: "transparent", color: varColor(C.muted),
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Remover
            </button>
          </div>
          <span className="checkout-view__ajuste-aplicado-valor" style={{ fontWeight: 700, color: ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green) }}>
            {valorAjuste < 0 ? "-" : "+"}R$ {Math.abs(valorAjuste).toFixed(2)}
          </span>
        </div>
      )}

      {/* Total */}
      <div className="checkout-view__total-linha" style={{ borderTop: `2px solid var(${C.border})` }}>
        <span className="checkout-view__total-label" style={{ fontWeight: 800, color: varColor(C.muted) }}>Total</span>
        <span className="checkout-view__total-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>
          R$ {total.toFixed(2)}
        </span>
      </div>

      </div>{/* fim rodapé fixo */}
    </div>
  );
}
