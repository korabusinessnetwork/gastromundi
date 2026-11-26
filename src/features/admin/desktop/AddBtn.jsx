import {
  LuPlus
} from "react-icons/lu";

export default function AddBtn({ onClick, label }) {
  return (
    <button onClick={onClick} className="admin__add-btn">
      <LuPlus size={15} /> {label}
    </button>
  );
}

// ── Aba: Fichas Técnicas ──────────────────────────────────────────
