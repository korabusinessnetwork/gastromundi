import { LuShoppingBag, LuShoppingCart } from "react-icons/lu";
import { totalItensAtivos } from "@/features/comandas/regras/comandaItens";
import ProductGrid   from "../ProductGrid";
import CartPanel     from "../CartPanel";

// Área do pedido: produtos, carrinho e as ações da comanda aberta.
export default function AreaPedido({ tela }) {
  const {
    selected, setSelected, cartItems, salvando, abaAtiva, setAbaAtiva, combos, currentUser,
    products, updatePending, isMob, handleAddProduct, handleChangeQty, handleChangeObs,
    handleLancar, handleFinalizar, notify,
  } = tela;
  return (
          <>
            {/* Tab bar — só no mobile */}
            {isMob && (
              <div className="pdv__mobile-tabs">
                {[
                  { key: "produtos",  label: "Produtos",  Icon: LuShoppingBag },
                  { key: "carrinho", label: `Carrinho${cartItems.length > 0 ? ` (${cartItems.length})` : ""}`, Icon: LuShoppingCart },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setAbaAtiva(key)}
                    className={`pdv__mobile-tab-btn${abaAtiva === key ? " pdv__mobile-tab-btn--ativa" : ""}`}
                  >
                    <Icon size={15} />{label}
                  </button>
                ))}
              </div>
            )}

            {/* Produtos */}
            {(!isMob || abaAtiva === "produtos") && (
              <div className="pdv__produtos-area">
                <ProductGrid products={products} combos={combos} onAdd={handleAddProduct} />
              </div>
            )}

            {/* Carrinho */}
            {(!isMob || abaAtiva === "carrinho") && (
              <CartPanel
                comanda={selected}
                items={cartItems}
                onChangeQty={handleChangeQty}
                onChangeObs={handleChangeObs}
                onLancar={handleLancar}
                onFinalizar={handleFinalizar}
                salvando={salvando}
                onRemoveAcumulado={async (idx, qty, motivo) => {
                  const novos = selected.items.map((it, i) => {
                    if (i !== idx) return it;
                    const novaQty = (it.qty ?? 1) - qty;
                    if (novaQty > 0) {
                      // cancela parcialmente: divide em ativo + cancelado
                      return [
                        { ...it, qty: novaQty },
                        { ...it, qty, cancelado: true, motivoCancelamento: motivo || "", canceladoPor: currentUser?.name || "" },
                      ];
                    }
                    return { ...it, cancelado: true, motivoCancelamento: motivo || "", canceladoPor: currentUser?.name || "" };
                  }).flat();
                  const novoTotal = totalItensAtivos(novos);
                  const { error } = await updatePending(selected.id, { items: novos, total: novoTotal }, { baseItems: selected.items });
                  if (error) {
                    notify?.("Não foi possível cancelar o item. Tente novamente.", "err");
                    return;
                  }
                  setSelected(prev => ({ ...prev, items: novos, total: novoTotal }));
                }}
              />
            )}
          </>
  );
}
