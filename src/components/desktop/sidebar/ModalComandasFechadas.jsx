import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { normalizarPagamentos, totalTroco, rotuloMetodo } from "@/utils/pagamentos";
import {
  LuReceipt, LuX, LuUser, LuArrowLeft, LuTrash2
} from "react-icons/lu";
import "./ModalComandasFechadas.css";

// Janela das comandas fechadas do caixa atual.
export default function ModalComandasFechadas({ tela }) {
  const {
    setShowFechadas, fechadaDetalhe, setFechadaDetalhe, customLabels, fechadas, abrirCancelamento,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => { setShowFechadas(false); setFechadaDetalhe(null); })}
          className="fechadas-modal"
        >
          <div className={`fechadas-modal__caixa${fechadaDetalhe ? " fechadas-modal__caixa--detalhe" : ""}`}>
            {/* Header */}
            <div className="fechadas-modal__topo">
              {fechadaDetalhe && (
                <button
                  onClick={() => setFechadaDetalhe(null)}
                  className="sidebar__modal-btn fechadas-modal__voltar"
                >
                  <LuArrowLeft size={14} /> Voltar
                </button>
              )}
              <div className="fechadas-modal__cabecalho">
                <div className="sidebar__modal-titulo fechadas-modal__titulo">
                  {fechadaDetalhe
                    ? (/^\d+$/.test(String(fechadaDetalhe.comanda ?? "").trim()) ? `Comanda ${fechadaDetalhe.comanda}` : fechadaDetalhe.comanda)
                    : "Comandas Fechadas"}
                </div>
                <div className="sidebar__modal-subtitulo fechadas-modal__subtitulo">
                  {fechadaDetalhe
                    ? new Date(fechadaDetalhe.at).toLocaleString("pt-BR")
                    : `${fechadas.length} comanda${fechadas.length !== 1 ? "s" : ""} encerrada${fechadas.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                onClick={() => { setShowFechadas(false); setFechadaDetalhe(null); }}
                className="fechadas-modal__fechar"
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="fechadas-modal__corpo">
              {fechadaDetalhe ? (
                <div className="fechadas-modal__detalhe">
                  <div className="fechadas-modal__resumo">
                    {fechadaDetalhe.cashier && (
                      <div className="sidebar__cashier-info fechadas-modal__info">
                        <LuUser size={13} /> {fechadaDetalhe.cashier}
                      </div>
                    )}
                    {normalizarPagamentos(fechadaDetalhe).map((p, i) => p.metodo ? (
                      // TD015: pagamentos de uma venda já fechada, só leitura, e o método repete num split.
                      <div key={i} className="sidebar__cashier-info fechadas-modal__info">
                        <LuReceipt size={13} />
                        Pagamento: <strong className="fechadas-modal__destaque">
                          {rotuloMetodo(p.metodo, customLabels)}
                        </strong>
                      </div>
                    ) : null)}
                    {totalTroco(fechadaDetalhe) > 0 && (
                      <div className="sidebar__cashier-info fechadas-modal__info-texto">
                        Troco: <strong className="fechadas-modal__destaque">R$ {Number(totalTroco(fechadaDetalhe)).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>

                  <div className="fechadas-modal__itens">
                    <div className="sidebar__form-label fechadas-modal__itens-titulo">
                      Itens consumidos
                    </div>
                    {(Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).length === 0 ? (
                      <div className="sidebar__vazio fechadas-modal__vazio">Nenhum item registrado.</div>
                    ) : (
                      (Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).map((it, idx) => {
                        const obsArr = Array.isArray(it.obs) ? it.obs : (it.obs ? [it.obs] : []);
                        return (
                          <div key={it.uid ?? idx} className="fechadas-modal__item">
                            <div className="fechadas-modal__item-linha">
                              <span className="sidebar__item-nome fechadas-modal__item-nome">
                                {it.name}
                                {it.qty > 1 && <span className="fechadas-modal__item-qtd"> × {it.qty}</span>}
                              </span>
                              <span className="sidebar__item-preco fechadas-modal__item-preco">
                                R$ {(it.price * (it.qty ?? 1)).toFixed(2)}
                              </span>
                            </div>
                            {obsArr.map((obs, j) => (
                              <div key={j} className="sidebar__item-obs fechadas-modal__item-obs">↳ {obs}</div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="fechadas-modal__total">
                    <span className="sidebar__total-label fechadas-modal__total-rotulo">Total</span>
                    <span className="sidebar__total-valor fechadas-modal__total-valor">R$ {Number(fechadaDetalhe.total ?? 0).toFixed(2)}</span>
                  </div>

                  {/* Leva 15.3 — cancelar venda fechada (ação destrutiva: motivo + senha) */}
                  <button
                    onClick={abrirCancelamento}
                    className="sidebar__modal-btn fechadas-modal__cancelar"
                  >
                    <LuTrash2 size={16} /> Cancelar venda
                  </button>
                </div>
              ) : (
                <div className="fechadas-modal__lista">
                  {[...fechadas].sort((a, b) => new Date(b.at) - new Date(a.at)).map(o => {
                    const items    = Array.isArray(o.items) ? o.items : [];
                    const qtdTotal = items.reduce((s, i) => s + (i.qty || 1), 0);
                    const nome     = /^\d+$/.test(String(o.comanda ?? "").trim()) ? `Comanda ${o.comanda}` : o.comanda;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setFechadaDetalhe(o)}
                        className="fechadas-modal__venda"
                      >
                        <div className="fechadas-modal__venda-icone">
                          <LuReceipt size={18} />
                        </div>
                        <div className="fechadas-modal__venda-corpo">
                          <div className="sidebar__fechada-nome fechadas-modal__venda-nome">{nome || `#${String(o.id).slice(-6).toUpperCase()}`}</div>
                          <div className="sidebar__fechada-meta fechadas-modal__venda-meta">
                            {o.cashier && <><LuUser size={11} className="fechadas-modal__venda-usuario" />{o.cashier} · </>}
                            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {new Date(o.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="sidebar__fechada-valor fechadas-modal__venda-valor">
                          R$ {Number(o.total ?? 0).toFixed(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
  );
}
