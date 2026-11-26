import {
  LuChevronRight
} from "react-icons/lu";

// Card médio, clicável, da grade da biblioteca. Só LEITURA: mostra o nome,
// resumo (obrigatório/opcional), quantos itens tem e em quantos produtos
// aparece. Tocar abre o editor. Nada de campo editável aqui — a edição
// mora no menu limpo (GrupoEditor), pra grade ficar fácil de escanear.
export default function GrupoCardMini({ grupo, onAbrir }) {
  const nItens = (grupo.itens || []).length;
  const nProdutos = (grupo.produtoIds || []).length;
  const nSubgrupos = (grupo.subgrupoIds || []).length;
  const obrigatorio = Number(grupo.min_escolhas) > 0;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="delivery-view__grupo-card"
    >
      <div className="delivery-view__grupo-topo">
        <span className="delivery-view__grupo-nome">
          {grupo.nome}
        </span>
        <LuChevronRight size={18} className="delivery-view__grupo-seta" />
      </div>

      <span
        className={`delivery-view__grupo-selo delivery-view__grupo-selo--${obrigatorio ? "obrigatorio" : "opcional"}`}
      >
        {obrigatorio ? "Obrigatório" : "Opcional"} · {grupo.min_escolhas ?? 0}–{grupo.max_escolhas ?? 1}
      </span>

      <div className="delivery-view__grupo-stats">
        <span>{nItens} {nItens === 1 ? "item" : "itens"}</span>
        <span>·</span>
        <span>{nProdutos} {nProdutos === 1 ? "produto" : "produtos"}</span>
        {nSubgrupos > 0 && (
          <>
            <span>·</span>
            <span>{nSubgrupos} {nSubgrupos === 1 ? "subgrupo" : "subgrupos"}</span>
          </>
        )}
      </div>
    </button>
  );
}
