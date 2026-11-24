import { fecharAoClicarFora } from "@/lib/overlayFechar";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuX, LuMinus, LuPlus, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import { createPortal } from "react-dom";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.

// Janela de remover um item na finalização.
export default function PopupRemocao({ tela }) {
  const {
    remocao, setRemocao, remSenha, setRemSenha, remSenhaErro, setRemSenhaErro, remSenhaVis,
    setRemSenhaVis, remErro, removendo, sz, confirmarRemocao,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setRemocao(null), !removendo)}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal" style={{
            background: varColor(C.card), border: `1px solid var(${C.border})`,
          }}>
            <div className="checkout-view__modal-header" style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})` }}>
              <div>
                <div className="checkout-view__modal-titulo" style={{ fontWeight: 800, color: varColor(C.red) }}>Remover produto</div>
                <div className="checkout-view__modal-subtitulo" style={{ fontWeight: 700, color: varColor(C.muted), marginTop: 4 }}>
                  {remocao.item.name} · R$ {Number(remocao.item.price).toFixed(2)}
                </div>
              </div>
              <button onClick={() => { if (!removendo) setRemocao(null); }} className="checkout-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Quantidade (só quando há mais de 1) */}
              {remocao.qtyMax > 1 && (
                <div>
                  <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Quantidade a remover
                  </div>
                  <div className="checkout-view__remocao-stepper">
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.max(1, r.qtySel - 1) }))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.surface), color: varColor(C.text),
                        cursor: remocao.qtySel <= 1 ? "not-allowed" : "pointer",
                        opacity: remocao.qtySel <= 1 ? 0.4 : 1,
                      }}
                    ><LuMinus size={16} /></button>
                    <input
                      type="number" min="1" max={remocao.qtyMax}
                      value={remocao.qtySel}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, Math.max(1, isNaN(v) ? 1 : v)) }));
                      }}
                      className="checkout-view__remocao-qty-input"
                      style={{ border: `1.5px solid var(--gm-input-border)`, background: "var(--gm-input-bg)", color: varColor(C.text) }}
                    />
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, r.qtySel + 1) }))}
                      className="checkout-view__stepper-btn"
                      style={{
                        border: `1.5px solid var(${C.border})`,
                        background: varColor(C.surface), color: varColor(C.text),
                        cursor: remocao.qtySel >= remocao.qtyMax ? "not-allowed" : "pointer",
                        opacity: remocao.qtySel >= remocao.qtyMax ? 0.4 : 1,
                      }}
                    ><LuPlus size={16} /></button>
                    <span className="checkout-view__remocao-qty-de" style={{ color: varColor(C.muted) }}>de {remocao.qtyMax}</span>
                  </div>
                  {remocao.qtySel >= remocao.qtyMax && (
                    <div className="checkout-view__remocao-aviso" style={{ color: varColor(C.red), fontWeight: 600, marginTop: 6 }}>
                      Todos os itens serão removidos
                    </div>
                  )}
                </div>
              )}

              {/* Motivo (obrigatório) */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Motivo (obrigatório)
                </div>
                <textarea
                  value={remocao.motivo}
                  onChange={e => setRemocao(r => ({ ...r, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={2}
                  className="checkout-view__remocao-motivo"
                  style={{ border: `1.5px solid var(--gm-input-border)`, background: "var(--gm-input-bg)", color: varColor(C.text) }}
                />
                <div className="checkout-view__remocao-contador" style={{ color: varColor(C.muted), textAlign: "right", marginTop: 2 }}>
                  {remocao.motivo.length}/200
                </div>
              </div>

              {/* Senha de gerente/admin */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                  <LuLock size={13} /> Senha de gerente ou admin
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={remSenhaVis ? "text" : "password"}
                    value={remSenha}
                    onChange={e => { setRemSenha(e.target.value); setRemSenhaErro(""); }}
                    placeholder="Digite a senha"
                    // Ver o comentário do campo de autorização do desconto:
                    // autopreenchimento aqui vira remoção de item autorizada
                    // sem gerente nenhum.
                    name="autorizacao-gerente"
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    className="checkout-view__remocao-senha"
                    style={{
                      border: `1.5px solid ${remSenhaErro ? varColor(C.red) : "var(--gm-input-border)"}`,
                      background: "var(--gm-input-bg)", color: varColor(C.text),
                    }}
                  />
                  <button
                    onClick={() => setRemSenhaVis(v => !v)}
                    className="checkout-view__remocao-senha-olho"
                    style={{ color: varColor(C.muted) }}
                    aria-label={remSenhaVis ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {remSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {remSenhaErro && (
                  <div role="alert" className="checkout-view__remocao-senha-erro" style={{ color: varColor(C.red), fontWeight: 600, marginTop: 6 }}>
                    {remSenhaErro}
                  </div>
                )}
              </div>

              {remErro && (
                <div role="alert" className="checkout-view__remocao-erro-geral" style={{ color: varColor(C.red), fontWeight: 700 }}>
                  {remErro}
                </div>
              )}

              {/* Ações */}
              <div className="checkout-view__modal-acoes" style={{ gap: sz.gap, paddingTop: 2 }}>
                <button
                  onClick={() => setRemocao(null)}
                  disabled={removendo}
                  className="checkout-view__modal-btn-remover"
                  style={{
                    flex: 1, padding: `${sz.gap}px`,
                    border: `1.5px solid var(${C.border})`, background: "none",
                    color: varColor(C.muted),
                    cursor: removendo ? "not-allowed" : "pointer",
                  }}
                >
                  Voltar
                </button>
                <button
                  onClick={confirmarRemocao}
                  disabled={!remocao.motivo.trim() || !remSenha.trim() || removendo}
                  className="checkout-view__modal-btn-aplicar"
                  style={{
                    flex: 2, padding: `${sz.gap}px`,
                    background: remocao.motivo.trim() && remSenha.trim() && !removendo ? varColor(C.red) : varColor(C.faint),
                    cursor: remocao.motivo.trim() && remSenha.trim() && !removendo ? "pointer" : "not-allowed",
                    boxShadow: remocao.motivo.trim() && remSenha.trim() && !removendo ? `0 4px 20px ${alfa(varColor(C.red), "44")}` : "none",
                  }}
                >
                  {removendo
                    ? "Removendo..."
                    : remocao.qtyMax > 1 && remocao.qtySel >= remocao.qtyMax
                    ? "Remover tudo"
                    : remocao.qtyMax > 1
                    ? `Remover ${remocao.qtySel}`
                    : "Remover"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
  );
}
