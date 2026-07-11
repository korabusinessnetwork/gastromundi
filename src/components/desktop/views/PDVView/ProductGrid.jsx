import { useState } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import "./ProductGrid.css";

export default function ProductGrid({ products, onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const categorias = ["Todos", ...new Set(products.map(p => p.category))];
  const [catAtiva, setCatAtiva] = useState("Todos");

  const filtrados = catAtiva === "Todos"
    ? products
    : products.filter(p => p.category === catAtiva);

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
        {filtrados.map(product => (
          <ProdutoCard key={product.id} product={product} onAdd={onAdd} sz={sz} />
        ))}
        {filtrados.length === 0 && (
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
