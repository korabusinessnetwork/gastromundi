import { useState, useMemo } from "react";
import { useCatalogo } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";

// ── Aba Grupos de Categoria (C3) ──────────────────────────────────
// Mapeia cada categoria de produto (texto livre) a um grupo (comida/bebida/
// sobremesa/cafe…). O Palm usa isso no Radar de Oportunidades para sugerir a
// venda que falta (comida sem bebida, comida sem sobremesa). Padrão das outras
// tabs. Os grupos disponíveis vêm de grupos_categoria (semeados por tenant).
export default function CategoriasGrupoTab({ sz }) {
  const { products, gruposCategoria, categoriaGrupos, setCategoriaGrupo } = useCatalogo();
  const [salvandoCat, setSalvandoCat] = useState(null);

  // categorias existentes nos produtos (texto livre), únicas e ordenadas
  const categorias = useMemo(
    () => [...new Set(products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [products],
  );
  const grupoPorCategoria = useMemo(() => {
    const m = {};
    for (const r of categoriaGrupos) m[r.category] = r.grupo_id;
    return m;
  }, [categoriaGrupos]);

  const handleChange = async (category, grupoId) => {
    setSalvandoCat(category);
    await setCategoriaGrupo(category, grupoId === "" ? null : Number(grupoId));
    setSalvandoCat(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.padSm }}>
      <div className="geral-tab__card" style={{ padding: sz.pad, flexDirection: "column", alignItems: "stretch", gap: 4 }}>
        <div className="geral-tab__titulo">Radar de Oportunidades</div>
        <div className="geral-tab__ajuda">
          Defina o que é comida, bebida e sobremesa: associe cada categoria a um grupo.
          O Palm usa isso no Painel do garçom para avisar a venda que falta (ex.:
          "pediu comida e não pediu bebida e sobremesa"). Categoria sem grupo é
          ignorada pelo radar.
        </div>
      </div>

      {categorias.length === 0 ? (
        <div className="categorias-grupo-tab__vazio" style={{ padding: sz.pad, color: varColor(C.muted) }}>
          Nenhuma categoria de produto cadastrada ainda.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categorias.map(cat => (
            <div key={cat} className="geral-tab__card" style={{ padding: sz.padSm + 4, gap: sz.padSm }}>
              <div className="categorias-grupo-tab__cat-nome" style={{ flex: 1, fontWeight: 700 }}>{cat}</div>
              <select
                value={grupoPorCategoria[cat] ?? ""}
                onChange={e => handleChange(cat, e.target.value)}
                disabled={salvandoCat === cat}
                className="categorias-grupo-tab__select-grupo"
                style={{
                  padding: "9px 12px", borderRadius: 10,
                  border: `1.5px solid ${grupoPorCategoria[cat] ? varColor(C.accent) : "var(--gm-input-border)"}`,
                  background: "var(--gm-input-bg)", color: varColor(C.text),
                  fontFamily: "inherit", outline: "none", cursor: "pointer",
                }}
              >
                <option value="">, sem grupo, </option>
                {gruposCategoria.map(g => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
