import { fecharAoClicarFora } from "@/lib/overlayFechar";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuX, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import { createPortal } from "react-dom";
import { AJUSTE_PERCENTUAL_MAX } from "@/lib/vendas";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.

// Janela de desconto e acréscimo sobre o total.
export default function PopupAjuste({ tela }) {
  const {
    ajusteTipo, setAjusteTipo, ajusteMode, setAjusteMode, ajusteValor, setAjusteValor, ajusteAplicado, setAjusteAplicado, ajusteSenha, setAjusteSenha, ajusteSenhaErro, setAjusteSenhaErro, ajusteSenhaVis, setAjusteSenhaVis, aplicandoAjuste, sz, baseComTaxa, podeAplicarAjuste, ajusteErroVisivel, ajusteExigeAutorizacao, podeConfirmarAjuste, fecharAjuste, aplicarAjuste,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(fecharAjuste, !aplicandoAjuste)}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal" style={{
            background: varColor(C.card), border: `1px solid var(${C.border})`,
          }}>
            {/* Header */}
            <div className="checkout-view__modal-header" style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid var(${C.border})` }}>
              <div>
                <div className="checkout-view__modal-titulo" style={{ fontWeight: 800, color: "#fff" }}>Desconto / Acréscimo</div>
                <div className="checkout-view__modal-subtitulo" style={{ fontWeight: 700, color: varColor(C.muted), marginTop: 4 }}>Total atual: R$ {baseComTaxa.toFixed(2)}</div>
              </div>
              <button onClick={() => { if (!aplicandoAjuste) fecharAjuste(); }} className="checkout-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div style={{ padding: `${sz.padSm}px ${sz.pad}px ${sz.pad}px`, display: "flex", flexDirection: "column", gap: sz.padSm }}>

              {/* Tipo */}
              <div className="checkout-view__modal-tipo-grid" style={{ gap: sz.gap }}>
                {[
                  { id: "desconto",  label: "Desconto",  sub: "Reduz o valor",   color: varColor(C.red)   },
                  { id: "acrescimo", label: "Acréscimo", sub: "Aumenta o valor", color: varColor(C.green) },
                ].map(t => (
                  <button key={t.id} onClick={() => setAjusteTipo(t.id)} className="checkout-view__modal-tipo-card" style={{
                    padding: `${sz.padSm}px 12px`,
                    border: `2px solid ${ajusteTipo === t.id ? t.color : varColor(C.border)}`,
                    background: ajusteTipo === t.id ? alfa(t.color, "18") : varColor(C.surface),
                  }}>
                    <div className="checkout-view__modal-tipo-nome" style={{ fontWeight: 800, color: ajusteTipo === t.id ? t.color : varColor(C.text) }}>{t.label}</div>
                    <div className="checkout-view__modal-tipo-sub" style={{ color: ajusteTipo === t.id ? alfa(t.color, "bb") : varColor(C.muted), marginTop: 4 }}>{t.sub}</div>
                  </button>
                ))}
              </div>

              {/* Modo */}
              <div className="checkout-view__modal-modo" style={{ background: varColor(C.surface), border: `1px solid var(${C.border})` }}>
                {[{ id: "percentual", label: "Percentual (%)" }, { id: "fixo", label: "Valor Fixo (R$)" }].map(m => (
                  <button key={m.id} onClick={() => { setAjusteMode(m.id); setAjusteValor(""); }} className="checkout-view__modal-modo-btn" style={{
                    padding: `${sz.gap}px 8px`,
                    background: ajusteMode === m.id ? varColor(C.card) : "transparent",
                    color: ajusteMode === m.id ? varColor(C.text) : varColor(C.muted),
                    fontWeight: ajusteMode === m.id ? 700 : 500,
                    boxShadow: ajusteMode === m.id ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div>
                <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  {ajusteMode === "percentual" ? "Percentual de " : "Valor de "}{ajusteTipo === "desconto" ? "desconto" : "acréscimo"}
                </div>
                <div className="checkout-view__modal-input-wrap">
                  <span className="checkout-view__modal-input-prefixo" style={{ color: varColor(C.muted) }}>
                    {ajusteMode === "percentual" ? "%" : "R$"}
                  </span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    max={ajusteMode === "percentual" ? String(AJUSTE_PERCENTUAL_MAX) : undefined}
                    step={ajusteMode === "percentual" ? "1" : "0.01"}
                    value={ajusteValor}
                    onChange={e => setAjusteValor(e.target.value)}
                    placeholder="0"
                    onKeyDown={e => { if (e.key === "Enter") aplicarAjuste(); }}
                    className="checkout-view__modal-input"
                    style={{
                      padding: `${sz.padSm}px ${sz.padSm}px ${sz.padSm}px 52px`,
                      border: `2px solid var(--gm-input-border)`, background: "var(--gm-input-bg)", color: varColor(C.text),
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "99")}
                    onBlur={e => e.currentTarget.style.borderColor = "var(--gm-input-border)"}
                  />
                </div>
              </div>

              {/* Motivo de não dar para aplicar — some sozinho ao corrigir */}
              {ajusteErroVisivel && (
                <div className="checkout-view__ajuste-erro" style={{ color: varColor(C.red), fontWeight: 600 }}>
                  {ajusteErroVisivel}
                </div>
              )}

              {/* Preview */}
              {podeAplicarAjuste && (() => {
                const v   = parseFloat(ajusteValor) || 0;
                const val = ajusteMode === "percentual" ? baseComTaxa * (v / 100) : v;
                const novoTotal = Math.max(0, ajusteTipo === "desconto" ? baseComTaxa - val : baseComTaxa + val);
                const cor = ajusteTipo === "desconto" ? varColor(C.red) : varColor(C.green);
                return (
                  <div className="checkout-view__preview" style={{ border: `1.5px solid ${alfa(cor, "55")}`, background: alfa(cor, "0c") }}>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span className="checkout-view__preview-label" style={{ color: varColor(C.muted) }}>Total atual</span>
                      <span className="checkout-view__preview-valor" style={{ fontWeight: 700, color: varColor(C.muted) }}>R$ {baseComTaxa.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ padding: `${sz.gap}px ${sz.padSm}px`, borderBottom: `1px solid ${alfa(cor, "22")}` }}>
                      <span className="checkout-view__preview-label" style={{ color: cor, fontWeight: 600 }}>{ajusteTipo === "desconto" ? "− Desconto" : "+ Acréscimo"}</span>
                      <span className="checkout-view__preview-valor" style={{ fontWeight: 700, color: cor }}>{ajusteTipo === "desconto" ? "−" : "+"}R$ {val.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha" style={{ alignItems: "center", padding: `${sz.padSm}px ${sz.padSm}px` }}>
                      <span className="checkout-view__preview-total-label" style={{ fontWeight: 700, color: varColor(C.text) }}>Novo Total</span>
                      <span className="checkout-view__preview-total-valor" style={{ fontWeight: 900, color: cor }}>R$ {novoTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Senha de gerente — só no desconto. Tirar valor da conta passa
                  pela mesma autorização que remover um item já exigia aqui. */}
              {ajusteExigeAutorizacao && (
                <div>
                  <div className="checkout-view__modal-input-label" style={{ fontWeight: 600, color: varColor(C.muted), marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                    <LuLock size={13} /> Senha de gerente ou admin
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={ajusteSenhaVis ? "text" : "password"}
                      value={ajusteSenha}
                      onChange={e => { setAjusteSenha(e.target.value); setAjusteSenhaErro(""); }}
                      onKeyDown={e => { if (e.key === "Enter") aplicarAjuste(); }}
                      placeholder="Digite a senha"
                      // Autorização de GERENTE, não login de quem está no
                      // terminal. Sem isto o navegador preenchia sozinho a
                      // senha salva do usuário logado e o desconto saía
                      // "autorizado" com um clique — num PDV compartilhado,
                      // qualquer um passa por gerente. `name` genérico +
                      // new-password mantêm o gerenciador de senhas fora.
                      name="autorizacao-gerente"
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      className="checkout-view__ajuste-senha"
                      style={{
                        border: `1.5px solid ${ajusteSenhaErro ? varColor(C.red) : "var(--gm-input-border)"}`,
                        background: "var(--gm-input-bg)", color: varColor(C.text),
                      }}
                    />
                    <button
                      onClick={() => setAjusteSenhaVis(v => !v)}
                      className="checkout-view__ajuste-senha-olho"
                      style={{ color: varColor(C.muted) }}
                      aria-label={ajusteSenhaVis ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {ajusteSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                  {ajusteSenhaErro ? (
                    <div role="alert" className="checkout-view__ajuste-senha-erro" style={{ color: varColor(C.red), fontWeight: 600, marginTop: 6 }}>
                      {ajusteSenhaErro}
                    </div>
                  ) : (
                    <div className="checkout-view__ajuste-senha-dica" style={{ color: varColor(C.muted), marginTop: 6 }}>
                      Todo desconto precisa da autorização de um gerente.
                    </div>
                  )}
                </div>
              )}

              {/* Ações */}
              <div className="checkout-view__modal-acoes" style={{ gap: sz.gap, paddingTop: 2 }}>
                {ajusteAplicado && (
                  <button
                    onClick={() => { setAjusteAplicado(null); fecharAjuste(); }}
                    disabled={aplicandoAjuste}
                    className="checkout-view__modal-btn-remover"
                    style={{
                      flex: 1, padding: `${sz.gap}px`,
                      border: `1.5px solid var(${C.border})`, background: "none",
                      color: varColor(C.muted),
                      cursor: aplicandoAjuste ? "not-allowed" : "pointer",
                    }}
                  >
                    Remover
                  </button>
                )}
                <button
                  onClick={aplicarAjuste}
                  disabled={!podeConfirmarAjuste}
                  className="checkout-view__modal-btn-aplicar"
                  style={{
                    flex: 2, padding: `${sz.gap}px`,
                    background: podeConfirmarAjuste ? varColor(C.accent) : varColor(C.faint),
                    cursor: podeConfirmarAjuste ? "pointer" : "not-allowed",
                    boxShadow: podeConfirmarAjuste ? `0 4px 20px ${alfa(C.accent, "44")}` : "none",
                  }}
                >
                  {aplicandoAjuste ? "Verificando senha..." : "Aplicar"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
  );
}
