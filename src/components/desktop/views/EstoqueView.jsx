import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { LuPackage, LuTriangleAlert, LuCircleAlert, LuMinus, LuPlus } from "react-icons/lu";

const LIMITE_BAIXO = 10;

function estoqueColor(qty) {
  if (qty === 0)          return C.red;
  if (qty <= LIMITE_BAIXO) return "#f59e0b";
  return C.green;
}

export default function EstoqueView() {
  const { products, estoque, updateEstoque } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [busca,      setBusca]      = useState("");
  const [categoria,  setCategoria]  = useState("Todos");
  const [salvando,   setSalvando]   = useState({});

  const categorias = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    return ["Todos", ...cats];
  }, [products]);

  const lista = useMemo(() => {
    let l = products;
    if (busca)              l = l.filter(p => p.name?.toLowerCase().includes(busca.toLowerCase()));
    if (categoria !== "Todos") l = l.filter(p => p.category === categoria);
    return l;
  }, [products, busca, categoria]);

  const totalItens  = products.reduce((s, p) => s + (estoque[p.id] ?? 0), 0);
  const semEstoque  = products.filter(p => (estoque[p.id] ?? 0) === 0).length;
  const estoqueBaixo = products.filter(p => { const q = estoque[p.id] ?? 0; return q > 0 && q <= LIMITE_BAIXO; }).length;

  const handleQty = async (productId, qty) => {
    setSalvando(prev => ({ ...prev, [productId]: true }));
    await updateEstoque(productId, qty);
    setSalvando(prev => ({ ...prev, [productId]: false }));
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Estoque</div>
        <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>
          Controle de quantidade dos produtos
        </div>
      </div>

      {/* KPIs */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
        gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
        flexShrink: 0,
      }}>
        {[
          { label: "Total em estoque",  value: totalItens,   color: C.green,   Icon: LuPackage       },
          { label: "Sem estoque",        value: semEstoque,   color: C.red,     Icon: LuTriangleAlert },
          { label: "Estoque baixo",      value: estoqueBaixo, color: "#f59e0b", Icon: LuCircleAlert   },
        ].map(k => (
          <div key={k.label} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 16, padding: `${sz.padSm + 2}px ${sz.pad - 4}px`,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <k.Icon size={sz.fontXl - 4} color={k.color} />
            <div>
              <div style={{ fontWeight: 900, fontSize: sz.fontXl - 2, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Busca + categorias */}
      <div style={{
        padding: `0 ${sz.pad}px ${sz.padSm}px`,
        display: "flex", gap: sz.gap, alignItems: "center",
        flexShrink: 0, flexWrap: "wrap",
      }}>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto..."
          style={{
            padding: "9px 14px", borderRadius: 10,
            border: `1px solid ${C.border}`, background: C.surface,
            color: C.text, fontSize: sz.fontBase,
            fontFamily: "inherit", outline: "none", width: 220,
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoria(cat)}
              style={{
                padding: "7px 14px", borderRadius: 20, border: "none",
                background: categoria === cat ? C.accent : C.surface,
                color: categoria === cat ? "#fff" : C.muted,
                cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {lista.length === 0 ? (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 10, color: C.muted, padding: 60,
          }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📦</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhum produto encontrado</div>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Produto", "Categoria", "Preço", "Quantidade"].map((h, i) => (
                    <th key={i} style={{
                      padding: "12px 16px", textAlign: i === 3 ? "center" : "left",
                      fontSize: 11, fontWeight: 700, color: C.muted,
                      textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const qty   = estoque[p.id] ?? 0;
                  const cor   = estoqueColor(qty);
                  const busy  = salvando[p.id];
                  return (
                    <tr
                      key={p.id}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                    >
                      {/* Produto */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 22 }}>{p.emoji ?? "📦"}</span>
                          <span style={{ fontWeight: 700, fontSize: sz.fontBase }}>{p.name}</span>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td style={{ padding: "14px 16px" }}>
                        {p.category && (
                          <span style={{
                            fontSize: sz.fontSm, fontWeight: 600,
                            background: `${C.accent}18`, color: C.accent,
                            padding: "3px 10px", borderRadius: 20,
                          }}>
                            {p.category}
                          </span>
                        )}
                      </td>

                      {/* Preço */}
                      <td style={{ padding: "14px 16px", fontSize: sz.fontBase, color: C.muted }}>
                        R$ {Number(p.price).toFixed(2)}
                      </td>

                      {/* Quantidade */}
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                          <button
                            onClick={() => handleQty(p.id, qty - 1)}
                            disabled={qty === 0 || busy}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              border: `1px solid ${C.border}`, background: C.surface,
                              color: C.text, cursor: qty > 0 ? "pointer" : "not-allowed",
                              fontWeight: 800, fontSize: 18,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              opacity: qty === 0 ? 0.4 : 1,
                            }}
                          >
                            <LuMinus size={14} />
                          </button>

                          <input
                            type="number"
                            min="0"
                            value={qty}
                            onChange={e => handleQty(p.id, parseInt(e.target.value) || 0)}
                            style={{
                              width: 64, textAlign: "center",
                              padding: "6px 8px", borderRadius: 8,
                              border: `1.5px solid ${cor}66`,
                              background: `${cor}12`,
                              color: cor, fontWeight: 800,
                              fontSize: sz.fontBase + 1,
                              fontFamily: "inherit", outline: "none",
                              MozAppearance: "textfield",
                              appearance: "textfield",
                            }}
                          />

                          <button
                            onClick={() => handleQty(p.id, qty + 1)}
                            disabled={busy}
                            style={{
                              width: 32, height: 32, borderRadius: 8,
                              border: `1px solid ${C.border}`, background: C.surface,
                              color: C.text, cursor: "pointer",
                              fontWeight: 800, fontSize: 18,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            <LuPlus size={14} />
                          </button>

                          <span style={{
                            fontSize: sz.fontSm, fontWeight: 700, color: cor,
                            minWidth: 60,
                          }}>
                            {qty === 0 ? "Sem estoque" : qty <= LIMITE_BAIXO ? "Baixo" : "OK"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
