import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";

export default function ToggleChip({ active, onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      className="meios-pagamento-tab__toggle-chip"
      style={{
        padding: "8px 16px", borderRadius: 10,
        border: `1.5px solid ${active ? color : varColor(C.border)}`,
        background: active ? alfa(color, "18") : varColor(C.surface),
        color: active ? color : varColor(C.muted),
        cursor: "pointer", fontWeight: 600,
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── Catálogo de métodos de pagamento ────────────────────────────────
