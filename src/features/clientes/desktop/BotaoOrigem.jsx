/** Chip de filtro: aceso = filtro aplicado. Mesma forma para todos. */
export default function BotaoOrigem({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`clientes-view__chip${ativo ? " clientes-view__chip--ativo" : ""}`}
    >
      {children}
    </button>
  );
}
