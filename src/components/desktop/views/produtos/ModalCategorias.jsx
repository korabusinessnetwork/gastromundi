import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { CATS_FIXAS } from "@/lib/categoriasProduto";
import { LuTag, LuPencil, LuTrash2, LuCheck, LuX as LuXIcon } from "react-icons/lu";
import { CAT_SEM_CATEGORIA } from "./apoio";

// Janela de gerenciar as categorias personalizadas.
export default function ModalCategorias({ tela }) {
  const {
    products, setShowCatModal, catEditando, setCatEditando, catNova, setCatNova, catOpLoading, setCatConfirmDelete, catErro, catExtraCarregado, criarCategoria, renomearCategoria, categorias,
  } = tela;
  return createPortal(
        <div {...fecharAoClicarFora(() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); })} className="produtos-view__confirm-overlay" style={{ background: "rgba(0,0,0,0.7)" }}>
          <div className="produtos-view__cat-modal">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="produtos-view__cat-modal-titulo" style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><LuTag size={18} color={varColor(C.accent)} /> Categorias</div>
                <div className="produtos-view__cat-modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>{categorias.length} categoria{categorias.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); }} style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", lineHeight: 0, padding: 4 }}><LuXIcon size={20} /></button>
            </div>
            {catErro && (
              <div className="produtos-view__cat-erro" role="alert">⚠️ {catErro}</div>
            )}
            <div className="produtos-view__cat-lista">
              {categorias.length === 0 && <div className="produtos-view__cat-vazio" style={{ color: varColor(C.muted), textAlign: "center", padding: 24 }}>Nenhuma categoria ainda.</div>}
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
                  <div key={cat} className="produtos-view__cat-item" style={{ background: emEdicao ? "var(--gm-alow)" : varColor(C.surface), borderColor: emEdicao ? alfa(C.accent, "66") : varColor(C.border) }}>
                    {emEdicao ? (
                      <>
                        <input autoFocus value={catEditando.input} onChange={e => setCatEditando(v => ({ ...v, input: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") renomearCategoria(); if (e.key === "Escape") setCatEditando(null); }} className="produtos-view__cat-input-edicao" />
                        <button onClick={renomearCategoria} disabled={catOpLoading} className="produtos-view__cat-btn-confirmar"><LuCheck size={15} /></button>
                        <button onClick={() => setCatEditando(null)} className="produtos-view__cat-btn-cancelar-edicao"><LuXIcon size={15} /></button>
                      </>
                    ) : (
                      <>
                        <span className="produtos-view__cat-nome">{cat}</span>
                        {eCatFixa && <span className="produtos-view__cat-badge-padrao" style={{ background: alfa(C.accent, "15"), border: `1px solid ${alfa(C.accent, "33")}` }}>padrão</span>}
                        {eSemCategoria && <span className="produtos-view__cat-badge-padrao" style={{ background: alfa(C.blue, "15"), border: `1px solid ${alfa(C.blue, "33")}`, color: varColor(C.blue) }}>automática</span>}
                        <span className="produtos-view__cat-badge-qtd">{qtdProdutos} {qtdProdutos === 1 ? "produto" : "produtos"}</span>
                        {!eProtegida && <button onClick={() => setCatEditando({ name: cat, input: cat })} disabled={!catExtraCarregado || catOpLoading} className="produtos-view__cat-btn-editar" style={{ borderColor: varColor(C.border), color: varColor(C.muted), cursor: catExtraCarregado ? "pointer" : "not-allowed", opacity: catExtraCarregado ? 1 : 0.4 }}><LuPencil size={14} /></button>}
                        <button onClick={() => podeExcluir && setCatConfirmDelete(cat)} disabled={!podeExcluir || catOpLoading} className="produtos-view__cat-btn-excluir" style={{ borderColor: podeExcluir ? alfa(C.red, "55") : varColor(C.border), color: podeExcluir ? varColor(C.red) : varColor(C.border), cursor: podeExcluir ? "pointer" : "not-allowed", opacity: podeExcluir ? 1 : 0.4 }}><LuTrash2 size={14} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="produtos-view__cat-nova-secao">
              <div className="produtos-view__cat-nova-titulo">Nova Categoria</div>
              <div className="produtos-view__cat-nova-linha">
                <input value={catNova} onChange={e => setCatNova(e.target.value)} onKeyDown={e => e.key === "Enter" && criarCategoria()} placeholder="Ex: Bebidas, Lanches..." maxLength={40} className="produtos-view__cat-nova-input" style={{ borderColor: catNova.trim() ? varColor(C.accent) : "var(--gm-input-border)" }} />
                <button onClick={criarCategoria} disabled={!catNova.trim() || catOpLoading || !catExtraCarregado || categorias.includes(catNova.trim())} className="produtos-view__cat-nova-btn" style={{ background: catNova.trim() && !categorias.includes(catNova.trim()) ? varColor(C.accent) : varColor(C.surface), color: catNova.trim() && !categorias.includes(catNova.trim()) ? "#fff" : varColor(C.muted), cursor: catNova.trim() && !categorias.includes(catNova.trim()) ? "pointer" : "not-allowed" }}>
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
