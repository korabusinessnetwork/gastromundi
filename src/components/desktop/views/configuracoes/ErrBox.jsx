import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";

export default function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div className="cfg__erro-box" style={{ background: alfa(C.red, "15"), border: `1px solid ${alfa(C.red, "44")}` }}>
      ⚠️ {msg}
    </div>
  );
}
