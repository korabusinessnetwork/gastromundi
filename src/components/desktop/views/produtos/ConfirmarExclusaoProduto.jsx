import { createPortal } from "react-dom";
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
            <div {...fecharAoClicarFora(() => setDeleteId(null))} className="produtos-view__confirm-overlay produtos-view__confirm-overlay--claro">
              <div className="produtos-view__confirm-modal">
                <div className="produtos-view__confirm-topo">
                  <div className="produtos-view__confirm-icone produtos-view__confirm-icone--perigo">
                    <LuTriangleAlert size={22} />
                  </div>
                  <div>
                    <div className="produtos-view__confirm-titulo">Excluir produto?</div>
                    <div className="produtos-view__confirm-sub">{p?.emoji} <strong className="produtos-view__destaque">{p?.name}</strong></div>
                  </div>
                </div>
                <div className="produtos-view__confirm-aviso produtos-view__confirm-aviso--perigo">
                  Esta ação <strong className="produtos-view__destaque produtos-view__destaque--perigo">não pode ser desfeita</strong>. O produto será removido permanentemente.
                </div>
                <div className="produtos-view__confirm-botoes">
                  <button onClick={() => setDeleteId(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
                  <button onClick={confirmarDelete} disabled={deletando} className="produtos-view__confirm-btn-excluir">{deletando ? "Excluindo..." : "Sim, excluir"}</button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
  );
}
