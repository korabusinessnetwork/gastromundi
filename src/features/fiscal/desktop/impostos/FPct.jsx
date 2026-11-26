
export default function FPct({ value, onChange, placeholder = "0,00" }) {
  return (
    <div className="impostos-admin__pct-wrap">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="impostos-admin__pct-input"
      />
      <span className="impostos-admin__pct-simbolo">%</span>
    </div>
  );
}
