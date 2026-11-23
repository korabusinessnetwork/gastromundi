import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { ROLE_MAP } from "./apoio";

export default function RoleBadge({ role }) {
  const r = ROLE_MAP[role] ?? { label: role, color: varColor(C.muted) };
  return (
    <span className="cfg__badge-role" style={{
      background: alfa(r.color, "18"), border: `1px solid ${alfa(r.color, "44")}`,
      color: r.color,
    }}>
      {r.label}
    </span>
  );
}
