import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { normalizarPagamentos, totalTroco, rotuloMetodo } from "@/utils/pagamentos";
import {
  LuReceipt, LuX, LuUser, LuArrowLeft, LuTrash2
} from "react-icons/lu";

// Janela das comandas fechadas do caixa atual.
export default function ModalComandasFechadas({ tela }) {
  const {
    setShowFechadas, fechadaDetalhe, setFechadaDetalhe, customLabels, fechadas, abrirCancelamento,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => { setShowFechadas(false); setFechadaDetalhe(null); })}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20,
            width: "100%", maxWidth: fechadaDetalhe ? 480 : 560,
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid var(${C.border})`,
              display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            }}>
              {fechadaDetalhe && (
                <button
                  onClick={() => setFechadaDetalhe(null)}
                  className="sidebar__modal-btn"
                  style={{
                    background: varColor(C.surface), border: `1px solid var(${C.border})`,
                    borderRadius: 8, color: varColor(C.text), cursor: "pointer",
                    padding: "6px 12px", fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <LuArrowLeft size={14} /> Voltar
                </button>
              )}
              <div style={{ flex: 1 }}>
                <div className="sidebar__modal-titulo" style={{ fontWeight: 900 }}>
                  {fechadaDetalhe
                    ? (/^\d+$/.test(String(fechadaDetalhe.comanda ?? "").trim()) ? `Comanda ${fechadaDetalhe.comanda}` : fechadaDetalhe.comanda)
                    : "Comandas Fechadas"}
                </div>
                <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  {fechadaDetalhe
                    ? new Date(fechadaDetalhe.at).toLocaleString("pt-BR")
                    : `${fechadas.length} comanda${fechadas.length !== 1 ? "s" : ""} encerrada${fechadas.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                onClick={() => { setShowFechadas(false); setFechadaDetalhe(null); }}
                style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {fechadaDetalhe ? (
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: varColor(C.surface), borderRadius: 12, padding: "14px 16px", border: `1px solid var(${C.border})`, display: "flex", flexDirection: "column", gap: 8 }}>
                    {fechadaDetalhe.cashier && (
                      <div className="sidebar__cashier-info" style={{ display: "flex", alignItems: "center", gap: 6, color: varColor(C.muted) }}>
                        <LuUser size={13} /> {fechadaDetalhe.cashier}
                      </div>
                    )}
                    {normalizarPagamentos(fechadaDetalhe).map((p, i) => p.metodo ? (
                      // TD015: pagamentos de uma venda já fechada, só leitura, e o método repete num split.
                      <div key={i} className="sidebar__cashier-info" style={{ display: "flex", alignItems: "center", gap: 6, color: varColor(C.muted) }}>
                        <LuReceipt size={13} />
                        Pagamento: <strong style={{ color: varColor(C.text) }}>
                          {rotuloMetodo(p.metodo, customLabels)}
                        </strong>
                      </div>
                    ) : null)}
                    {totalTroco(fechadaDetalhe) > 0 && (
                      <div className="sidebar__cashier-info" style={{ color: varColor(C.muted) }}>
                        Troco: <strong style={{ color: varColor(C.text) }}>R$ {Number(totalTroco(fechadaDetalhe)).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ background: varColor(C.surface), borderRadius: 12, border: `1px solid var(${C.border})`, overflow: "hidden" }}>
                    <div className="sidebar__form-label" style={{ padding: "10px 16px", borderBottom: `1px solid var(${C.border})`, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
                      Itens consumidos
                    </div>
                    {(Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).length === 0 ? (
                      <div className="sidebar__vazio" style={{ padding: 16, color: varColor(C.muted) }}>Nenhum item registrado.</div>
                    ) : (
                      (Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).map((it, idx, arr) => {
                        const obsArr = Array.isArray(it.obs) ? it.obs : (it.obs ? [it.obs] : []);
                        return (
                          <div key={it.uid ?? idx} style={{ padding: "10px 16px", borderBottom: idx < arr.length - 1 ? `1px solid var(${C.border})` : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="sidebar__item-nome" style={{ fontWeight: 600 }}>
                                {it.emoji && <span style={{ marginRight: 6 }}>{it.emoji}</span>}
                                {it.name}
                                {it.qty > 1 && <span style={{ color: varColor(C.muted), fontWeight: 500 }}> × {it.qty}</span>}
                              </span>
                              <span className="sidebar__item-preco" style={{ fontWeight: 700, color: varColor(C.green) }}>
                                R$ {(it.price * (it.qty ?? 1)).toFixed(2)}
                              </span>
                            </div>
                            {obsArr.map((obs, j) => (
                              <div key={j} className="sidebar__item-obs" style={{ color: varColor(C.accent), marginTop: 3 }}>↳ {obs}</div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 12, background: `${alfa(C.green, "10")}`, border: `1px solid ${alfa(C.green, "33")}` }}>
                    <span className="sidebar__total-label" style={{ fontWeight: 700 }}>Total</span>
                    <span className="sidebar__total-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>R$ {Number(fechadaDetalhe.total ?? 0).toFixed(2)}</span>
                  </div>

                  {/* Leva 15.3 — cancelar venda fechada (ação destrutiva: motivo + senha) */}
                  <button
                    onClick={abrirCancelamento}
                    className="sidebar__modal-btn"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                      background: alfa(varColor(C.red), "10"), border: `1.5px solid ${alfa(varColor(C.red), "55")}`,
                      color: varColor(C.red), fontWeight: 700,
                    }}
                  >
                    <LuTrash2 size={16} /> Cancelar venda
                  </button>
                </div>
              ) : (
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...fechadas].sort((a, b) => new Date(b.at) - new Date(a.at)).map(o => {
                    const items    = Array.isArray(o.items) ? o.items : [];
                    const qtdTotal = items.reduce((s, i) => s + (i.qty || 1), 0);
                    const nome     = /^\d+$/.test(String(o.comanda ?? "").trim()) ? `Comanda ${o.comanda}` : o.comanda;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setFechadaDetalhe(o)}
                        style={{
                          background: varColor(C.surface), border: `1px solid var(${C.border})`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", textAlign: "left", color: varColor(C.text),
                          display: "flex", alignItems: "center", gap: 12,
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(C.accent, "66"); e.currentTarget.style.background = varColor(C.alow); }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.background = varColor(C.surface); }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: varColor(C.card), border: `1px solid var(${C.border})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LuReceipt size={18} color={varColor(C.muted)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="sidebar__fechada-nome" style={{ fontWeight: 700 }}>{nome || `#${String(o.id).slice(-6).toUpperCase()}`}</div>
                          <div className="sidebar__fechada-meta" style={{ color: varColor(C.muted), marginTop: 2 }}>
                            {o.cashier && <><LuUser size={11} style={{ marginRight: 3 }} />{o.cashier} · </>}
                            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {new Date(o.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="sidebar__fechada-valor" style={{ fontWeight: 800, color: varColor(C.green), flexShrink: 0 }}>
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
