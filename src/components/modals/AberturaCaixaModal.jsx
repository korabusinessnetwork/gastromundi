import { useState } from "react";
import C from "@/constants/colors";

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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 400,
      }}
    >
      <div style={{
        background: C.card, borderRadius: 20, padding: 32,
        width: 420, border: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `${C.green}18`, border: `1.5px solid ${C.green}44`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            🏦
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Abrir Caixa</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              Informe o fundo de caixa inicial
            </div>
          </div>
        </div>

        {/* Campo fundo */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
          }}>
            Fundo de Caixa (R$)
          </div>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 16, top: "50%",
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
              value={fundo}
              onChange={e => setFundo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder="0,00"
              style={{
                width: "100%", padding: "14px 16px 14px 48px",
                borderRadius: 12, border: `1.5px solid ${C.border}`,
                background: C.surface, color: C.text,
                fontSize: 20, fontWeight: 700,
                boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            Digite 0 se não houver fundo inicial.
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 13, borderRadius: 10,
              border: `1px solid ${C.border}`, background: "none",
              color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!pode || salvando}
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: pode ? C.green : C.faint,
              color: "#fff", cursor: pode ? "pointer" : "not-allowed",
              fontWeight: 700, fontSize: 15, transition: "background 0.2s",
            }}
          >
            {salvando ? "Abrindo..." : "✓ Abrir Caixa"}
          </button>
        </div>
      </div>
    </div>
  );
}
