// Célula-toggle da matriz de permissões (marcado/desmarcado). Alvo grande
// para toque (PDV) e feedback de cor imediato (Princípio nº 1).
export default function PermCheck({ on, color, disabled, locked, onClick, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-pressed={on}
      className={`perm-check${on ? " perm-check--on" : ""}${disabled ? " perm-check--disabled" : ""}${locked ? " perm-check--locked" : ""}`}
      style={{ "--perm-cor": color }}
    >
      {on ? "✓" : ""}
    </button>
  );
}
