import { useState, useEffect, useRef } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { CATS_VISIVEIS } from "./apoio";

export default function CategoriasComBusca({ categorias, catFiltro, setCatFiltro, busca, setBusca, sz }) {
  const todas = ["Todos", ...categorias];
  const visiveis = todas.slice(0, CATS_VISIVEIS);
  const extras   = todas.slice(CATS_VISIVEIS);
  const [aberto, setAberto] = useState(false);
  const dropRef = useRef(null);

  // fecha dropdown ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  const btnCat = (cat, small = false) => {
    const ativo = catFiltro === cat;
    return (
      <button
        key={cat}
        onClick={() => { setCatFiltro(cat); setAberto(false); }}
        className="categorias-busca__cat"
        style={{
          padding: small ? "6px 14px" : "7px 18px",
          background: ativo ? varColor(C.accent) : varColor(C.surface),
          color: ativo ? "#fff" : varColor(C.muted),
          width: small ? "100%" : undefined,
        }}
      >
        {cat}
      </button>
    );
  };

  return (
    <div className="categorias-busca" style={{ padding: `12px ${sz.pad}px` }}>
      {/* Categorias visíveis */}
      <div className="categorias-busca__lista">
        {visiveis.map(cat => btnCat(cat))}

        {/* Botão "Mais categorias" */}
        {extras.length > 0 && (
          <div ref={dropRef} className="categorias-busca__mais-wrap">
            <button
              onClick={() => setAberto(v => !v)}
              className="categorias-busca__cat"
              style={{
                padding: "7px 18px",
                background: (aberto || extras.includes(catFiltro)) ? varColor(C.accent) : varColor(C.surface),
                color: (aberto || extras.includes(catFiltro)) ? "#fff" : varColor(C.muted),
              }}
            >
              {extras.includes(catFiltro) ? catFiltro : `+ ${extras.length} mais`} ▾
            </button>

            {aberto && (
              <div className="categorias-busca__mais-dropdown">
                {extras.map(cat => btnCat(cat, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campo de busca */}
      <input
        value={busca}
        onChange={e => setBusca(e.target.value)}
        placeholder="Buscar produto..."
        className="categorias-busca__input"
        style={{ padding: "9px 16px" }}
      />
    </div>
  );
}
