import { labelEstoque, getUnidadesCompra } from "@/utils/conversaoUnidades";
import { LuTag, LuHourglass, LuPackage } from "react-icons/lu";
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
    <div className="produtos-view" style={{ "--produtos-pad": `${sz.pad}px` }}>

      {/* Header */}
      <div className="produtos-view__header">
        <div>
          <div className="produtos-view__titulo">Produtos</div>
          <div className="produtos-view__contagem">
            {carregando ? "Carregando…" : `${products.length} cadastrado${products.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        <div className="produtos-view__acoes">
          {isAdmin && abaAtiva === "produtos" && (
            <>
              <button onClick={() => setShowCatModal(true)} className="produtos-view__btn-categorias produtos-view__btn-topo">
                <LuTag size={15} /> Categorias
              </button>
              <button onClick={() => abrirNovo(true)} className="produtos-view__btn-insumo produtos-view__btn-topo">
                + Novo Insumo
              </button>
              <button onClick={() => abrirNovo(false, true)} className="produtos-view__btn-producao produtos-view__btn-topo">
                + Item de Produção
              </button>
              <button onClick={() => abrirNovo(false)} className="produtos-view__btn-novo produtos-view__btn-topo">
                + Novo Produto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="produtos-view__abas">
        {ABAS.map(aba => {
          const ativo = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              onClick={() => setAbaAtiva(aba.id)}
              className={`produtos-view__aba${ativo ? " produtos-view__aba--ativa" : ""}`}
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
            <div className="produtos-view__vazio-emoji"><LuHourglass aria-hidden="true" /></div>
            <div className="produtos-view__vazio-titulo">Carregando os produtos…</div>
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="produtos-view__vazio">
            <div className="produtos-view__vazio-emoji"><LuPackage aria-hidden="true" /></div>
            <div className="produtos-view__vazio-titulo">{busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
            {isAdmin && !busca && <div className="produtos-view__vazio-texto">Clique em "+ Novo Produto" para adicionar</div>}
          </div>
        ) : (
          <table className="produtos-view__tabela">
            <thead>
              <tr className="produtos-view__thead-tr">
                {["", "Nome", "Categoria", "Unidade", "Preço", ""].map((h, i) => (
                  // TD015: cabeçalho literal da tabela de produtos, não vem de dado.
                  <th key={i} className={`produtos-view__th produtos-view__th--${i >= 4 ? "direita" : "esquerda"}${i === 0 ? " produtos-view__th--primeira" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const units = getUnidadesCompra(p);
                return (
                  <tr key={p.id} className="produtos-view__tr">
                    <td className="produtos-view__td-emoji">
                      <div className="produtos-view__emoji-box"><LuPackage aria-hidden="true" /></div>
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
                      <span className="produtos-view__tag-unidade">{labelEstoque(p)}</span>
                    </td>
                    <td className="produtos-view__td produtos-view__td--direita">
                      <span className="produtos-view__preco">R$ {Number(p.price).toFixed(2)}</span>
                    </td>
                    <td className="produtos-view__td produtos-view__td--acoes">
                      {isAdmin && (
                        <div className="produtos-view__linha-acoes">
                          <button onClick={() => abrirEditar(p)} className="produtos-view__btn-editar">Editar</button>
                          <button onClick={() => setDeleteId(p.id)} className="produtos-view__btn-excluir">Excluir</button>
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
