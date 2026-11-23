import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { labelEstoque, getUnidadesCompra } from "@/utils/conversaoUnidades";
import { LuTag } from "react-icons/lu";
import SubprodutosView from "./SubprodutosView";
import CombosView from "./CombosView";
import CategoriasComBusca from "./produtos/CategoriasComBusca";
import { useProdutos } from "@/features/cardapio/hooks/useProdutos";
import ModalCadastroProduto from "./produtos/ModalCadastroProduto";
import ModalCategorias from "./produtos/ModalCategorias";
import ConfirmarExclusaoCategoria from "./produtos/ConfirmarExclusaoCategoria";
import ConfirmarExclusaoProduto from "./produtos/ConfirmarExclusaoProduto";
import "./ProdutosView.css";

export default function ProdutosView() {
  const tela = useProdutos();
  const {
    modal, deleteId, setDeleteId, catFiltro, setCatFiltro, busca, setBusca, abaAtiva, setAbaAtiva, products, showCatModal, setShowCatModal, catConfirmDelete, sz, carregando, categorias, produtosFiltrados, abrirNovo, abrirEditar, isAdmin, ABAS,
  } = tela;

  return (
    <div className="produtos-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="produtos-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="produtos-view__titulo" style={{ fontWeight: 800 }}>Produtos</div>
          <div className="produtos-view__contagem">
            {carregando ? "Carregando…" : `${products.length} cadastrado${products.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        <div className="produtos-view__acoes">
          {isAdmin && abaAtiva === "produtos" && (
            <>
              <button onClick={() => setShowCatModal(true)} className="produtos-view__btn-categorias" style={{ padding: `9px ${sz.pad - 8}px` }}>
                <LuTag size={15} /> Categorias
              </button>
              <button onClick={() => abrirNovo(true)} className="produtos-view__btn-insumo" style={{ padding: `9px ${sz.pad - 8}px`, borderColor: varColor(C.green), background: alfa(C.green, "12"), color: varColor(C.green) }}>
                + Novo Insumo
              </button>
              <button onClick={() => abrirNovo(false, true)} className="produtos-view__btn-producao" style={{ padding: `9px ${sz.pad - 8}px`, borderColor: varColor(C.blue), background: alfa(C.blue, "12"), color: varColor(C.blue) }}>
                + Item de Produção
              </button>
              <button onClick={() => abrirNovo(false)} className="produtos-view__btn-novo" style={{ padding: `9px ${sz.pad - 8}px` }}>
                + Novo Produto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="produtos-view__abas" style={{ padding: `0 ${sz.pad}px` }}>
        {ABAS.map(aba => {
          const ativo = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className="produtos-view__aba"
              style={{ borderBottom: ativo ? `2px solid var(${C.accent})` : "2px solid transparent", color: ativo ? varColor(C.accent) : varColor(C.muted), fontWeight: ativo ? 700 : 500 }}
            >
              {aba.label}
            </button>
          );
        })}
      </div>

      {/* Subprodutos */}
      {abaAtiva === "subprodutos" && <SubprodutosView sz={sz} />}

      {/* Combos */}
      {abaAtiva === "combos" && <CombosView sz={sz} />}

      {/* Produtos — Categorias + Busca + Tabela */}
      {abaAtiva === "produtos" && <>

      <CategoriasComBusca
        categorias={categorias}
        catFiltro={catFiltro}
        setCatFiltro={setCatFiltro}
        busca={busca}
        setBusca={setBusca}
        sz={sz}
      />

      {/* Tabela */}
      <div className="produtos-view__tabela-area">
        {carregando ? (
          <div className="produtos-view__vazio" role="status">
            <div className="produtos-view__vazio-emoji" style={{ opacity: 0.3 }}>⏳</div>
            <div className="produtos-view__vazio-titulo" style={{ fontWeight: 600 }}>Carregando os produtos…</div>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="produtos-view__vazio">
            <div className="produtos-view__vazio-emoji" style={{ opacity: 0.3 }}>📦</div>
            <div className="produtos-view__vazio-titulo" style={{ fontWeight: 600 }}>{busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
            {isAdmin && !busca && <div className="produtos-view__vazio-texto">Clique em "+ Novo Produto" para adicionar</div>}
          </div>
        ) : (
          <table className="produtos-view__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                {["", "Nome", "Categoria", "Unidade", "Preço", ""].map((h, i) => (
                  // TD015: cabeçalho literal da tabela de produtos, não vem de dado.
                  <th key={i} className="produtos-view__th" style={{ padding: `12px ${i === 0 ? sz.pad : 16}px`, textAlign: i >= 4 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const units = getUnidadesCompra(p);
                return (
                  <tr key={p.id} className="produtos-view__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td className="produtos-view__td-emoji" style={{ padding: `14px ${sz.pad}px` }}>
                      <div className="produtos-view__emoji-box">{p.emoji || "📦"}</div>
                    </td>
                    <td className="produtos-view__td">
                      <div className="produtos-view__nome">{p.name}</div>
                      {(p.unidade_consumo || units.length > 0) && (
                        <div className="produtos-view__conversoes">
                          {p.unidade_consumo && <span>consumo: {p.unidade_consumo}</span>}
                          {units.length > 0 && <span>compra: {units.map(u => u.unidade).join(", ")}</span>}
                        </div>
                      )}
                    </td>
                    <td className="produtos-view__td">
                      <span className="produtos-view__tag-categoria">{p.category}</span>
                    </td>
                    <td className="produtos-view__td">
                      <span className="produtos-view__tag-unidade" style={{ background: alfa(C.accent, "12"), border: `1px solid ${alfa(C.accent, "33")}` }}>{labelEstoque(p)}</span>
                    </td>
                    <td className="produtos-view__td" style={{ textAlign: "right" }}>
                      <span className="produtos-view__preco">R$ {Number(p.price).toFixed(2)}</span>
                    </td>
                    <td className="produtos-view__td" style={{ paddingRight: 24, textAlign: "right", whiteSpace: "nowrap" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(p)} className="produtos-view__btn-editar">Editar</button>
                          <button onClick={() => setDeleteId(p.id)} className="produtos-view__btn-excluir" style={{ borderColor: alfa(C.red, "44"), background: alfa(C.red, "0f"), color: varColor(C.red) }}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>}

      {/* ── Modal Novo / Editar ── */}
      {modal && <ModalCadastroProduto tela={tela} />}

      {/* Modal Gerenciar Categorias */}
      {showCatModal && <ModalCategorias tela={tela} />}

      {/* Modal Confirmar Exclusão de Categoria */}
      {catConfirmDelete && <ConfirmarExclusaoCategoria tela={tela} />}

      {/* Modal Confirmar Exclusão */}
      {deleteId && <ConfirmarExclusaoProduto tela={tela} />}
    </div>
  );
}
