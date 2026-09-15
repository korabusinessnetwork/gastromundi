import { useState, useMemo } from "react";
import { LuPlus, LuX, LuSearch, LuMinus } from "react-icons/lu";
import "./EditorItensFixos.css";

/**
 * Editor dos ITENS FIXOS de um combo — o que vem junto sem o cliente
 * escolher ("o combo sempre vem com uma batata").
 *
 * Controlado: recebe `itens` ([{produtoId, quantidade}]) e devolve o array
 * inteiro por `onChange`. Não fala com o Supabase — quem persiste é quem
 * embute o editor (salvarItensFixos).
 *
 * Por que separado do EditorGruposEscolha: são perguntas diferentes. O
 * grupo de escolha é "o que o cliente decide"; isto é "o que já está
 * decidido". Misturar os dois no mesmo cartão faria o dono cadastrar um
 * grupo de uma opção só para dizer algo que não é escolha nenhuma.
 *
 * Por que é intuitivo (princípio nº 1): o rótulo é a frase que o operador
 * vai ler no PDV ("Já vem com"), a busca é a mesma dos grupos, e a
 * quantidade usa o mesmo contador. Nada aqui pede preço, porque o item
 * fixo já está embutido no preço do combo — pedir um número que não muda
 * nada seria convidar o erro.
 */

// Insumo/Produção não são vendáveis — mesma convenção do EditorGruposEscolha.
const CATS_NAO_VENDAVEIS = ["Insumo", "Produção"];

export default function EditorItensFixos({ itens = [], onChange, products = [] }) {
  const [busca, setBusca] = useState("");
  const [show, setShow] = useState(false);

  const prodMap = useMemo(
    () => Object.fromEntries(products.map((p) => [String(p.id), p])),
    [products],
  );

  const filtrados = useMemo(() => {
    const jaAdd = new Set((itens ?? []).map((i) => String(i.produtoId)));
    const q = busca.toLowerCase();
    return products.filter(
      (p) =>
        !CATS_NAO_VENDAVEIS.includes(p.category) &&
        !jaAdd.has(String(p.id)) &&
        (!q || (p.name ?? "").toLowerCase().includes(q)),
    );
  }, [products, busca, itens]);

  const adicionar = (p) => {
    onChange([...(itens ?? []), { produtoId: p.id, quantidade: 1 }]);
    setBusca("");
    setShow(false);
  };

  const remover = (idx) => onChange(itens.filter((_, i) => i !== idx));

  // Piso 1: item fixo com quantidade zero não é item fixo — quem não quer
  // mais o item remove, que é o que o X ao lado faz.
  const mudarQtd = (idx, delta) =>
    onChange(
      itens.map((it, i) =>
        i === idx ? { ...it, quantidade: Math.max(1, (Number(it.quantidade) || 1) + delta) } : it,
      ),
    );

  return (
    <div className="editor-fixos">
      {(itens ?? []).length > 0 && (
        <div className="editor-fixos__lista">
          {itens.map((it, idx) => {
            const p = prodMap[String(it.produtoId)];
            const qtd = Math.max(1, Number(it.quantidade) || 1);
            return (
              <div key={idx} className="editor-fixos__item">
                <span className="editor-fixos__emoji">{p?.emoji ?? "📦"}</span>
                <div className="editor-fixos__nome">{p?.name ?? "Produto removido"}</div>
                <div className="editor-fixos__stepper">
                  <button
                    type="button"
                    aria-label={`Diminuir a quantidade de ${p?.name ?? "item"}`}
                    onClick={() => mudarQtd(idx, -1)}
                    className="editor-fixos__stepper-btn"
                  >
                    <LuMinus size={12} />
                  </button>
                  <span className="editor-fixos__stepper-valor">{qtd}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar a quantidade de ${p?.name ?? "item"}`}
                    onClick={() => mudarQtd(idx, 1)}
                    className="editor-fixos__stepper-btn"
                  >
                    <LuPlus size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remover(idx)}
                  className="editor-fixos__remover"
                  title="Tirar do combo"
                  aria-label={`Tirar ${p?.name ?? "item"} do combo`}
                >
                  <LuX size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="editor-fixos__busca-wrap">
        <LuSearch size={15} className="editor-fixos__busca-icone" />
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setShow(true); }}
          onFocus={() => setShow(true)}
          placeholder="Buscar e adicionar item que já vem junto…"
          className="editor-fixos__busca-input"
        />
        {show && filtrados.length > 0 && (
          <div className="editor-fixos__dropdown">
            {filtrados.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => adicionar(p)}
                className="editor-fixos__dropdown-item"
              >
                <span className="editor-fixos__emoji">{p.emoji ?? "📦"}</span>
                <div className="editor-fixos__nome">{p.name}</div>
                <LuPlus size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="editor-fixos__ajuda">
        Estes itens entram no pedido sozinhos, sem o caixa escolher, e cada um
        baixa o próprio estoque. Não somam preço: já estão dentro do valor do combo.
      </div>
    </div>
  );
}
