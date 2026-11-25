import { fecharAoClicarFora } from "@/lib/overlayFechar";
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
          <div className="checkout-view__modal ajuste" style={{
            "--ajuste-pad": `${sz.pad}px`, "--ajuste-pad-sm": `${sz.padSm}px`, "--ajuste-gap": `${sz.gap}px`,
          }}>
            {/* Header */}
            <div className="checkout-view__modal-header ajuste__topo">
              <div>
                <div className="checkout-view__modal-titulo ajuste__titulo">Desconto / Acréscimo</div>
                <div className="checkout-view__modal-subtitulo ajuste__subtitulo">Total atual: R$ {baseComTaxa.toFixed(2)}</div>
              </div>
              <button onClick={() => { if (!aplicandoAjuste) fecharAjuste(); }} className="checkout-view__modal-fechar ajuste__fechar">
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div className="ajuste__corpo">

              {/* Tipo */}
              <div className="checkout-view__modal-tipo-grid ajuste__tipos">
                {[
                  { id: "desconto",  label: "Desconto",  sub: "Reduz o valor"   },
                  { id: "acrescimo", label: "Acréscimo", sub: "Aumenta o valor" },
                ].map(t => (
                  <button key={t.id} onClick={() => setAjusteTipo(t.id)} className={`checkout-view__modal-tipo-card ajuste__tipo ajuste--${t.id}${ajusteTipo === t.id ? " ajuste__tipo--ativo" : ""}`}>
                    <div className="checkout-view__modal-tipo-nome ajuste__tipo-nome">{t.label}</div>
                    <div className="checkout-view__modal-tipo-sub ajuste__tipo-sub">{t.sub}</div>
                  </button>
                ))}
              </div>

              {/* Modo */}
              <div className="checkout-view__modal-modo ajuste__modos">
                {[{ id: "percentual", label: "Percentual (%)" }, { id: "fixo", label: "Valor Fixo (R$)" }].map(m => (
                  <button key={m.id} onClick={() => { setAjusteMode(m.id); setAjusteValor(""); }} className={`checkout-view__modal-modo-btn ajuste__modo${ajusteMode === m.id ? " ajuste__modo--ativo" : ""}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div>
                <div className="checkout-view__modal-input-label ajuste__rotulo">
                  {ajusteMode === "percentual" ? "Percentual de " : "Valor de "}{ajusteTipo === "desconto" ? "desconto" : "acréscimo"}
                </div>
                <div className="checkout-view__modal-input-wrap">
                  <span className="checkout-view__modal-input-prefixo ajuste__prefixo">
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
                    className="checkout-view__modal-input ajuste__valor"
                  />
                </div>
              </div>

              {/* Motivo de não dar para aplicar — some sozinho ao corrigir */}
              {ajusteErroVisivel && (
                <div className="checkout-view__ajuste-erro ajuste__erro">
                  {ajusteErroVisivel}
                </div>
              )}

              {/* Preview */}
              {podeAplicarAjuste && (() => {
                const v   = parseFloat(ajusteValor) || 0;
                const val = ajusteMode === "percentual" ? baseComTaxa * (v / 100) : v;
                const novoTotal = Math.max(0, ajusteTipo === "desconto" ? baseComTaxa - val : baseComTaxa + val);
                return (
                  <div className={`checkout-view__preview ajuste__previa ajuste--${ajusteTipo}`}>
                    <div className="checkout-view__preview-linha ajuste__previa-linha">
                      <span className="checkout-view__preview-label ajuste__apagado">Total atual</span>
                      <span className="checkout-view__preview-valor ajuste__previa-valor ajuste__apagado">R$ {baseComTaxa.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha ajuste__previa-linha">
                      <span className="checkout-view__preview-label ajuste__previa-ajuste">{ajusteTipo === "desconto" ? "− Desconto" : "+ Acréscimo"}</span>
                      <span className="checkout-view__preview-valor ajuste__previa-valor ajuste__tom">{ajusteTipo === "desconto" ? "−" : "+"}R$ {val.toFixed(2)}</span>
                    </div>
                    <div className="checkout-view__preview-linha ajuste__previa-total">
                      <span className="checkout-view__preview-total-label ajuste__previa-total-rotulo">Novo Total</span>
                      <span className="checkout-view__preview-total-valor ajuste__previa-total-valor">R$ {novoTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Senha de gerente — só no desconto. Tirar valor da conta passa
                  pela mesma autorização que remover um item já exigia aqui. */}
              {ajusteExigeAutorizacao && (
                <div>
                  <div className="checkout-view__modal-input-label ajuste__rotulo ajuste__rotulo--icone">
                    <LuLock size={13} /> Senha de gerente ou admin
                  </div>
                  <div className="ajuste__senha-campo">
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
                      aria-invalid={ajusteSenhaErro ? true : undefined}
                      className="checkout-view__ajuste-senha ajuste__senha"
                    />
                    <button
                      onClick={() => setAjusteSenhaVis(v => !v)}
                      className="checkout-view__ajuste-senha-olho ajuste__apagado"
                      aria-label={ajusteSenhaVis ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {ajusteSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                    </button>
                  </div>
                  {ajusteSenhaErro ? (
                    <div role="alert" className="checkout-view__ajuste-senha-erro ajuste__erro ajuste__senha-nota">
                      {ajusteSenhaErro}
                    </div>
                  ) : (
                    <div className="checkout-view__ajuste-senha-dica ajuste__apagado ajuste__senha-nota">
                      Todo desconto precisa da autorização de um gerente.
                    </div>
                  )}
                </div>
              )}

              {/* Ações */}
              <div className="checkout-view__modal-acoes ajuste__acoes">
                {ajusteAplicado && (
                  <button
                    onClick={() => { setAjusteAplicado(null); fecharAjuste(); }}
                    disabled={aplicandoAjuste}
                    className="checkout-view__modal-btn-remover ajuste__remover"
                  >
                    Remover
                  </button>
                )}
                <button
                  onClick={aplicarAjuste}
                  disabled={!podeConfirmarAjuste}
                  className="checkout-view__modal-btn-aplicar ajuste__aplicar"
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
