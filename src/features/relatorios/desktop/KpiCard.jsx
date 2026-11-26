
export default function KpiCard({ label, value, color, Icon, sz }) {
  return (
    <div
      className="relatorio-view__kpi"
      style={{ "--kpi-pad-y": `${sz.padSm + 4}px`, "--kpi-pad-x": `${sz.pad - 4}px`, "--kpi-cor": color }}
    >
      <div className="relatorio-view__kpi-topo">
        {Icon && <Icon size={sz.fontLg} color={color} />}
        <span className="relatorio-view__kpi-label">{label}</span>
      </div>
      <div className="relatorio-view__kpi-valor">{value}</div>
    </div>
  );
}
