import C from "@/constants/colors";
import { varColor } from "@/lib/tema";

export default function FSel({ value, onChange, opts, placeholder }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className="impostos-admin__select"
      style={{ color: value ? varColor(C.text) : varColor(C.muted) }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
