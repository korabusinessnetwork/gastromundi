import { useState, useRef } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { montarItemCombo, montarItemProdutoEscolhas } from "@/lib/combos";
import SeletorEscolhas from "./SeletorEscolhas";
import "./ProductGrid.css";

const CAT_COMBOS = "Combos";

export default function ProductGrid({ products, combos = [], gruposPorProduto = {}, onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  // "Combos" só entra na barra quando há combos — vira a aba onde o operador
  // encontra os combos, além de aparecerem também em "Todos".
  const categorias = ["Todos", ...new Set(products.map(p => p.category)), ...(combos.length ? [CAT_COMBOS] : [])];
  const [catAtiva, setCatAtiva] = useState("Todos");

  // Item com grupos de escolha (combo flexível ou produto com seleção) abre
  // o seletor antes de ir ao carrinho; sem grupos, vai direto.
  // seletor = { tipo:"combo"|"produto", combo?, produto?, grupos, titulo, emoji, precoBase }
  const [seletor, setSeletor] = useState(null);

  const clicarProduto = (produto) => {
    const grupos = gruposPorProduto[produto.id] ?? [];
    if (grupos.length === 0) { onAdd(produto); return; }
    setSeletor({ tipo: "produto", produto, grupos, titulo: produto.name, emoji: produto.emoji, precoBase: Number(produto.price) || 0 });
  };

  const clicarCombo = (combo) => {
    const grupos = combo.grupos ?? [];
    if (grupos.length === 0) { const item = montarItemCombo(combo); if (item) onAdd(item); return; }
    setSeletor({ tipo: "combo", combo, grupos, titulo: combo.nome, emoji: undefined, precoBase: Number(combo.preco_total) || 0 });
  };

  const confirmarEscolhas = (escolhas) => {
    if (!seletor) return;
    const item = seletor.tipo === "combo"
      ? montarItemCombo(seletor.combo, escolhas)
      : montarItemProdutoEscolhas(seletor.produto, escolhas);
    if (item) onAdd(item);
    setSeletor(null);
  };

  // Estabelecimento recém-criado abre o PDV com o cardápio vazio. "Nenhum
  // produto nesta categoria" mentiria — não existe categoria nenhuma — e não
  // diz o que fazer. Aqui os dois vazios são coisas diferentes: catálogo
  // vazio manda a pessoa para a tela de cadastro; categoria vazia é só um
  // filtro sem resultado.
  const catalogoVazio = products.length === 0 && combos.length === 0;

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

  // Combos são standalone (não têm produto principal). Aparecem primeiro em
  // "Todos" e são a única coisa na aba "Combos". As demais categorias mostram
  // só os produtos daquela categoria.
  const mostrarCombos   = catAtiva === "Todos" || catAtiva === CAT_COMBOS;
  const mostrarProdutos = catAtiva !== CAT_COMBOS;
  const cards = [];
  if (mostrarCombos) for (const combo of combos) cards.push({ tipo: "combo", combo });
  if (mostrarProdutos) for (const produto of filtrados) cards.push({ tipo: "produto", produto });

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
          <ProdutoCard
            key={card.produto.id}
            product={card.produto}
            temEscolhas={(gruposPorProduto[card.produto.id]?.length ?? 0) > 0}
            onSelecionar={clicarProduto}
            sz={sz}
          />
        ) : (
          <ComboCard key={`combo-${card.combo.id}`} combo={card.combo} onSelecionar={clicarCombo} sz={sz} />
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

      {/* Seletor de escolhas (combo flexível / produto com seleção) */}
      {seletor && (
        <SeletorEscolhas
          titulo={seletor.titulo}
          emoji={seletor.emoji}
          precoBase={seletor.precoBase}
          grupos={seletor.grupos}
          products={products}
          onConfirmar={confirmarEscolhas}
          onClose={() => setSeletor(null)}
        />
      )}
    </div>
  );
}

function ProdutoCard({ product, temEscolhas, onSelecionar, sz }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    onSelecionar(product);
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
      {temEscolhas ? (
        <div className="produto-card__preco produto-card__preco--apartir">
          a partir de R$ {Number(product.price).toFixed(2)}
        </div>
      ) : (
        <div className="produto-card__preco">
          R$ {Number(product.price).toFixed(2)}
        </div>
      )}
    </button>
  );
}

function ComboCard({ combo, onSelecionar, sz }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    onSelecionar(combo);
    setTimeout(() => setPressed(false), 150);
  };

  // Composição exibida: os grupos de escolha do combo ("Hambúrguer +
  // Refrigerante") — o operador vê o que o cliente vai montar.
  const grupos = (combo.grupos ?? []).filter(g => g?.nome).map(g => g.nome);

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
      {grupos.length > 0 && (
        <div className="produto-card__combo-itens">
          {grupos.join(" + ")}
        </div>
      )}
      <div className="produto-card__preco">
        R$ {Number(combo.preco_total ?? 0).toFixed(2)}
      </div>
    </button>
  );
}
