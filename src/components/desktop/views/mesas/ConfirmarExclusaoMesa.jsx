import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuTrash2 } from "react-icons/lu";

// Confirmação antes de excluir uma mesa.
export default function ConfirmarExclusaoMesa({ tela }) {
  const {
    confirmDelete, setConfirmDelete, deletando, executarDelete,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setConfirmDelete(null))}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 400,
            border: `1px solid var(${C.border})`, padding: 28,
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuTrash2 size={20} color={varColor(C.red)} />
              </div>
              <div>
                <div className="mesas-admin__modal-titulo" style={{ fontWeight: 800, color: varColor(C.text) }}>
                  Remover Mesa {confirmDelete.numero}?
                </div>
                <div className="mesas-admin__confirm-descricao" style={{ color: varColor(C.muted), marginTop: 4 }}>
                  Esta ação não pode ser desfeita. Pedidos e vendas anteriores vinculados à mesa não serão afetados.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                className="mesas-admin__modal-botao"
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer",
                  fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={executarDelete}
                disabled={deletando}
                className="mesas-admin__modal-botao"
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: deletando ? varColor(C.faint) : varColor(C.red),
                  color: "#fff", cursor: deletando ? "not-allowed" : "pointer",
                  fontWeight: 700, fontFamily: "inherit",
                }}
              >
                {deletando ? "Removendo…" : "Sim, remover"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
