import { useState, useRef } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { montarItemCombo, montarItemProdutoEscolhas, itensQueVemNoCombo } from "@/features/cardapio/regras/combos";
import { formatarReais } from "@/lib/dinheiro";
import SeletorEscolhas from "./SeletorEscolhas";
import "./ProductGrid.css";

const CAT_COMBOS = "Combos";

export default function ProductGrid({ products, combos = [], gruposPorProduto = {}, onAdd }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  // Produto desabilitado no cadastro não é oferecido aqui. O catálogo traz os
  // desabilitados junto de propósito (senão eles sumiriam da tela de cadastro
  // e não haveria como religá-los), então o corte é aqui, na tela que vende.
  const vendaveis = products.filter(p => p.active !== false);
  // Combo avulso (sem produto principal) não tem categoria de produto onde
  // morar: aparece primeiro em "Todos" e é a única coisa na aba "Combos".
  const avulsos = combos.filter(c => c.item_principal_id == null);
  const categorias = ["Todos", ...new Set(vendaveis.map(p => p.category)), ...(avulsos.length ? [CAT_COMBOS] : [])];
  const [catAtiva, setCatAtiva] = useState("Todos");

  // Item com grupos de escolha (combo flexível ou produto com seleção) abre
  // o seletor antes de ir ao carrinho; sem grupos, vai direto.
  const [seletor, setSeletor] = useState(null);

  const clicarProduto = (produto) => {
    const grupos = gruposPorProduto[produto.id] ?? [];
    if (grupos.length === 0) { onAdd(produto); return; }
    setSeletor({ tipo: "produto", produto, grupos, titulo: produto.name, precoBase: Number(produto.price) || 0 });
  };

  // `produto` é o principal do combo, quando existe: dá a categoria para o
  // carrinho agrupar o combo com ela.
  const clicarCombo = (combo, produto) => {
    const grupos = combo.grupos ?? [];
    if (grupos.length === 0) {
      const item = montarItemCombo(combo);
      if (item) onAdd({ ...item, category: produto?.category });
      return;
    }
    setSeletor({ tipo: "combo", combo, produto, grupos, titulo: combo.nome, precoBase: Number(combo.preco_total) || 0, jaVemCom: itensQueVemNoCombo(combo, produto) });
  };

  const confirmarEscolhas = (escolhas) => {
    if (!seletor) return;
    const item = seletor.tipo === "combo"
      ? { ...montarItemCombo(seletor.combo, escolhas), category: seletor.produto?.category }
      : montarItemProdutoEscolhas(seletor.produto, escolhas);
    if (item) onAdd(item);
    setSeletor(null);
  };

  // Estabelecimento recém-criado abre o PDV com o cardápio vazio. "Nenhum
  // produto nesta categoria" mentiria — não existe categoria nenhuma — e não
  // diz o que fazer. Aqui os dois vazios são coisas diferentes: catálogo
  // vazio manda a pessoa para a tela de cadastro; categoria vazia é só um
  // filtro sem resultado.
  const catalogoVazio = vendaveis.length === 0 && combos.length === 0;

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
    ? vendaveis
    : vendaveis.filter(p => p.category === catAtiva);

  // B4 — combos entram na grade junto do produto principal, na mesma
  // categoria (o operador acha o combo onde procuraria o produto):
  // modo "combo" vira um card extra ao lado; modo "substituir" toma o
  // lugar do card do principal enquanto o combo estiver ativo.
  const cards = [];
  if (catAtiva === "Todos" || catAtiva === CAT_COMBOS) for (const combo of avulsos) cards.push({ tipo: "combo", combo });
  if (catAtiva !== CAT_COMBOS) for (const produto of filtrados) {
    const doProduto = combos.filter(c => String(c.item_principal_id) === String(produto.id));
    const substituto = doProduto.find(c => c.modo === "substituir");
    if (!substituto) cards.push({ tipo: "produto", produto });
    for (const combo of doProduto) {
      cards.push({ tipo: "combo", combo, produto });
    }
  }

  return (
    <div
      className="produto-grid"
      style={{
        "--pg-pad": `${sz.pad}px`, "--pg-pad-sm": `${sz.padSm}px`,
        "--pg-gap": `${sz.gap}px`, "--pg-card-min": `${sz.productCardMin}px`,
      }}
    >

      {/* Filtro de categorias — arrastável para alcançar as que transbordam.
          Sem produto nenhum a barra teria só o chip "Todos", que não filtra
          nada: some para não competir com a orientação de cadastro. */}
      {!catalogoVazio && (
      <div
        ref={filtroRef}
        className="produto-grid__filtro"
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
          >
            {cat}
          </button>
        ))}
      </div>
      )}

      {/* Grid de produtos */}
      <div
        className="produto-grid__lista"
      >
        {cards.map(card => card.tipo === "produto" ? (
          <ProdutoCard
            key={card.produto.id}
            product={card.produto}
            temEscolhas={(gruposPorProduto[card.produto.id]?.length ?? 0) > 0}
            onSelecionar={clicarProduto}
          />
        ) : (
          <ComboCard key={`combo-${card.combo.id}`} combo={card.combo} produto={card.produto} onSelecionar={clicarCombo} />
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
          precoBase={seletor.precoBase}
          grupos={seletor.grupos}
          products={products}
          jaVemCom={seletor.jaVemCom ?? []}
          onConfirmar={confirmarEscolhas}
          onClose={() => setSeletor(null)}
        />
      )}
    </div>
  );
}

function ProdutoCard({ product, temEscolhas, onSelecionar }) {
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
    >
      <div className="produto-card__nome">
        {product.name}
      </div>
      {temEscolhas ? (
        <div className="produto-card__preco produto-card__preco--apartir">
          a partir de {formatarReais(Number(product.price))}
        </div>
      ) : (
        <div className="produto-card__preco">
          {formatarReais(Number(product.price))}
        </div>
      )}
    </button>
  );
}

function ComboCard({ combo, produto, onSelecionar }) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    setPressed(true);
    onSelecionar(combo, produto);
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
  // Combo flexível: os grupos de escolha ("Hambúrguer + Refrigerante"), o
  // operador vê o que o cliente vai montar.
  const grupos = (combo.grupos ?? []).filter(g => g?.nome).map(g => g.nome);
  const itens = [...produtosAdd, ...subs, ...grupos];

  return (
    <button
      onClick={handleClick}
      className={`produto-card produto-card--combo${pressed ? " produto-card--pressed" : ""}`}
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
        {formatarReais(Number(combo.preco_total ?? 0))}
      </div>
    </button>
  );
}
