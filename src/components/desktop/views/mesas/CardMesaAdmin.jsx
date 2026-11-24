import { useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuPencil, LuTrash2 } from "react-icons/lu";

export default function CardMesaAdmin({ mesa, w, h, onEdit, onDelete, onDragStart, onDragEnd }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: w, height: h, borderRadius: 14, boxSizing: "border-box",
        background: hover ? `${alfa(C.accent, "10")}` : varColor(C.surface),
        border: `2px solid ${hover ? alfa(C.accent, "66") : varColor(C.border)}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 3, padding: "6px 4px", userSelect: "none",
        cursor: "grab", position: "relative",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <div className="mesas-admin__mesa-numero" style={{ fontWeight: 900, color: varColor(C.text) }}>
        {mesa.numero}
      </div>
      {mesa.capacidade != null && (
        <div className="mesas-admin__mesa-capacidade" style={{ color: varColor(C.muted), fontWeight: 600 }}>
          {mesa.capacidade}p
        </div>
      )}

      {/* Botões de ação — visíveis no hover */}
      {hover && (
        <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title="Editar"
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: varColor(C.card), border: `1px solid var(${C.border})`,
              color: varColor(C.muted), cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 0,
            }}
          >
            <LuPencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Remover"
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
              color: varColor(C.red), cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 0,
            }}
          >
            <LuTrash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
