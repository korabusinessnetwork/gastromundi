import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuTrash2 } from "react-icons/lu";

// Confirmação antes de excluir uma mesa.
export default function ConfirmarExclusaoMesa({ tela }) {
  const {
    confirmDelete, setConfirmDelete, deletando, executarDelete,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setConfirmDelete(null))}
          className="mesas-admin__overlay mesas-admin__overlay--confirmar"
        >
          <div className="mesas-admin__janela mesas-admin__janela--confirmar">
            <div className="mesas-admin__confirm-topo">
              <div className="mesas-admin__confirm-icone">
                <LuTrash2 size={20} />
              </div>
              <div>
                <div className="mesas-admin__modal-titulo">
                  Remover Mesa {confirmDelete.numero}?
                </div>
                <div className="mesas-admin__confirm-descricao">
                  Esta ação não pode ser desfeita. Pedidos e vendas anteriores vinculados à mesa não serão afetados.
                </div>
              </div>
            </div>
            <div className="mesas-admin__botoes">
              <button
                onClick={() => setConfirmDelete(null)}
                className="mesas-admin__modal-botao mesas-admin__modal-botao--cancelar"
              >
                Cancelar
              </button>
              <button
                onClick={executarDelete}
                disabled={deletando}
                className="mesas-admin__modal-botao mesas-admin__modal-botao--remover"
              >
                {deletando ? "Removendo…" : "Sim, remover"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
