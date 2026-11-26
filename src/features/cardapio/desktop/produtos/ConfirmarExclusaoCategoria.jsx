import { createPortal } from "react-dom";
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
                  <div className="produtos-view__confirm-icone produtos-view__confirm-icone--perigo">
                    <LuTrash2 size={22} />
                  </div>
                  <div>
                    <div className="produtos-view__confirm-titulo">Excluir categoria?</div>
                    <div className="produtos-view__confirm-sub">Categoria: <strong className="produtos-view__destaque">{catConfirmDelete}</strong></div>
                  </div>
                </div>
                {temProdutos ? (
                  <div className="produtos-view__confirm-aviso produtos-view__confirm-aviso--info">
                    {qtd === 1 ? "O produto desta categoria será movido" : <>Os <strong className="produtos-view__destaque produtos-view__destaque--info">{qtd} produtos</strong> desta categoria serão movidos</>} para <strong className="produtos-view__destaque">{CAT_SEM_CATEGORIA}</strong>. Nenhum produto será excluído.
                  </div>
                ) : (
                  <div className="produtos-view__confirm-aviso produtos-view__confirm-aviso--perigo">
                    A categoria está vazia e será removida.
                  </div>
                )}
                <div className="produtos-view__confirm-botoes">
                  <button onClick={() => setCatConfirmDelete(null)} className="produtos-view__confirm-btn-cancelar">Cancelar</button>
                  <button
                    onClick={async () => { await excluirCategoria(catConfirmDelete); setCatConfirmDelete(null); }}
                    disabled={catOpLoading}
                    className="produtos-view__confirm-btn-excluir"
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
