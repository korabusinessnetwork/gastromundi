import { useState } from "react";
import { LuPencil, LuTrash2 } from "react-icons/lu";

// Cartão de uma mesa no cadastro: arrastável, com editar e remover no hover.
// O destaque do hover fica no CSS; o estado só decide se os botões aparecem.
export default function CardMesaAdmin({ mesa, onEdit, onDelete, onDragStart, onDragEnd }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="mesas-admin__card"
    >
      <div className="mesas-admin__mesa-numero">{mesa.numero}</div>
      {mesa.capacidade != null && (
        <div className="mesas-admin__mesa-capacidade">{mesa.capacidade}p</div>
      )}

      {/* Botões de ação, visíveis no hover */}
      {hover && (
        <div className="mesas-admin__card-acoes">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title="Editar"
            onMouseDown={e => e.stopPropagation()}
            className="mesas-admin__card-botao"
          >
            <LuPencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Remover"
            onMouseDown={e => e.stopPropagation()}
            className="mesas-admin__card-botao mesas-admin__card-botao--remover"
          >
            <LuTrash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
