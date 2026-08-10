import { useState, useRef } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { montarItemCombo } from "@/lib/produtos/combos";
import "./ProductGrid.css";

export default function ProductGrid({ products, combos = [], onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const categorias = ["Todos", ...new Set(products.map(p => p.category))];
  const [catAtiva, setCatAtiva] = useState("Todos");

  // Estabelecimento recém-criado abre o PDV com o cardápio vazio. "Nenhum
  // produto nesta categoria" mentiria — não existe categoria nenhuma — e não
  // diz o que fazer. Aqui os dois vazios são coisas diferentes: catálogo
  // vazio manda a pessoa para a tela de cadastro; categoria vazia é só um
  // filtro sem resultado.
  const catalogoVazio = products.length === 0;

  // Arrastar-para-rolar a barra de categorias: quando há categorias demais
  // elas transbordam e somem à direita (ex. nomes longos). No mouse não dá
  // para rolar na horizontal, então o operador não alcança as escondidas.
  // Aqui, segurar e arrastar a barra rola até elas. Só mouse — no toque o
  // scroll nativo já resolve. `moveu` distingue arrasto de clique para não
  // trocar de categoria sem querer ao arrastar.
  const filtroRef = useRef(null);
  const arrasto   = useRef({ ativo: false, startX: 0, startScroll: 0, moveu: false });

  const iniciarArrasto = (e) => {
    if (e.pointerType !== "mouse" || !filtroRef.current) return;
    arrasto.current = {
      ativo: true, moveu: false,
      startX: e.clientX, startScroll: filtroRef.current.scrollLeft,
    };
  };
  const moverArrasto = (e) => {
    const a = arrasto.current;
    if (!a.ativo || !filtroRef.current) return;
    const dx = e.clientX - a.startX;
    if (Math.abs(dx) > 4) a.moveu = true;
    filtroRef.current.scrollLeft = a.startScroll - dx;
  };
  const fimArrasto = () => { arrasto.current.ativo = false; };
  const selecionarCat = (cat) => { if (!arrasto.current.moveu) setCatAtiva(cat); };

  const filtrados = catAtiva === "Todos"
    ? products
    : products.filter(p => p.category === catAtiva);

  // B4 — combos entram na grade junto do produto principal, na mesma
  // categoria (o operador acha o combo onde procuraria o produto):
  // modo "combo" vira um card extra ao lado; modo "substituir" toma o
  // lugar do card do principal enquanto o combo estiver ativo.
  const cards = [];
  for (const produto of filtrados) {
    const doProduto = combos.filter(c => String(c.item_principal_id) === String(produto.id));
    const substituto = doProduto.find(c => c.modo === "substituir");
    if (!substituto) cards.push({ tipo: "produto", produto });
    for (const combo of doProduto) {
      cards.push({ tipo: "combo", combo, produto });
    }
  }

  return (
    <div className="produto-grid">

      {/* Filtro de categorias — arrastável para alcançar as que transbordam.
          Sem produto nenhum a barra teria só o chip "Todos", que não filtra
          nada: some para não competir com a orientação de cadastro. */}
      {!catalogoVazio && (
      <div
        ref={filtroRef}
        className="produto-grid__filtro"
        style={{ gap: sz.gap - 4, padding: `${sz.padSm}px ${sz.pad}px` }}
        onPointerDown={iniciarArrasto}
        onPointerMove={moverArrasto}
        onPointerUp={fimArrasto}
        onPointerLeave={fimArrasto}
      >
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => selecionarCat(cat)}
            className={`produto-grid__chip${catAtiva === cat ? " produto-grid__chip--ativo" : ""}`}
            style={{ padding: `${sz.padSm - 4}px ${sz.pad - 4}px` }}
          >
            {cat}
          </button>
        ))}
      </div>
      )}

      {/* Grid de produtos */}
      <div
        className="produto-grid__lista"
        style={{
          padding: `${sz.pad}px`,
          gridTemplateColumns: `repeat(auto-fill, minmax(${sz.productCardMin}px, 1fr))`,
          gap: sz.gap - 2,
        }}
      >
        {cards.map(card => card.tipo === "produto" ? (
          <ProdutoCard key={card.produto.id} product={card.produto} onAdd={onAdd} sz={sz} />
        ) : (
          <ComboCard key={`combo-${card.combo.id}`} combo={card.combo} produto={card.produto} onAdd={onAdd} sz={sz} />
        ))}
        {cards.length === 0 && (
          <div className="produto-grid__vazio">
            {catalogoVazio ? (
              <>
                <p className="produto-grid__vazio-titulo">Seu cardápio ainda está vazio</p>
                <p className="produto-grid__vazio-dica">
                  Cadastre os itens em <strong>Cadastro Produtos</strong>, no menu ao lado.
                  Eles aparecem aqui na hora, prontos para vender.
                </p>
              </>
            ) : (
              "Nenhum produto nesta categoria"
            )}
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
      className={`produto-card${pressed ? " produto-card--pressed" : ""}`}
      style={{ padding: `${sz.pad - 2}px ${sz.padSm}px`, gap: sz.gap - 8 }}
    >
      {product.emoji && (
        <div className="produto-card__emoji">{product.emoji}</div>
      )}
      <div className="produto-card__nome">
        {product.name}
      </div>
      <div className="produto-card__preco">
        R$ {Number(product.price).toFixed(2)}
      </div>
    </button>
  );
}

function ComboCard({ combo, produto, onAdd, sz }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    const item = montarItemCombo(combo);
    if (!item) return;
    setPressed(true);
    // Emoji/categoria do principal para o carrinho ficar reconhecível
    onAdd({ ...item, emoji: produto?.emoji, category: produto?.category });
    setTimeout(() => setPressed(false), 150);
  };

  // Composição exibida: produtos adicionais do catálogo primeiro, depois
  // subprodutos (acompanhamentos). O principal é prefixado no JSX.
  const produtosAdd = (combo.combo_produtos ?? [])
    .filter(cp => cp?.products?.name)
    .map(cp => (Number(cp.quantidade ?? 1) > 1 ? `${cp.quantidade}× ${cp.products.name}` : cp.products.name));
  const subs = (combo.combo_subprodutos ?? [])
    .filter(cs => cs?.subprodutos?.nome)
    .map(cs => (Number(cs.quantidade ?? 1) > 1 ? `${cs.quantidade}× ${cs.subprodutos.nome}` : cs.subprodutos.nome));
  const itens = [...produtosAdd, ...subs];

  return (
    <button
      onClick={handleClick}
      className={`produto-card produto-card--combo${pressed ? " produto-card--pressed" : ""}`}
      style={{ padding: `${sz.pad - 2}px ${sz.padSm}px`, gap: sz.gap - 8 }}
    >
      <div className="produto-card__badge-combo">COMBO</div>
      <div className="produto-card__nome">
        {combo.nome}
      </div>
      {itens.length > 0 && (
        <div className="produto-card__combo-itens">
          {produto?.name ? `${produto.name} + ` : ""}{itens.join(" + ")}
        </div>
      )}
      <div className="produto-card__preco">
        R$ {Number(combo.preco_total ?? 0).toFixed(2)}
      </div>
    </button>
  );
}
