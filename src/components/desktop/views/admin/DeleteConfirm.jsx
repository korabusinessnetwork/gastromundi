import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";

export default function DeleteConfirm({ msg, onCancel, onConfirm }) {
  return createPortal(
    <div {...fecharAoClicarFora(onCancel)} className="admin__delete-overlay">
      <div className="admin__delete-modal">
        <div className="admin__delete-titulo">Confirmar exclusão</div>
        <div className="admin__delete-msg">{msg}</div>
        <div className="admin__delete-botoes">
          <button onClick={onCancel} className="admin__delete-cancelar">Cancelar</button>
          <button onClick={onConfirm} className="admin__delete-confirmar">Excluir</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
