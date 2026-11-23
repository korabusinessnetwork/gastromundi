import C from "@/constants/colors";
import { varColor } from "@/lib/tema";

export default function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="combos-view__toggle"
      style={{ background: value ? varColor(C.green) : varColor(C.faint) }}
    >
      <span className="combos-view__toggle-bolinha" style={{ left: value ? 22 : 2 }} />
    </button>
  );
}
