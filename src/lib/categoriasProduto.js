/**
 * Categorias de sistema do cadastro de produtos.
 *
 * "Insumo" e "Produção" não são categorias de cardápio: um insumo nem tem preço
 * de venda, e um item de produção é etapa interna. A única porta de entrada
 * delas são os botões "+ Novo Insumo" e "+ Item de Produção" da tela de
 * Produtos, que já abrem o formulário certo com a categoria travada. Por isso o
 * cadastro de produto comum não as oferece nem aceita que sejam digitadas.
 *
 * Elas continuam existindo para FILTRAR e ENCONTRAR o que já foi cadastrado
 * (chips da lista, gerenciador de categorias) — o bloqueio é só na criação.
 */
export const CATS_FIXAS = ["Insumo", "Produção"];

/**
 * Chave de comparação tolerante para nome de categoria: "produção", "PRODUCAO"
 * e " Produção " são a mesma coisa para quem digita — e todas devem cair na
 * mesma trava. Minúsculas, sem espaço sobrando e sem acento.
 */
export function chaveCategoria(nome) {
  return String(nome ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // remove acentos
}

/** O nome digitado é uma das categorias de sistema? */
export function ehCategoriaFixa(nome) {
  const chave = chaveCategoria(nome);
  if (!chave) return false;
  return CATS_FIXAS.some((fixa) => chaveCategoria(fixa) === chave);
}
