import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { fmtComanda } from "./apoio";

// Confirmação antes de cancelar o pedido em andamento.
export default function ConfirmarCancelarPedido({ tela }) {
  const {
    selected, currentUser, removePending, setConfirmCancelar, confirmCancelarMotivo,
    setConfirmCancelarMotivo, cancelandoComanda, setCancelandoComanda, handleBack, notify,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setConfirmCancelar(false))}
          className="pdv__confirm-overlay"
        >
          <div className="pdv__confirm-card">
            <div className="pdv__confirm-header">
              <div className="pdv__modal-emoji-circulo pdv__confirm-emoji">
                🗑️
              </div>
              <div>
                <div className="pdv__modal-titulo pdv__confirm-titulo">Cancelar pedido?</div>
                <div className="pdv__modal-subtitulo pdv__confirm-subtitulo">
                  {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
            </div>

            <div className="pdv__modal-aviso pdv__confirm-aviso">
              A comanda será <strong className="pdv__modal-vermelho">removida permanentemente</strong>. Esta ação não pode ser desfeita.
            </div>

            <div className="pdv__confirm-campo">
              <div className="pdv__modal-label">
                Motivo do cancelamento <span className="pdv__modal-vermelho">*</span>
              </div>
              <input
                autoFocus
                type="text"
                value={confirmCancelarMotivo}
                onChange={e => setConfirmCancelarMotivo(e.target.value)}
                placeholder="Ex: cliente desistiu, erro no pedido..."
                maxLength={120}
                className={`pdv__modal-input pdv__confirm-input${confirmCancelarMotivo.trim() ? " pdv__confirm-input--preenchido" : ""}`}
              />
            </div>

            <div className="pdv__confirm-acoes">
              <button
                onClick={() => setConfirmCancelar(false)}
                className="pdv__modal-btn pdv__modal-btn--secundario pdv__confirm-btn"
              >
                Voltar
              </button>
              <button
                onClick={async () => {
                  if (cancelandoComanda) return;
                  setConfirmCancelar(false);
                  setCancelandoComanda(true);
                  try {
                    const itensComanda = Array.isArray(selected?.items) ? selected.items : [];
                    // Remove primeiro: log e evento só depois do banco confirmar,
                    // senão a trilha registra um cancelamento que não aconteceu.
                    const { error } = await removePending(selected.id);
                    if (error) {
                      notify?.("Não foi possível cancelar a comanda. Tente novamente.", "err");
                      return;
                    }
                    logAction(currentUser?.username, "comanda:cancelar", { msg: `Comanda cancelada: ${fmtComanda(selected.comanda)}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, motivo: confirmCancelarMotivo.trim(), items: itensComanda });
                    emitirEvento("pedido.cancelado", "pedidos", { pedido_id: selected.id, comanda: selected.comanda, motivo: confirmCancelarMotivo.trim(), itens: itensComanda.length }, currentUser?.username);
                    handleBack();
                  } finally {
                    setCancelandoComanda(false);
                  }
                }}
                disabled={!confirmCancelarMotivo.trim()}
                className="pdv__modal-btn pdv__modal-btn--primario pdv__confirm-btn pdv__confirm-btn-sim"
              >
                Sim, cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
