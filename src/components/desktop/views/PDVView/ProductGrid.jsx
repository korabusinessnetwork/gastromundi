import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";

export default function ProductGrid({ products, onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const categorias = ["Todos", ...new Set(products.map(p => p.category))];
  const [catAtiva, setCatAtiva] = useState("Todos");

  const filtrados = catAtiva === "Todos"
    ? products
    : products.filter(p => p.category === catAtiva);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Filtro de categorias */}
      <div style={{
        display: "flex", gap: sz.gap - 4, padding: `${sz.padSm}px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        overflowX: "auto", flexShrink: 0,
      }}>
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => setCatAtiva(cat)}
            style={{
              padding: `${sz.padSm - 4}px ${sz.pad - 4}px`, borderRadius: 20, border: "none",
              background: catAtiva === cat ? C.accent : C.surface,
              color: catAtiva === cat ? "#fff" : C.muted,
              cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase,
              whiteSpace: "nowrap", flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid de produtos */}
      <div style={{
        flex: 1, overflowY: "auto", padding: `${sz.pad}px`,
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${sz.productCardMin}px, 1fr))`,
        gap: sz.gap - 2, alignContent: "start",
      }}>
        {filtrados.map(product => (
          <ProdutoCard key={product.id} product={product} onAdd={onAdd} sz={sz} />
        ))}
        {filtrados.length === 0 && (
          <div style={{
            gridColumn: "1 / -1", color: C.muted,
            fontSize: 14, textAlign: "center", padding: 32,
          }}>
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
      style={{
        background: pressed ? C.alow : C.card,
        border: `1.5px solid ${pressed ? C.accent : C.border}`,
        borderRadius: 14, padding: `${sz.pad - 2}px ${sz.padSm}px`,
        cursor: "pointer", textAlign: "left", color: C.text,
        transition: "border-color 0.1s, background 0.1s",
        display: "flex", flexDirection: "column", gap: sz.gap - 8,
        width: "100%",
      }}
    >
      {product.emoji && (
        <div style={{ fontSize: sz.fontXl - 4 }}>{product.emoji}</div>
      )}
      <div style={{ fontWeight: 700, fontSize: sz.fontBase, lineHeight: 1.3 }}>
        {product.name}
      </div>
      <div style={{ color: C.green, fontWeight: 800, fontSize: sz.fontBase + 1, marginTop: "auto" }}>
        R$ {Number(product.price).toFixed(2)}
      </div>
    </button>
  );
}
