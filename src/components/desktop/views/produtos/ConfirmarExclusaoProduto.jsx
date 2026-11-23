import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { LuTriangleAlert } from "react-icons/lu";

// Confirmação antes de excluir um produto.
export default function ConfirmarExclusaoProduto({ tela }) {
  const {
    deleteId, setDeleteId, deletando, products, confirmarDelete,
  } = tela;
  return createPortal(
        (() => {
          const p = products.find(x => x.id === deleteId);
          return (
            <div {...fecharAoClicarFora(() => setDeleteId(null))} className="produtos-view__confirm-overlay" style={{ background: "rgba(0,0,0,0.7)" }}>
              <div className="produtos-view__confirm-modal">
                <div className="produtos-view__confirm-topo">
                  <div className="produtos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                    <LuTriangleAlert size={22} color={varColor(C.red)} />
                  </div>
                  <div>
                    <div className="produtos-view__confirm-titulo">Excluir produto?</div>
                    <div className="produtos-view__confirm-sub">{p?.emoji} <strong style={{ color: varColor(C.text) }}>{p?.name}</strong></div>
                  </div>
                </div>
                <div className="produtos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
                  Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O produto será removido permanentemente.
                </div>
                <div className="produtos-view__confirm-botoes">
                  <button onClick={() => setDeleteId(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
                  <button onClick={confirmarDelete} disabled={deletando} className="produtos-view__confirm-btn-excluir" style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}>{deletando ? "Excluindo..." : "Sim, excluir"}</button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
  );
}
