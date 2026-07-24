import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import "./AberturaCaixaModal.css";

export default function AberturaCaixaModal({ onConfirm, onClose }) {
  const [fundo,     setFundo]     = useState("");
  const [salvando,  setSalvando]  = useState(false);

  const valor = parseFloat(fundo.replace(",", ".")) || 0;
  const pode  = valor >= 0 && fundo !== "";

  const handleConfirm = async () => {
    if (!pode || salvando) return;
    setSalvando(true);
    await onConfirm(valor);
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 400, padding: 16,
      }}
    >
      <div style={{
        background: varColor(C.card), borderRadius: 20, padding: 32,
        width: "100%", maxWidth: 420, boxSizing: "border-box",
        border: `1px solid var(${C.border})`,
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            className="abertura-caixa__icone-header"
            style={{
            width: 48, height: 48, borderRadius: 14,
            background: `${alfa(C.green, "18")}`, border: `1.5px solid ${alfa(C.green, "44")}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            🏦
          </div>
          <div>
            <div className="abertura-caixa__titulo" style={{ fontWeight: 800 }}>Abrir Caixa</div>
            <div className="abertura-caixa__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
              Informe o fundo de caixa inicial
            </div>
          </div>
        </div>

        {/* Campo fundo */}
        <div>
          <div className="abertura-caixa__label" style={{
            fontWeight: 700, color: varColor(C.muted),
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
          }}>
            Fundo de Caixa (R$)
          </div>
          <div style={{ position: "relative" }}>
            <span className="abertura-caixa__simbolo-moeda" style={{
              position: "absolute", left: 16, top: "50%",
              transform: "translateY(-50%)",
              color: varColor(C.muted), fontWeight: 600,
            }}>
              R$
            </span>
            <input
              className="abertura-caixa__input"
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={fundo}
              onChange={e => setFundo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder="0,00"
              style={{
                width: "100%", padding: "14px 16px 14px 48px",
                borderRadius: 12, border: "1.5px solid var(--gm-input-border)",
                background: "var(--gm-input-bg)", color: varColor(C.text),
                fontWeight: 700,
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div className="abertura-caixa__ajuda" style={{ color: varColor(C.muted), marginTop: 6 }}>
            Digite 0 se não houver fundo inicial.
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="abertura-caixa__botao-cancelar"
            onClick={onClose}
            style={{
              flex: 1, padding: 13, borderRadius: 10,
              border: `1px solid var(${C.border})`, background: "none",
              color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            className="abertura-caixa__botao-confirmar"
            onClick={handleConfirm}
            disabled={!pode || salvando}
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: pode ? varColor(C.green) : varColor(C.faint),
              color: "#fff", cursor: pode ? "pointer" : "not-allowed",
              fontWeight: 700, transition: "background 0.2s",
            }}
          >
            {salvando ? "Abrindo..." : "✓ Abrir Caixa"}
          </button>
        </div>
      </div>
    </div>
  );
}
