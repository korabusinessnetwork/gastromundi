import { useMemo, useState } from "react";
import {
  filtrarProdutos, formatarReais
} from "@/features/delivery/deliveryAdmin";

// Menu de busca para escolher um produto JÁ CRIADO como complemento.
// Digita → lista os itens do catálogo que casam (menos os já no grupo) →
// clica para escolher. Sem digitação técnica: só buscar e tocar.
export default function SeletorProdutoComplemento({ products, idsExcluir, onEscolher }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(
    () => filtrarProdutos(products, termo, idsExcluir),
    [products, termo, idsExcluir]
  );

  return (
    <div className="delivery-view__busca-inline">
      <input
        className="delivery-view__input"
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        placeholder="Buscar item já criado…"
      />
      {aberto && (
        <div className="delivery-view__menu-busca">
          {resultados.length === 0 ? (
            <div className="delivery-view__hint delivery-view__menu-vazio">
              {(products || []).length === 0
                ? "Nenhum produto criado ainda."
                : "Nenhum item encontrado."}
            </div>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                // onMouseDown (antes do blur) garante que o clique registra.
                onMouseDown={(e) => { e.preventDefault(); onEscolher(p); setTermo(""); setAberto(false); }}
                className="delivery-view__btn delivery-view__menu-opcao"
              >
                <span className="delivery-view__menu-opcao-nome">{p.name}</span>
                <span className="delivery-view__opcao-meta">
                  {formatarReais(p.price)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
