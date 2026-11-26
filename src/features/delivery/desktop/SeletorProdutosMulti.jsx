import { useMemo, useState } from "react";
import {
  LuX, LuPlus, LuSearch
} from "react-icons/lu";
import {
  filtrarItensDelivery
} from "@/features/delivery/deliveryAdmin";

// Busca multi-seleção para "aparece nestes produtos". Em cima, os produtos
// já vinculados aparecem como chips removíveis; embaixo, uma busca lista os
// que ainda NÃO estão no combo — digita, filtra e toca pra adicionar (dá
// pra escolher vários). Substitui o antigo checklist de pílulas: com muitos
// produtos, procurar é mais intuitivo que varrer uma lista inteira.
export default function SeletorProdutosMulti({ itens, produtoIds, vinculando, onAlternar }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  // Chips: os itens do cardápio cujo produto_id está vinculado.
  const selecionados = useMemo(
    () => (itens || []).filter((it) => produtoIds.some((x) => String(x) === String(it.produto_id))),
    [itens, produtoIds]
  );

  // Busca: só os que ainda NÃO estão vinculados (exclui os já escolhidos).
  const resultados = useMemo(
    () => filtrarItensDelivery(itens, termo, produtoIds),
    [itens, termo, produtoIds]
  );

  return (
    <div className="delivery-view__multi">
      {/* Chips dos já vinculados */}
      {selecionados.length > 0 && (
        <div className="delivery-view__chips">
          {selecionados.map((it) => (
            <span
              key={it.id}
              className="delivery-view__chip-produto"
            >
              {it.produto?.name || "(produto)"}
              <button
                type="button"
                onClick={() => onAlternar(it.produto_id)}
                disabled={vinculando}
                className="delivery-view__modal-fechar delivery-view__modal-fechar--accent delivery-view__chip-remover"
                title="Remover deste combo"
              >
                <LuX size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Busca para adicionar mais produtos */}
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
          placeholder="Buscar produto para adicionar…"
        />
        {aberto && (
          <div className="delivery-view__menu-busca">
            {resultados.length === 0 ? (
              <div className="delivery-view__hint delivery-view__menu-vazio">
                {termo.trim() ? "Nenhum produto encontrado." : "Todos os produtos já estão neste combo."}
              </div>
            ) : (
              resultados.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  disabled={vinculando}
                  // onMouseDown (antes do blur) garante que o clique registra.
                  onMouseDown={(e) => { e.preventDefault(); onAlternar(it.produto_id); setTermo(""); }}
                  className="delivery-view__btn delivery-view__menu-opcao"
                >
                  <LuPlus size={13} className="delivery-view__menu-opcao-icone" />
                  <span className="delivery-view__menu-opcao-nome">{it.produto?.name || "(produto)"}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
