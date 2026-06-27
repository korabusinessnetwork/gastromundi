import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuArrowLeft, LuBanknote, LuCreditCard, LuZap, LuSmartphone } from "react-icons/lu";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

const METODOS = [
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
];

export default function CheckoutView({ comanda, items, onConfirm, onBack }) {
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [metodo,      setMetodo]      = useState(null);
  const [recebido,    setRecebido]    = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const total         = items.reduce((s, i) => s + i.price * i.qty, 0);
  const valorRecebido = parseFloat(recebido.replace(",", ".")) || 0;
  const troco         = metodo === "dinheiro" ? valorRecebido - total : 0;
  const podeConfirmar = metodo && (metodo !== "dinheiro" || valorRecebido >= total);

  const handleConfirm = async () => {
    if (!podeConfirmar || confirmando) return;
    setConfirmando(true);
    await onConfirm({ metodo, recebido: valorRecebido, troco: Math.max(0, troco) });
  };

  return (
    <>
      <style>{`
        @keyframes kora-slide-in {
          from { opacity: 0; transform: translateX(32px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        background: C.bg,
        animation: "kora-slide-in 0.22s ease",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "16px 24px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        }}>
          <button
            onClick={onBack}
            disabled={confirmando}
            style={{
              background: "none", border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.muted, cursor: "pointer",
              padding: "7px 14px", fontWeight: 600, fontSize: 13,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <LuArrowLeft size={15} /> Voltar
          </button>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Finalizar Comanda</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              {fmtComanda(comanda?.comanda)} · {items.length} {items.length === 1 ? "item" : "itens"}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        {(() => {
          const isMob = sz.checkoutResumo === 0;
          return (
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, flexDirection: isMob ? "column" : "row" }}>

          {/* Resumo do pedido */}
          <div style={{
            width: isMob ? "100%" : sz.checkoutResumo,
            maxHeight: isMob ? "38%" : undefined,
            flexShrink: 0, overflowY: "auto",
            borderRight: isMob ? "none" : `1px solid ${C.border}`,
            borderBottom: isMob ? `1px solid ${C.border}` : "none",
            padding: isMob ? "14px 16px" : `${sz.pad + 4}px ${sz.pad + 8}px`,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 22,
            }}>
              Resumo do Pedido · {fmtComanda(comanda?.comanda)}
            </div>

            {/* Itens — fluem naturalmente, sem flex:1 */}
            {items.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 18,
                  padding: "18px 0", borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  background: C.alow, border: `1.5px solid ${C.accent}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 20, color: C.accent,
                }}>
                  {item.qty}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, fontSize: sz.fontLg - 1, lineHeight: 1.2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: sz.fontBase - 1, color: C.muted, marginTop: 4 }}>
                    {item.qty}× R$ {Number(item.price).toFixed(2)}
                  </div>
                  {item.obs && (
                    <div style={{
                      marginTop: 6, fontSize: sz.fontSm + 1,
                      color: C.accent, fontStyle: "italic",
                      background: C.alow, borderRadius: 6,
                      padding: "3px 8px", display: "inline-block",
                    }}>
                      📝 {item.obs}
                    </div>
                  )}
                </div>

                <div style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.text, textAlign: "right", flexShrink: 0 }}>
                  R$ {(item.price * item.qty).toFixed(2)}
                </div>
              </div>
            ))}

            {/* Total — logo abaixo dos itens */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 24, marginTop: 8,
              borderTop: `2px solid ${C.border}`,
            }}>
              <span style={{ fontWeight: 800, fontSize: sz.fontLg, color: C.muted }}>Total</span>
              <span style={{ fontWeight: 900, fontSize: sz.fontXl + 6, color: C.green }}>
                R$ {total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* ── Sidebar de pagamento ── */}
          <div style={{
            flex: 1,
            borderLeft: `1px solid ${C.border}`,
            background: C.card,
            display: "flex", flexDirection: "column",
          }}>
            {/* Cabeçalho da sidebar */}
            <div style={{
              padding: "28px 32px 20px",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6,
              }}>
                Forma de Pagamento
              </div>
              <div style={{ fontSize: 14, color: C.muted }}>
                Selecione como o cliente vai pagar
              </div>
            </div>

            {/* Corpo da sidebar — cards preenchem o espaço disponível */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px", gap: 20, overflow: "hidden" }}>

              {/* Grid de métodos — cresce para preencher a altura */}
              <div style={{
                flex: 1,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                gap: 14,
              }}>
                {METODOS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setMetodo(m.id); setRecebido(""); }}
                    style={{
                      borderRadius: 16,
                      border: `2px solid ${metodo === m.id ? C.accent : C.border}`,
                      background: metodo === m.id ? C.alow : C.surface,
                      color: metodo === m.id ? C.accent : C.text,
                      cursor: "pointer", fontWeight: 700, fontSize: sz.fontLg - 1,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                      transition: "border-color 0.15s, background 0.15s, color 0.15s",
                    }}
                  >
                    <m.Icon size={sz.fontXl + 2} />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Campo de valor recebido — só pra dinheiro */}
              {metodo === "dinheiro" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
                  <label style={{
                    fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: 1.5,
                  }}>
                    Valor Recebido
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 18, top: "50%",
                      transform: "translateY(-50%)",
                      color: C.muted, fontSize: 16, fontWeight: 600,
                    }}>
                      R$
                    </span>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={recebido}
                      onChange={e => setRecebido(e.target.value)}
                      placeholder={total.toFixed(2)}
                      style={{
                        width: "100%", padding: "16px 18px 16px 52px",
                        borderRadius: 12, border: `1.5px solid ${C.border}`,
                        background: C.surface, color: C.text,
                        fontSize: sz.fontXl - 4, fontWeight: 700,
                        boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                      }}
                    />
                  </div>

                  {/* Troco / Faltam */}
                  {valorRecebido > 0 && (
                    <div style={{
                      padding: "16px 20px", borderRadius: 12,
                      background: troco >= 0 ? `${C.green}14` : `${C.red}14`,
                      border: `1.5px solid ${troco >= 0 ? C.green : C.red}55`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}>
                      <span style={{ fontSize: sz.fontBase, fontWeight: 600, color: C.muted }}>
                        {troco >= 0 ? "Troco" : "Faltam"}
                      </span>
                      <span style={{ fontSize: sz.fontXl - 4, fontWeight: 900, color: troco >= 0 ? C.green : C.red }}>
                        R$ {Math.abs(troco).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé fixo com botão */}
            <div style={{
              padding: "20px 32px 28px",
              borderTop: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              {!metodo && (
                <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 4 }}>
                  Selecione a forma de pagamento acima
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={!podeConfirmar || confirmando}
                style={{
                  width: "100%", padding: 18, borderRadius: 14, border: "none",
                  background: podeConfirmar ? C.green : C.faint,
                  color: "#fff", fontWeight: 800, fontSize: 18,
                  cursor: podeConfirmar ? "pointer" : "not-allowed",
                  transition: "background 0.2s",
                  letterSpacing: 0.3,
                }}
              >
                {confirmando ? "Processando..." : "✓ Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
        );})()}
      </div>
    </>
  );
}
