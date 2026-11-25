import { useState, useEffect, useRef } from "react";
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
        className={`categorias-busca__cat${small ? " categorias-busca__cat--lista" : ""}${ativo ? " categorias-busca__cat--ativa" : ""}`}
      >
        {cat}
      </button>
    );
  };

  return (
    <div className="categorias-busca" style={{ "--busca-pad": `${sz.pad}px` }}>
      {/* Categorias visíveis */}
      <div className="categorias-busca__lista">
        {visiveis.map(cat => btnCat(cat))}

        {/* Botão "Mais categorias" */}
        {extras.length > 0 && (
          <div ref={dropRef} className="categorias-busca__mais-wrap">
            <button
              onClick={() => setAberto(v => !v)}
              className={`categorias-busca__cat${(aberto || extras.includes(catFiltro)) ? " categorias-busca__cat--ativa" : ""}`}
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
      />
    </div>
  );
}
