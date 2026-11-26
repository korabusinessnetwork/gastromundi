import { createPortal } from "react-dom";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { CATS_FIXAS } from "@/features/cardapio/regras/categoriasProduto";
import { LuTag, LuPencil, LuTrash2, LuCheck, LuX as LuXIcon, LuTriangleAlert } from "react-icons/lu";
import { CAT_SEM_CATEGORIA } from "./apoio";

// Janela de gerenciar as categorias personalizadas.
export default function ModalCategorias({ tela }) {
  const {
    products, setShowCatModal, catEditando, setCatEditando, catNova, setCatNova, catOpLoading, setCatConfirmDelete, catErro, catExtraCarregado, criarCategoria, renomearCategoria, categorias,
  } = tela;
  return createPortal(
        <div {...fecharAoClicarFora(() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); })} className="produtos-view__confirm-overlay produtos-view__confirm-overlay--claro">
          <div className="produtos-view__cat-modal">
            <div className="produtos-view__cat-modal-topo">
              <div>
                <div className="produtos-view__cat-modal-titulo"><LuTag size={18} className="produtos-view__secao-icone" /> Categorias</div>
                <div className="produtos-view__cat-modal-subtitulo">{categorias.length} categoria{categorias.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); }} className="produtos-view__cat-fechar"><LuXIcon size={20} /></button>
            </div>
            {catErro && (
              <div className="produtos-view__cat-erro" role="alert"><LuTriangleAlert size={14} className="gm-icone-texto" aria-hidden="true" /> {catErro}</div>
            )}
            <div className="produtos-view__cat-lista">
              {categorias.length === 0 && <div className="produtos-view__cat-vazio">Nenhuma categoria ainda.</div>}
              {categorias.map(cat => {
                const qtdProdutos = products.filter(p => p.category === cat).length;
                const emEdicao    = catEditando?.name === cat;
                const eCatFixa    = CATS_FIXAS.includes(cat);
                const eSemCategoria = cat === CAT_SEM_CATEGORIA;
                const eProtegida  = eCatFixa || eSemCategoria;
                // Sem a lista carregada não dá para editar nem excluir: qualquer
                // gravação apagaria as categorias que não conseguimos ler.
                const podeExcluir = !eProtegida && catExtraCarregado;
                return (
                  <div key={cat} className={`produtos-view__cat-item${emEdicao ? " produtos-view__cat-item--editando" : ""}`}>
                    {emEdicao ? (
                      <>
                        <input autoFocus value={catEditando.input} onChange={e => setCatEditando(v => ({ ...v, input: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") renomearCategoria(); if (e.key === "Escape") setCatEditando(null); }} className="produtos-view__cat-input-edicao" />
                        <button onClick={renomearCategoria} disabled={catOpLoading} className="produtos-view__cat-btn-confirmar"><LuCheck size={15} /></button>
                        <button onClick={() => setCatEditando(null)} className="produtos-view__cat-btn-cancelar-edicao"><LuXIcon size={15} /></button>
                      </>
                    ) : (
                      <>
                        <span className="produtos-view__cat-nome">{cat}</span>
                        {eCatFixa && <span className="produtos-view__cat-badge-padrao">padrão</span>}
                        {eSemCategoria && <span className="produtos-view__cat-badge-padrao produtos-view__cat-badge-padrao--automatica">automática</span>}
                        <span className="produtos-view__cat-badge-qtd">{qtdProdutos} {qtdProdutos === 1 ? "produto" : "produtos"}</span>
                        {!eProtegida && <button onClick={() => setCatEditando({ name: cat, input: cat })} disabled={!catExtraCarregado || catOpLoading} className={`produtos-view__cat-btn-editar${catExtraCarregado ? "" : " produtos-view__cat-btn--indisponivel"}`}><LuPencil size={14} /></button>}
                        <button onClick={() => podeExcluir && setCatConfirmDelete(cat)} disabled={!podeExcluir || catOpLoading} className={`produtos-view__cat-btn-excluir${podeExcluir ? " produtos-view__cat-btn-excluir--pode" : " produtos-view__cat-btn--indisponivel"}`}><LuTrash2 size={14} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="produtos-view__cat-nova-secao">
              <div className="produtos-view__cat-nova-titulo">Nova Categoria</div>
              <div className="produtos-view__cat-nova-linha">
                <input value={catNova} onChange={e => setCatNova(e.target.value)} onKeyDown={e => e.key === "Enter" && criarCategoria()} placeholder="Ex: Bebidas, Lanches..." maxLength={40} className={`produtos-view__cat-nova-input${catNova.trim() ? " produtos-view__cat-nova-input--preenchida" : ""}`} />
                <button onClick={criarCategoria} disabled={!catNova.trim() || catOpLoading || !catExtraCarregado || categorias.includes(catNova.trim())} className={`produtos-view__cat-nova-btn${catNova.trim() && !categorias.includes(catNova.trim()) ? " produtos-view__cat-nova-btn--pode" : ""}`}>
                  {catOpLoading ? "..." : "Adicionar"}
                </button>
              </div>
              {catNova.trim() && categorias.includes(catNova.trim()) && <div className="produtos-view__cat-aviso-existe">Esta categoria já existe.</div>}
            </div>
          </div>
        </div>,
        document.body
  );
}
