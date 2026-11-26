import { useState } from "react";
import { logAction } from "@/lib/logger";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuDownload, LuPlus, LuHourglass, LuBike } from "react-icons/lu";
import {
  salvarProdutoDelivery, removerProdutoDelivery, importarProdutosDelivery
} from "@/features/delivery/deliveryAdmin";
import CardProduto from "./CardProduto";
import ModalProduto from "./ModalProduto";

// ════════════════════════════════════════════════════════════════
// ABA 1 — Cardápio (importação no addon / cadastro no standalone)
// ════════════════════════════════════════════════════════════════
export default function AbaCardapio({
  isAdmin, ehAddon, carregando, itens, faltamImportar,
  products, linhas, tenant, addProduct, updateProduct, recarregarProdutos, currentUser, aviso, recarregar,
}) {
  const [importando, setImportando] = useState(false);
  const [modal, setModal] = useState(null); // { modo:'novo'|'editar', item? }

  const importar = async () => {
    if (importando || faltamImportar.length === 0) return;
    setImportando(true);
    const { data, error } = await importarProdutosDelivery(products, linhas);
    setImportando(false);
    if (error) {
      aviso("Não foi possível importar agora. Tente novamente.", "err");
      return;
    }
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
          <button
            onClick={importar}
            disabled={importando || faltamImportar.length === 0}
            className="delivery-view__btn delivery-view__btn--importar delivery-view__btn--acao-topo"
          >
            <LuDownload size={15} />
            {importando ? "Importando…" : faltamImportar.length > 0 ? `Importar ${faltamImportar.length}` : "Importado"}
          </button>
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
          {itens.map((it) => (
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
        </div>
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
