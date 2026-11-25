import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import {
  LuX, LuCheck
} from "react-icons/lu";

export default function ModalBase({ title, onClose, onSave, saveLabel = "Salvar", saving, width = 540, children }) {
  return createPortal(
    <div
      {...fecharAoClicarFora(onClose)}
      className="admin__modal-overlay"
    >
      <div className="admin__modal" style={{ "--admin-modal-w": `${width}px` }}>
        <div className="admin__modal-topo">
          <div className="admin__modal-titulo">{title}</div>
          <button
            onClick={onClose}
            className="admin__modal-fechar"
          >
            <LuX size={16} />
          </button>
        </div>
        {children}
        <div className="admin__modal-botoes">
          <button onClick={onClose} className="admin__modal-cancelar">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="admin__modal-salvar"
          >
            {saving ? "Salvando..." : <><LuCheck size={14} />{saveLabel}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
