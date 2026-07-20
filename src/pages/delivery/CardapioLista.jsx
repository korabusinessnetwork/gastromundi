// ──────────────────────────────────────────────────────────────────
// CardapioLista — categorias + cards de produto (foto/emoji, descrição,
// preço). Card inteiro é clicável (alvo grande — uso majoritário em
// celular). Combos "monte seu" entram como uma categoria própria.
// ──────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { formatarPreco } from "@/lib/delivery";

function CardProduto({ item, onAbrir }) {
  return (
    <button className="card-produto" onClick={() => onAbrir(item)}>
      <div className="card-produto__texto">
        <p className="card-produto__nome">{item.nome}</p>
        {item.descricao && <p className="card-produto__desc">{item.descricao}</p>}
        <span className="card-produto__preco">{formatarPreco(item.preco)}</span>
      </div>
      {item.foto_url ? (
        <img
          className="card-produto__foto"
          src={item.foto_url}
          alt={item.nome}
          loading="lazy"
        />
      ) : (
        <div className="card-produto__foto card-produto__foto--emoji" aria-hidden="true">
          {item.emoji || "🍽️"}
        </div>
      )}
    </button>
  );
}

export default function CardapioLista({ cardapio, onAbrirProduto }) {
  // Agrupa produtos por categoria, preservando a ordem já vinda da RPC.
  const categorias = useMemo(() => {
    const mapa = new Map();
    for (const p of cardapio?.produtos ?? []) {
      const cat = p.categoria || "Itens";
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat).push(p);
    }
    return [...mapa.entries()];
  }, [cardapio]);

  // Combos "monte seu": normaliza pro mesmo formato que o card/modal usam.
  const combos = useMemo(
    () =>
      (cardapio?.combos ?? []).map((c) => ({
        combo_id: c.combo_id,
        produto_id: null,
        nome: c.nome,
        preco: c.preco,
        grupos: [],
      })),
    [cardapio]
  );

  const vazio = categorias.length === 0 && combos.length === 0;
  if (vazio) {
    return (
      <div className="vitrine__estado">
        <div className="vitrine__estado-emoji">🍽️</div>
        <p>Cardápio ainda sendo preparado. Volte em breve!</p>
      </div>
    );
  }

  return (
    <>
      {categorias.map(([cat, itens]) => (
        <section key={cat}>
          <h2 className="vitrine__categoria">{cat}</h2>
          <div className="vitrine__grid">
            {itens.map((p) => (
              <CardProduto key={p.produto_id} item={p} onAbrir={onAbrirProduto} />
            ))}
          </div>
        </section>
      ))}

      {combos.length > 0 && (
        <section>
          <h2 className="vitrine__categoria">Monte seu combo</h2>
          <div className="vitrine__grid">
            {combos.map((c) => (
              <CardProduto key={c.combo_id} item={c} onAbrir={onAbrirProduto} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
