
export default function Empty({ icon: Icon, msg }) {
  const inner = typeof Icon === "string"
    ? <span className="relatorio-view__empty-icon">{Icon}</span>
    : Icon ? <Icon size={48} /> : null;
  return (
    <div className="relatorio-view__empty">
      <div className="relatorio-view__empty-glifo">{inner}</div>
      <div className="relatorio-view__empty-msg">{msg}</div>
    </div>
  );
}
