import { useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuCircleOff,
  LuPause,
  LuPlay,
  LuSearch,
  LuSearchX,
  LuUtensilsCrossed,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import "../modulos.css";
import "./CardapioModulo.css";

/**
 * CardapioModulo — tela mobile do Cardápio no Palm (hub "Mais").
 *
 * Propósito: consulta rápida de preço — o garçom é perguntado no salão
 * "quanto custa X?" e precisa da resposta em 1 busca, sem abrir o
 * computador. O cadastro completo (categorias, unidades, fornecedores)
 * continua exclusivamente na tela de desktop (ProdutosView, em
 * src/components/produtos/ProdutosView.jsx) — aqui não há
 * criar/editar/excluir produto, só consultar e, para quem tem permissão,
 * pausar/reativar a venda de um item pontualmente.
 *
 * Fonte dos produtos: `products` do AppContext (@/context/AppContext),
 * o mesmo array usado pelo PDV, pela grade de pedido do Palm (PedidoTab)
 * e pelo desktop — carregado uma vez no bootstrap com
 * `.eq("active", true)` e mantido em memória (sem nova query aqui).
 *
 * Alternar disponibilidade reusa o campo `active` da tabela `products`
 * (supabase/schema.sql) — a mesma coluna que o PDV, a grade do Palm e o
 * motor do Jarvas já respeitam (`p.active !== false`) para decidir se um
 * produto aparece para venda. A escrita passa pela action `updateProduct`
 * do AppContext, a mesma usada pelo ProdutosView do desktop para salvar
 * qualquer alteração de produto — nenhum caminho novo foi inventado.
 *
 * A escrita em `products` é restrita a admin/gerente por RLS
 * (`products_write_gerente_admin`, ver supabase/schema.sql). Por isso o
 * botão de pausar/reativar só aparece para esses papéis — mostrar um
 * botão que vai falhar pra maioria dos garçons seria o oposto de
 * prevenção de erro. Quem não é admin/gerente só consulta.
 */

const CATEGORIA_TODOS = "Todos";

function estaIndisponivel(produto) {
  return produto.active === false;
}

export default function CardapioModulo({ onVoltar }) {
  const { products, updateProduct, loading, currentUser } = useApp();

  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState(CATEGORIA_TODOS);
  const [processando, setProcessando] = useState({});
  const [erro, setErro] = useState("");

  const isAdmin =
    currentUser?.role === "admin" || currentUser?.role === "gerente";

  const categorias = useMemo(() => {
    return [...new Set(products.map((p) => p.category).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR")
    );
  }, [products]);

  const contagemPorCategoria = useMemo(() => {
    const mapa = {};
    for (const p of products) {
      if (!p.category) continue;
      mapa[p.category] = (mapa[p.category] ?? 0) + 1;
    }
    return mapa;
  }, [products]);

  const produtosFiltrados = useMemo(() => {
    let lista = products;
    if (catFiltro !== CATEGORIA_TODOS) {
      lista = lista.filter((p) => p.category === catFiltro);
    }
    const q = busca.trim().toLowerCase();
    if (q) {
      lista = lista.filter((p) => p.name?.toLowerCase().includes(q));
    }
    return [...lista].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
    );
  }, [products, catFiltro, busca]);

  const handleToggle = async (produto) => {
    if (!isAdmin || processando[produto.id]) return;
    const indisponivel = estaIndisponivel(produto);
    setProcessando((prev) => ({ ...prev, [produto.id]: true }));
    setErro("");
    try {
      const { error } = await updateProduct(produto.id, {
        active: indisponivel,
      });
      if (error) {
        setErro(
          `Não deu para ${indisponivel ? "reativar" : "pausar"} "${produto.name}". Toque de novo.`
        );
      }
    } catch {
      setErro(
        `Não deu para ${indisponivel ? "reativar" : "pausar"} "${produto.name}". Toque de novo.`
      );
    } finally {
      setProcessando((prev) => ({ ...prev, [produto.id]: false }));
    }
  };

  const buscaOuFiltroAtivo = busca.trim() !== "" || catFiltro !== CATEGORIA_TODOS;

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Cardápio</h1>
          <p className="mod-header__subtitulo">
            {products.length} {products.length === 1 ? "produto" : "produtos"}
            {" · "}
            {categorias.length}{" "}
            {categorias.length === 1 ? "categoria" : "categorias"}
          </p>
        </div>
        <button
          type="button"
          className="mod-header__voltar"
          onClick={onVoltar}
          aria-label="Voltar"
        >
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      <div className="mod-busca">
        <LuSearch aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto…"
          aria-label="Buscar produto"
        />
      </div>

      <div className="mod-chips" role="tablist" aria-label="Categoria do produto">
        {[CATEGORIA_TODOS, ...categorias].map((cat) => {
          const ativo = catFiltro === cat;
          const contador =
            cat === CATEGORIA_TODOS
              ? products.length
              : (contagemPorCategoria[cat] ?? 0);
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={ativo}
              className={`mod-chip${ativo ? " mod-chip--ativo" : ""}`}
              onClick={() => setCatFiltro(cat)}
            >
              {cat}
              <span className="mod-chip__contador">{contador}</span>
            </button>
          );
        })}
      </div>

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : null}

      {loading ? (
        <p className="mod-carregando">Carregando cardápio…</p>
      ) : produtosFiltrados.length === 0 ? (
        <Vazio temProdutos={products.length > 0} filtroAtivo={buscaOuFiltroAtivo} />
      ) : (
        <div className="mod-lista">
          {produtosFiltrados.map((produto) => (
            <CartaoProduto
              key={produto.id}
              produto={produto}
              isAdmin={isAdmin}
              processando={Boolean(processando[produto.id])}
              onToggle={() => handleToggle(produto)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Vazio({ temProdutos, filtroAtivo }) {
  if (temProdutos && filtroAtivo) {
    return (
      <div className="mod-vazio">
        <LuSearchX aria-hidden="true" />
        <p className="mod-vazio__titulo">Nenhum produto encontrado</p>
        <p className="mod-vazio__texto">Tente outra busca ou categoria.</p>
      </div>
    );
  }
  return (
    <div className="mod-vazio">
      <LuUtensilsCrossed aria-hidden="true" />
      <p className="mod-vazio__titulo">Nenhum produto cadastrado</p>
      <p className="mod-vazio__texto">
        Cadastre produtos no computador para eles aparecerem aqui.
      </p>
    </div>
  );
}

function CartaoProduto({ produto, isAdmin, processando, onToggle }) {
  const indisponivel = estaIndisponivel(produto);
  const mostrarRodape = isAdmin || indisponivel;

  return (
    <article
      className={`mod-cartao cardapio-modulo__cartao${
        indisponivel ? " cardapio-modulo__cartao--indisponivel" : ""
      }`}
    >
      <div className="mod-cartao__topo">
        <div className="cardapio-modulo__info">
          <span className="cardapio-modulo__emoji" aria-hidden="true">
            {produto.emoji || "🍽️"}
          </span>
          <span className="cardapio-modulo__nomes">
            <span className="mod-cartao__titulo">{produto.name}</span>
            <span className="mod-cartao__sub">
              {produto.category || "Sem categoria"}
            </span>
          </span>
        </div>
        <span className="cardapio-modulo__preco">
          {fmtDinheiro(produto.price)}
        </span>
      </div>

      {mostrarRodape ? (
        <div className="cardapio-modulo__rodape">
          {indisponivel ? (
            <span className="mod-badge mod-badge--erro">
              <LuCircleOff aria-hidden="true" />
              Indisponível
            </span>
          ) : null}

          {isAdmin ? (
            <button
              type="button"
              className={`mod-botao ${indisponivel ? "mod-botao--ok" : "mod-botao--fantasma"}`}
              onClick={onToggle}
              disabled={processando}
            >
              {indisponivel ? (
                <LuPlay aria-hidden="true" />
              ) : (
                <LuPause aria-hidden="true" />
              )}
              {processando ? "Salvando…" : indisponivel ? "Reativar" : "Pausar"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
