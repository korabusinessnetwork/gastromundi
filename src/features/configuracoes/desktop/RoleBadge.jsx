import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { ROLE_MAP } from "./apoio";

export default function RoleBadge({ role }) {
  const r = ROLE_MAP[role] ?? { label: role, color: varColor(C.muted) };
  return (
    <span className="cfg__badge-role" style={{ "--cargo-cor": r.color }}>
      {r.label}
    </span>
  );
}
