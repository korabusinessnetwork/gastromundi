import { useMemo, useState } from "react";
import {
  LuPlus, LuSearch
} from "react-icons/lu";

// Menu de busca para anexar um grupo JÁ CRIADO como subgrupo (aninhamento
// reciclável estilo iFood). Digita → lista os grupos candidatos (a lista já
// vem sem ele mesmo, sem os já anexados e sem os que criariam ciclo) →
// clica pra anexar. Mesmo padrão do seletor de produto: só buscar e tocar.
export default function SeletorSubgrupo({ candidatos, onEscolher }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    const base = Array.isArray(candidatos) ? candidatos : [];
    if (!t) return base;
    return base.filter((g) => String(g.nome || "").toLowerCase().includes(t));
  }, [candidatos, termo]);

  return (
    <div className="delivery-view__busca">
      <LuSearch
        size={15}
        className="delivery-view__busca-lupa"
      />
      <input
        className="delivery-view__input delivery-view__input--com-icone"
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        placeholder="Buscar grupo para anexar como subgrupo…"
      />
      {aberto && (
        <div className="delivery-view__menu-busca">
          {resultados.length === 0 ? (
            <div className="delivery-view__hint delivery-view__menu-vazio">
              Nenhum grupo encontrado.
            </div>
          ) : (
            resultados.map((g) => {
              const nSub = (g.itens || []).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onEscolher(g); setTermo(""); setAberto(false); }}
                  className="delivery-view__btn delivery-view__menu-opcao"
                >
                  <LuPlus size={13} className="delivery-view__menu-opcao-icone" />
                  <span className="delivery-view__menu-opcao-nome">{g.nome}</span>
                  <span className="delivery-view__opcao-meta">
                    {nSub} {nSub === 1 ? "item" : "itens"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
