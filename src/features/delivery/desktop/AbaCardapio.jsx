import { useState, useMemo } from "react";
import { logAction } from "@/features/auditoria/dados/logger";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuDownload, LuPlus, LuHourglass, LuBike } from "react-icons/lu";
import {
  salvarProdutoDelivery, removerProdutoDelivery, importarProdutosDelivery
} from "@/features/delivery/deliveryAdmin";
import CardProduto from "./CardProduto";
import ModalProduto from "./ModalProduto";
import ModalImportar from "@/features/delivery/desktop/ModalImportar";

// ════════════════════════════════════════════════════════════════
// ABA 1 — Cardápio (importação no addon / cadastro no standalone)
// ════════════════════════════════════════════════════════════════
export default function AbaCardapio({
  isAdmin, ehAddon, carregando, itens, faltamImportar,
  products, linhas, tenant, addProduct, updateProduct, recarregarProdutos, currentUser, aviso, recarregar,
}) {
  const [importando, setImportando] = useState(false);
  const [escolhendoImport, setEscolhendoImport] = useState(false);
  const [modal, setModal] = useState(null); // { modo:'novo'|'editar', item? }
  // Busca e categoria do cardápio já publicado. Com trinta itens numa grade
  // de cinco colunas, achar "Coca" era rolar a tela procurando com o olho.
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("Todas");

  const categorias = useMemo(
    () => ["Todas", ...new Set(itens.map((it) => it.produto?.category).filter(Boolean))].sort(
      (a, b) => (a === "Todas" ? -1 : b === "Todas" ? 1 : a.localeCompare(b, "pt-BR")),
    ),
    [itens],
  );

  const itensFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(
      (it) =>
        (catFiltro === "Todas" || it.produto?.category === catFiltro) &&
        (!t || (it.produto?.name ?? "").toLowerCase().includes(t)),
    );
  }, [itens, busca, catFiltro]);

  const importar = async (ids) => {
    if (importando || faltamImportar.length === 0) return;
    setImportando(true);
    const { data, error } = await importarProdutosDelivery(products, linhas, ids);
    setImportando(false);
    if (error) {
      aviso("Não foi possível importar agora. Tente novamente.", "err");
      return;
    }
    setEscolhendoImport(false);
    logAction(currentUser?.username, "delivery:importar", {
      msg: `Importou ${data.importados} produto(s) do PDV para o delivery`,
      name: currentUser?.name, role: currentUser?.role,
    });
    aviso(`${data.importados} produto(s) importado(s) para o delivery.`, "ok");
    await recarregar();
  };

  return (
    <>
      {/* Ação principal por modo */}
      {isAdmin && ehAddon && (
        <div className="delivery-view__import">
          <div className="delivery-view__import-texto">
            <div className="delivery-view__import-titulo">
              <LuDownload size={16} color={varColor(C.blue)} /> Importar cardápio do PDV
            </div>
            <div className="delivery-view__import-desc">
              {faltamImportar.length > 0
                ? `Traz de uma vez os ${faltamImportar.length} produto(s) do sistema que ainda não estão no delivery. Depois é só colocar foto e descrição.`
                : "Tudo em dia, todos os produtos do PDV já estão no delivery."}
            </div>
          </div>
          <div className="delivery-view__import-acoes">
            <button
              onClick={() => setEscolhendoImport(true)}
              disabled={importando || faltamImportar.length === 0}
              className="delivery-view__btn delivery-view__btn--importar delivery-view__btn--acao-topo"
            >
              <LuDownload size={15} />
              {faltamImportar.length > 0 ? `Escolher e importar (${faltamImportar.length})` : "Importado"}
            </button>
            {/* Criar direto daqui, mesmo integrado ao PDV. Um item que só
                existe no delivery (combo do site, promoção da semana)
                obrigava a ir ao Cadastro Produtos, criar, voltar e
                importar. O produto nasce no PDV também — é o mesmo
                catálogo —, e já entra publicado no cardápio online. */}
            <button
              onClick={() => setModal({ modo: "novo" })}
              className="delivery-view__btn delivery-view__btn--primario delivery-view__btn--acao-topo"
            >
              <LuPlus size={15} /> Novo produto
            </button>
          </div>
        </div>
      )}

      {isAdmin && !ehAddon && (
        <div className="delivery-view__acao-topo">
          <button
            onClick={() => setModal({ modo: "novo" })}
            className="delivery-view__btn delivery-view__btn--primario delivery-view__btn--acao-topo"
          >
            <LuPlus size={15} /> Novo produto
          </button>
        </div>
      )}

      {/* Busca e categoria do que já está publicado. Só aparecem quando há
          o bastante para valer a pena procurar — num cardápio de cinco
          itens, dois campos de filtro são mais estorvo do que ajuda. */}
      {!carregando && itens.length > 8 && (
        <div className="delivery-view__filtros">
          <input
            className="delivery-view__input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no cardápio…"
            aria-label="Buscar no cardápio do delivery"
          />
          <select
            className="delivery-view__input"
            value={catFiltro}
            onChange={(e) => setCatFiltro(e.target.value)}
            aria-label="Filtrar o cardápio por categoria"
          >
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* Lista / estados */}
      {carregando ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji delivery-view__vazio-emoji--carregando"><LuHourglass aria-hidden="true" /></div>
          <div className="delivery-view__carregando">Carregando o cardápio…</div>
        </div>
      ) : itens.length === 0 ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuBike aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Nenhum produto no delivery ainda</div>
          <div className="delivery-view__vazio-desc">
            {ehAddon
              ? "Use “Importar cardápio do PDV” acima para trazer seus produtos."
              : "Clique em “Novo produto” para começar seu cardápio online."}
          </div>
        </div>
      ) : (
        <div className="delivery-view__cards">
          {itensFiltrados.map((it) => (
            <CardProduto
              key={it.id}
              item={it}
              isAdmin={isAdmin}
              ehAddon={ehAddon}
              onEditar={() => setModal({ modo: "editar", item: it })}
              onRemover={async () => {
                const { error } = await removerProdutoDelivery(it.id);
                if (error) return aviso("Não foi possível remover.", "err");
                aviso("Removido do delivery.", "ok");
                await recarregar();
              }}
              onToggle={async () => {
                const { error } = await salvarProdutoDelivery({
                  id: it.id, produto_id: it.produto_id,
                  foto_url: it.foto_url, descricao: it.descricao,
                  disponivel: !it.disponivel, ordem: it.ordem,
                });
                if (error) return aviso("Não foi possível atualizar.", "err");
                await recarregar();
              }}
            />
          ))}
          {itensFiltrados.length === 0 && (
            <div className="delivery-view__hint delivery-view__filtro-vazio">
              Nenhum produto com esse filtro. Limpe a busca ou troque a categoria.
            </div>
          )}
        </div>
      )}

      {escolhendoImport && (
        <ModalImportar
          candidatos={faltamImportar}
          importando={importando}
          onFechar={() => setEscolhendoImport(false)}
          onConfirmar={importar}
        />
      )}

      {modal && (
        <ModalProduto
          modo={modal.modo}
          item={modal.item}
          ehAddon={ehAddon}
          products={products}
          tenant={tenant}
          currentUser={currentUser}
          addProduct={addProduct}
          updateProduct={updateProduct}
          recarregarProdutos={recarregarProdutos}
          aviso={aviso}
          onFechar={() => setModal(null)}
          onSalvo={async () => {
            setModal(null);
            await recarregar();
          }}
        />
      )}
    </>
  );
}
