import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { LuTrash2 } from "react-icons/lu";
import { CAT_SEM_CATEGORIA } from "./apoio";

// Confirmação antes de excluir uma categoria.
export default function ConfirmarExclusaoCategoria({ tela }) {
  const {
    products, catOpLoading, catConfirmDelete, setCatConfirmDelete, excluirCategoria,
  } = tela;
  return createPortal(
        (() => {
          const qtd = products.filter(p => p.category === catConfirmDelete).length;
          const temProdutos = qtd > 0;
          return (
            <div {...fecharAoClicarFora(() => setCatConfirmDelete(null))} className="produtos-view__confirm-overlay">
              <div className="produtos-view__confirm-modal">
                <div className="produtos-view__confirm-topo">
                  <div className="produtos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                    <LuTrash2 size={22} color={varColor(C.red)} />
                  </div>
                  <div>
                    <div className="produtos-view__confirm-titulo">Excluir categoria?</div>
                    <div className="produtos-view__confirm-sub">Categoria: <strong style={{ color: varColor(C.text) }}>{catConfirmDelete}</strong></div>
                  </div>
                </div>
                {temProdutos ? (
                  <div className="produtos-view__confirm-aviso" style={{ background: alfa(C.blue, "0d"), border: `1px solid ${alfa(C.blue, "33")}` }}>
                    {qtd === 1 ? "O produto desta categoria será movido" : <>Os <strong style={{ color: varColor(C.blue) }}>{qtd} produtos</strong> desta categoria serão movidos</>} para <strong style={{ color: varColor(C.text) }}>{CAT_SEM_CATEGORIA}</strong>. Nenhum produto será excluído.
                  </div>
                ) : (
                  <div className="produtos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
                    A categoria está vazia e será removida.
                  </div>
                )}
                <div className="produtos-view__confirm-botoes">
                  <button onClick={() => setCatConfirmDelete(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
                  <button
                    onClick={async () => { await excluirCategoria(catConfirmDelete); setCatConfirmDelete(null); }}
                    disabled={catOpLoading}
                    className="produtos-view__confirm-btn-excluir"
                    style={{ background: catOpLoading ? varColor(C.faint) : varColor(C.red), cursor: catOpLoading ? "not-allowed" : "pointer" }}
                  >
                    {catOpLoading ? "Excluindo..." : temProdutos ? "Mover e excluir" : "Sim, excluir"}
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
  );
}
