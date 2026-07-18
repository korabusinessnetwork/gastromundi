import { useState } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { montarItemCombo } from "@/lib/combos";
import "./ProductGrid.css";

export default function ProductGrid({ products, combos = [], onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const categorias = ["Todos", ...new Set(products.map(p => p.category))];
  const [catAtiva, setCatAtiva] = useState("Todos");

  const filtrados = catAtiva === "Todos"
    ? products
    : products.filter(p => p.category === catAtiva);

  // B4 — combos entram na grade junto do produto principal, na mesma
  // categoria (o operador acha o combo onde procuraria o produto):
  // modo "combo" vira um card extra ao lado; modo "substituir" toma o
  // lugar do card do principal enquanto o combo estiver ativo.
  const cards = [];
  for (const produto of filtrados) {
    const doProduto = combos.filter(c => String(c.item_principal_id) === String(produto.id));
    const substituto = doProduto.find(c => c.modo === "substituir");
    if (!substituto) cards.push({ tipo: "produto", produto });
    for (const combo of doProduto) {
      cards.push({ tipo: "combo", combo, produto });
    }
  }

  return (
    <div className="produto-grid">

      {/* Filtro de categorias */}
      <div className="produto-grid__filtro" style={{ gap: sz.gap - 4, padding: `${sz.padSm}px ${sz.pad}px` }}>
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => setCatAtiva(cat)}
            className={`produto-grid__chip${catAtiva === cat ? " produto-grid__chip--ativo" : ""}`}
            style={{ padding: `${sz.padSm - 4}px ${sz.pad - 4}px`, fontSize: sz.fontBase }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid de produtos */}
      <div
        className="produto-grid__lista"
        style={{
          padding: `${sz.pad}px`,
          gridTemplateColumns: `repeat(auto-fill, minmax(${sz.productCardMin}px, 1fr))`,
          gap: sz.gap - 2,
        }}
      >
        {cards.map(card => card.tipo === "produto" ? (
          <ProdutoCard key={card.produto.id} product={card.produto} onAdd={onAdd} sz={sz} />
        ) : (
          <ComboCard key={`combo-${card.combo.id}`} combo={card.combo} produto={card.produto} onAdd={onAdd} sz={sz} />
        ))}
        {cards.length === 0 && (
          <div className="produto-grid__vazio" style={{ fontSize: 17 }}>
            Nenhum produto nesta categoria
          </div>
        )}
      </div>
    </div>
  );
}

function ProdutoCard({ product, onAdd, sz }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    onAdd(product);
    setTimeout(() => setPressed(false), 150);
  };

  return (
    <button
      onClick={handleClick}
      className={`produto-card${pressed ? " produto-card--pressed" : ""}`}
      style={{ padding: `${sz.pad - 2}px ${sz.padSm}px`, gap: sz.gap - 8 }}
    >
      {product.emoji && (
        <div style={{ fontSize: sz.fontXl - 4 }}>{product.emoji}</div>
      )}
      <div className="produto-card__nome" style={{ fontSize: sz.fontBase }}>
        {product.name}
      </div>
      <div className="produto-card__preco" style={{ fontSize: sz.fontBase + 1 }}>
        R$ {Number(product.price).toFixed(2)}
      </div>
    </button>
  );
}

function ComboCard({ combo, produto, onAdd, sz }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    const item = montarItemCombo(combo);
    if (!item) return;
    setPressed(true);
    // Emoji/categoria do principal para o carrinho ficar reconhecível
    onAdd({ ...item, emoji: produto?.emoji, category: produto?.category });
    setTimeout(() => setPressed(false), 150);
  };

  const itens = (combo.combo_subprodutos ?? [])
    .filter(cs => cs?.subprodutos?.nome)
    .map(cs => (Number(cs.quantidade ?? 1) > 1 ? `${cs.quantidade}× ${cs.subprodutos.nome}` : cs.subprodutos.nome));

  return (
    <button
      onClick={handleClick}
      className={`produto-card produto-card--combo${pressed ? " produto-card--pressed" : ""}`}
      style={{ padding: `${sz.pad - 2}px ${sz.padSm}px`, gap: sz.gap - 8 }}
    >
      <div className="produto-card__badge-combo" style={{ fontSize: sz.fontSm - 2 }}>COMBO</div>
      <div className="produto-card__nome" style={{ fontSize: sz.fontBase }}>
        {combo.nome}
      </div>
      {itens.length > 0 && (
        <div className="produto-card__combo-itens" style={{ fontSize: sz.fontSm - 1 }}>
          {produto?.name ? `${produto.name} + ` : ""}{itens.join(" + ")}
        </div>
      )}
      <div className="produto-card__preco" style={{ fontSize: sz.fontBase + 1 }}>
        R$ {Number(combo.preco_total ?? 0).toFixed(2)}
      </div>
    </button>
  );
}
