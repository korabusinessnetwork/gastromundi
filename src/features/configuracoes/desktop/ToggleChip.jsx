
export default function ToggleChip({ active, onClick, color, children }) {
  return (
    <button
      onClick={onClick}
      className={`meios-pagamento-tab__toggle-chip${active ? " meios-pagamento-tab__toggle-chip--ativo" : ""}`}
      style={{ "--chip-cor": color }}
    >
      {children}
    </button>
  );
}

// ── Catálogo de métodos de pagamento ────────────────────────────────
