export default function FSel({ value, onChange, opts, placeholder }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className={`impostos-admin__select${value ? "" : " impostos-admin__select--vazio"}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
