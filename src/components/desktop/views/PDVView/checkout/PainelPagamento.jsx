import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuX, LuUsers } from "react-icons/lu";
import ClienteFiadoSelector from "../ClienteFiadoSelector";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { valorRecebido } from "./apoio";

// Painel de pagamento: métodos, valores, troco, divisão e o botão de confirmar.
export default function PainelPagamento({ tela }) {
  const {
    pagamentos, showDivisor, setShowDivisor, nPessoas, setNPessoas, confirmando, erroConfirmar, clienteFiado, setClienteFiado, currentUser, METODOS, itensVisiveis, total, isSplit, singleMetodo, singleRecebido, singleTroco, faltaAlocar, usaFiado, metodoIndisponivelOffline, tefOffline, dinheiroInsuficiente, faltaEmDinheiro, podeConfirmar, updatePagamento, removePagamento, addPagamento, dividirPagamento, voltarParaUnico, handleConfirm,
  } = tela;
  return (
    <div className="checkout-view__pagamento" style={{ background: varColor(C.card) }}>
      {/* Header da sidebar */}
      <div className="checkout-view__pagamento-header" style={{ borderBottom: `1px solid var(${C.border})` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="checkout-view__pagamento-titulo" style={{ color: varColor(C.muted) }}>
              Forma de Pagamento
            </div>
            <div className="checkout-view__pagamento-subtitulo" style={{ color: varColor(C.muted) }}>
              {isSplit ? `${pagamentos.length} pagamentos · R$ ${total.toFixed(2)} total` : "Selecione como o cliente vai pagar"}
            </div>
          </div>
          {isSplit ? (
            <button
              onClick={voltarParaUnico}
              className="checkout-view__btn-pagamento-unico"
              style={{
                background: "none", border: `1px solid var(${C.border})`,
                borderRadius: 8, color: varColor(C.muted), cursor: "pointer",
                padding: "6px 12px", fontWeight: 600, fontFamily: "inherit",
              }}
            >
              Pagamento único
            </button>
          ) : (
            <button
              onClick={() => setShowDivisor(v => !v)}
              className="checkout-view__btn-divisor"
              style={{
                background: showDivisor ? alfa(C.accent, "18") : "none",
                border: `1.5px solid ${showDivisor ? alfa(C.accent, "66") : varColor(C.border)}`,
                color: showDivisor ? varColor(C.accent) : varColor(C.muted),
              }}
            >
              <LuUsers size={14} /> Dividir pagamento
            </button>
          )}
        </div>

        {/* Stepper inline */}
        {showDivisor && !isSplit && (
          <div className="checkout-view__stepper" style={{
            background: varColor(C.surface), border: `1.5px solid ${alfa(C.accent, "44")}`,
          }}>
            <span className="checkout-view__stepper-label" style={{ fontWeight: 600, color: varColor(C.muted), whiteSpace: "nowrap" }}>Dividir entre</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setNPessoas(n => Math.max(2, n - 1))}
                className="checkout-view__stepper-btn"
                style={{
                  border: `1.5px solid var(${C.border})`,
                  background: varColor(C.card), color: varColor(C.text),
                  cursor: nPessoas <= 2 ? "not-allowed" : "pointer", opacity: nPessoas <= 2 ? 0.4 : 1,
                }}
              >−</button>
              <span className="checkout-view__stepper-valor" style={{ fontWeight: 900, color: varColor(C.text), minWidth: 32, textAlign: "center" }}>{nPessoas}</span>
              <button
                onClick={() => setNPessoas(n => Math.min(10, n + 1))}
                className="checkout-view__stepper-btn"
                style={{
                  border: `1.5px solid var(${C.border})`,
                  background: varColor(C.card), color: varColor(C.text),
                  cursor: nPessoas >= 10 ? "not-allowed" : "pointer", opacity: nPessoas >= 10 ? 0.4 : 1,
                }}
              >+</button>
            </div>
            <span className="checkout-view__stepper-unidade" style={{ color: varColor(C.muted) }}>pessoas</span>
            <span className="checkout-view__stepper-estimativa" style={{ color: varColor(C.muted), flex: 1 }}>
              ≈ R$ {(total / nPessoas).toFixed(2)} cada
            </span>
            <button
              onClick={() => dividirPagamento(nPessoas)}
              className="checkout-view__btn-dividir"
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: varColor(C.accent), color: "#fff", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: `0 2px 8px ${alfa(C.accent, "44")}`,
              }}
            >
              Dividir
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo: lista (split) ou grid (single) */}
      {isSplit ? (
        /* ── Modo split: lista de entradas ── */
        <div className="checkout-view__split-lista">
          {pagamentos.map((p, idx) => {
            const trocoP = p.metodo === "dinheiro" ? (p.recebido || 0) - p.valor : 0;
            return (
              <div key={p.uid} className="checkout-view__split-item" style={{
                background: varColor(C.surface),
                border: `1.5px solid ${p.metodo ? alfa(C.accent, "44") : varColor(C.border)}`,
              }}>
                {/* Linha 1: método + valor + remover */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="checkout-view__split-metodos">
                    {METODOS.map(m => {
                      const indisponivel = metodoIndisponivelOffline(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => updatePagamento(idx, { metodo: m.id })}
                          disabled={indisponivel}
                          className="checkout-view__chip-metodo"
                          style={{
                            border: `1.5px solid ${p.metodo === m.id ? varColor(C.accent) : varColor(C.border)}`,
                            background: p.metodo === m.id ? "var(--gm-alow)" : "transparent",
                            color: p.metodo === m.id ? varColor(C.accent) : varColor(C.muted),
                            opacity: indisponivel ? 0.4 : 1,
                            cursor: indisponivel ? "not-allowed" : "pointer",
                          }}
                          title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                        >
                          {m.label}{indisponivel ? " · sem internet" : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="checkout-view__split-valor-wrap">
                    <span className="checkout-view__input-prefixo" style={{ color: varColor(C.muted) }}>R$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={p.valor === 0 ? "" : p.valor}
                      onChange={e => updatePagamento(idx, { valor: parseFloat(e.target.value) || 0 })}
                      className="checkout-view__split-input"
                      style={{
                        border: `1.5px solid var(--gm-input-border)`,
                        background: "var(--gm-input-bg)", color: varColor(C.text),
                      }}
                      onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                      onBlur={e => e.currentTarget.style.borderColor = "var(--gm-input-border)"}
                    />
                  </div>
                  <button
                    onClick={() => removePagamento(idx)}
                    className="checkout-view__btn-remover-split"
                    style={{ color: varColor(C.muted) }}
                    onMouseEnter={e => e.currentTarget.style.color = varColor(C.red)}
                    onMouseLeave={e => e.currentTarget.style.color = varColor(C.muted)}
                  >
                    <LuX size={16} />
                  </button>
                </div>

                {/* Linha 2: dinheiro → recebido + troco */}
                {p.metodo === "dinheiro" && (
                  <div className="checkout-view__split-recebido">
                    <span className="checkout-view__recebido-label" style={{ color: varColor(C.muted), fontWeight: 600, whiteSpace: "nowrap" }}>Recebido:</span>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span className="checkout-view__input-prefixo" style={{ color: varColor(C.muted) }}>R$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={p.recebido || ""}
                        onChange={e => updatePagamento(idx, { recebido: valorRecebido(e.target.value) })}
                        placeholder={p.valor.toFixed(2)}
                        className="checkout-view__recebido-input"
                        style={{
                          border: `1.5px solid var(--gm-input-border)`,
                          background: "var(--gm-input-bg)", color: varColor(C.text),
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                        onBlur={e => e.currentTarget.style.borderColor = "var(--gm-input-border)"}
                      />
                    </div>
                    {(p.recebido || 0) > 0 && (
                      <span className="checkout-view__split-troco" style={{
                        fontWeight: 700,
                        color: trocoP >= 0 ? varColor(C.green) : varColor(C.accent),
                        minWidth: 90, textAlign: "right", whiteSpace: "nowrap",
                      }}>
                        {trocoP >= 0 ? "Troco" : "Falta"}: R$ {Math.abs(trocoP).toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Falta alocar */}
          {Math.abs(faltaAlocar) >= 0.005 && (
            <div className="checkout-view__falta-alocar" style={{
              background: faltaAlocar > 0 ? alfa(C.accent, "14") : alfa(C.red, "14"),
              border: `1.5px solid ${alfa(faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red), "55")}`,
            }}>
              <span className="checkout-view__falta-label" style={{ fontWeight: 700, color: faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red) }}>
                {faltaAlocar > 0 ? "Falta alocar" : "Valor excede o total"}
              </span>
              <span className="checkout-view__falta-valor" style={{ fontWeight: 900, color: faltaAlocar > 0 ? varColor(C.accent) : varColor(C.red) }}>
                R$ {Math.abs(faltaAlocar).toFixed(2)}
              </span>
            </div>
          )}

          {/* + Adicionar outro */}
          {pagamentos.length < 10 && (
            <button
              onClick={addPagamento}
              className="checkout-view__btn-adicionar-outro"
              style={{
                border: `1.5px dashed var(${C.border})`,
                color: varColor(C.muted),
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = varColor(C.accent); e.currentTarget.style.color = varColor(C.accent); }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.muted); }}
            >
              + Adicionar outro
            </button>
          )}
        </div>
      ) : (
        /* ── Modo single: grid original ── */
        <div className="checkout-view__single">
          <div className="checkout-view__metodos-grid" style={{
            gridTemplateColumns: METODOS.length === 1 ? "1fr" : "1fr 1fr",
            gridTemplateRows: `repeat(${Math.ceil(METODOS.length / 2)}, 1fr)`,
          }}>
            {METODOS.map(m => {
              const ativo = singleMetodo === m.id;
              const indisponivel = metodoIndisponivelOffline(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => updatePagamento(0, { metodo: m.id, recebido: 0 })}
                  disabled={indisponivel}
                  className="checkout-view__metodo-card"
                  style={{
                    border: `2px solid ${ativo ? varColor(C.accent) : varColor(C.border)}`,
                    background: ativo ? "var(--gm-alow)" : varColor(C.surface),
                    color: ativo ? varColor(C.accent) : varColor(C.text),
                    boxShadow: ativo ? `0 0 0 4px ${alfa(C.accent, "22")}` : "none",
                    opacity: indisponivel ? 0.4 : 1,
                    cursor: indisponivel ? "not-allowed" : "pointer",
                  }}
                  title={indisponivel ? "Maquininha (TEF) indisponível sem internet" : undefined}
                >
                  <div className="checkout-view__metodo-icone" style={{
                    background: ativo ? alfa(C.accent, "22") : varColor(C.card),
                    border: `1.5px solid ${ativo ? alfa(C.accent, "55") : varColor(C.border)}`,
                  }}>
                    <m.Icon size={24} />
                  </div>
                  {m.label}{indisponivel && (
                    <span className="checkout-view__metodo-offline-nota" style={{ display: "block", fontWeight: 600 }}>sem internet</span>
                  )}
                </button>
              );
            })}
          </div>

          {singleMetodo === "dinheiro" && (
            <div className="checkout-view__troco">
              <label className="checkout-view__troco-label" style={{ color: varColor(C.muted) }}>
                Calcular Troco <span className="checkout-view__troco-opcional" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
              </label>
              <div className="checkout-view__troco-input-wrap">
                <span className="checkout-view__troco-prefixo" style={{ color: varColor(C.muted) }}>
                  R$
                </span>
                <input
                  autoFocus
                  type="number"
                  min="0"
                  step="0.01"
                  value={singleRecebido || ""}
                  onChange={e => updatePagamento(0, { recebido: valorRecebido(e.target.value) })}
                  placeholder={total.toFixed(2)}
                  className="checkout-view__troco-input"
                  style={{
                    border: `1.5px solid var(--gm-input-border)`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                  onBlur={e => e.currentTarget.style.borderColor = "var(--gm-input-border)"}
                />
              </div>

              {singleRecebido > 0 && (
                <div className="checkout-view__troco-resultado" style={{
                  background: singleTroco >= 0 ? alfa(C.green, "14") : alfa(C.accent, "14"),
                  border: `1.5px solid ${alfa(singleTroco >= 0 ? varColor(C.green) : varColor(C.accent), "55")}`,
                }}>
                  <span className="checkout-view__troco-resultado-label" style={{ fontWeight: 700, color: varColor(C.muted) }}>
                    {singleTroco >= 0 ? "Troco" : "Falta"}
                  </span>
                  <span className="checkout-view__troco-resultado-valor" style={{ fontWeight: 900, color: singleTroco >= 0 ? varColor(C.green) : varColor(C.accent) }}>
                    R$ {Math.abs(singleTroco).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="checkout-view__rodape-confirmar" style={{ borderTop: `1px solid var(${C.border})` }}>
        {usaFiado && (
          <div style={{ marginBottom: 4 }}>
            <div className="checkout-view__label-fiado" style={{ fontWeight: 700, color: varColor(C.muted), marginBottom: 6 }}>
              Cliente do fiado
            </div>
            <ClienteFiadoSelector
              cliente={clienteFiado}
              onSelecionar={setClienteFiado}
              usuario={currentUser?.username}
            />
          </div>
        )}
        {erroConfirmar && (
          <div className="checkout-view__aviso-confirmar" role="alert" style={{ color: varColor(C.red), fontWeight: 700 }}>
            {erroConfirmar}
          </div>
        )}
        {!podeConfirmar && (
          <div className="checkout-view__aviso-confirmar" style={{ color: varColor(C.muted) }}>
            {itensVisiveis.length === 0
              ? "Todos os itens foram removidos, volte para a comanda"
              : tefOffline
              ? "Sem internet: a maquininha (TEF) não funciona. Troque para dinheiro, Pix ou outro método, a venda fica guardada e sobe quando a conexão voltar."
              : usaFiado && !clienteFiado
              ? "Busque ou cadastre o cliente do fiado acima"
              : dinheiroInsuficiente
              ? `Faltam R$ ${faltaEmDinheiro.toFixed(2)} em dinheiro, corrija o valor recebido ou divida o pagamento`
              : isSplit
              ? Math.abs(faltaAlocar) >= 0.015
                ? `Distribua os R$ ${Math.abs(faltaAlocar).toFixed(2)} restantes`
                : "Selecione a forma de cada pagamento"
              : "Selecione a forma de pagamento acima"}
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={!podeConfirmar || confirmando}
          className="checkout-view__btn-confirmar"
          style={{
            background: podeConfirmar ? varColor(C.green) : varColor(C.faint),
            cursor: podeConfirmar ? "pointer" : "not-allowed",
            boxShadow: podeConfirmar ? `0 4px 20px ${alfa(C.green, "44")}` : "none",
          }}
        >
          {confirmando ? "Processando..." : "✓ Confirmar Pagamento"}
        </button>
      </div>
    </div>
  );
}
