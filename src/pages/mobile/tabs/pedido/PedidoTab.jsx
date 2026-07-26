/**
 * PedidoTab — aba "Pedido" do /palm (garçom). Grade de produtos onde o
 * garçom monta o carrinho. Puramente apresentacional: recebe estado e
 * callbacks via props, não busca dados nem guarda estado próprio.
 *
 * O carrinho em si é uma sheet separada (CarrinhoSheet, outro componente);
 * aqui só existe a barra inferior que resume o carrinho e abre essa sheet.
 */
import {
  LuLogOut,
  LuUtensils,
  LuSearch,
  LuPause,
  LuChevronUp,
} from "react-icons/lu";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import "./PedidoTab.css";

export default function PedidoTab({
  usuarioNome,
  onLogout,
  categorias,
  catAtiva,
  onCategoria,
  busca,
  onBusca,
  produtos,
  qtdPorId,
  onAddProduto,
  carrinhoQtd,
  carrinhoTotal,
  onAbrirCarrinho,
  barraEsperas,
}) {
  const carrinhoVazio = !carrinhoQtd;

  return (
    <div className="pedido-tab">
      <header className="pedido-tab__header">
        <button
          type="button"
          className="pedido-tab__logout"
          onClick={onLogout}
          aria-label="Sair"
        >
          <LuLogOut aria-hidden="true" />
        </button>

        <div className="pedido-tab__titulo">
          <h1 className="pedido-tab__titulo-linha">
            <LuUtensils className="pedido-tab__titulo-icone" aria-hidden="true" />
            <span>Pedido</span>
          </h1>
          {usuarioNome ? (
            <span className="pedido-tab__usuario">{usuarioNome}</span>
          ) : null}
        </div>
      </header>

      <div className="pedido-tab__busca">
        <LuSearch className="pedido-tab__busca-icone" aria-hidden="true" />
        <input
          type="search"
          className="pedido-tab__busca-input"
          placeholder="Buscar item…"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          aria-label="Buscar item"
        />
      </div>

      <div
        className="pedido-tab__chips"
        role="tablist"
        aria-label="Categorias de produto"
      >
        {categorias.map((cat) => {
          const ativa = cat === catAtiva;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={
                ativa
                  ? "pedido-tab__chip pedido-tab__chip--ativo"
                  : "pedido-tab__chip"
              }
              onClick={() => onCategoria(cat)}
            >
              {cat}
            </button>
          );
        })}
      </div>

      <div className="pedido-tab__grade">
        {produtos.length === 0 ? (
          <div className="pedido-tab__vazio">
            <span className="pedido-tab__vazio-emoji" aria-hidden="true">
              🍽️
            </span>
            <p className="pedido-tab__vazio-titulo">Nenhum item encontrado</p>
            <p className="pedido-tab__vazio-dica">
              Tente outra busca ou categoria.
            </p>
          </div>
        ) : (
          <div className="pedido-tab__lista">
            {produtos.map((produto) => {
              const qtd = qtdPorId?.[produto.id] || 0;
              return (
                <button
                  key={produto.id}
                  type="button"
                  className={
                    qtd > 0
                      ? "pedido-tab__card pedido-tab__card--ativo"
                      : "pedido-tab__card"
                  }
                  onClick={() => onAddProduto(produto)}
                >
                  {qtd > 0 ? (
                    <span className="pedido-tab__card-badge">{qtd}</span>
                  ) : null}
                  {produto.emoji ? (
                    <span className="pedido-tab__card-emoji" aria-hidden="true">
                      {produto.emoji}
                    </span>
                  ) : null}
                  <span className="pedido-tab__card-nome">{produto.name}</span>
                  <span className="pedido-tab__card-preco">
                    {fmtDinheiro(produto.price)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="pedido-tab__rodape">
        {barraEsperas ? (
          <button
            type="button"
            className="pedido-tab__espera"
            onClick={barraEsperas.onClick}
          >
            <LuPause className="pedido-tab__espera-icone" aria-hidden="true" />
            <span className="pedido-tab__espera-texto">
              {barraEsperas.qtd}{" "}
              {barraEsperas.qtd === 1
                ? "pedido em espera"
                : "pedidos em espera"}
              {" · "}
              {fmtDinheiro(barraEsperas.total)}
            </span>
            <span className="pedido-tab__espera-acao">Revisar e enviar</span>
          </button>
        ) : null}

        <button
          type="button"
          className={
            carrinhoVazio
              ? "pedido-tab__carrinho pedido-tab__carrinho--vazio"
              : "pedido-tab__carrinho"
          }
          onClick={onAbrirCarrinho}
          disabled={carrinhoVazio}
          aria-label="Abrir carrinho do pedido"
        >
          <span className="pedido-tab__carrinho-texto">
            {carrinhoQtd} {carrinhoQtd === 1 ? "item" : "itens"} ·{" "}
            {fmtDinheiro(carrinhoTotal)}
          </span>
          <LuChevronUp className="pedido-tab__carrinho-icone" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
