
export default function ChipBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={"relatorio-view__chip" + (active ? " relatorio-view__chip--ativo" : "")}
    >
      {children}
    </button>
  );
}

// ── Barra de exportação ───────────────────────────────────────────
