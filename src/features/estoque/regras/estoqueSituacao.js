// Situação de estoque de um produto — regra ÚNICA.
//
// O defeito que isto conserta: o PDV avisava "7 produtos sem estoque" enquanto a
// tela de Estoque, no mesmo instante e com os mesmos dados, dizia "0 sem
// estoque · 0 estoque baixo". Não era atraso de carregamento — eram duas contas
// diferentes:
//
//   - o PDV tratava produto SEM linha na tabela `estoque` como saldo zero, então
//     todo prato do cardápio (que não controla estoque) entrava na conta;
//   - o PDV usava mínimo fixo em 10 e ignorava o mínimo cadastrado por produto.
//
// Duas telas discordando sobre o mesmo número é pior do que qualquer uma das
// duas estar errada: o operador não sabe em qual acreditar. Daqui pra frente a
// conta é uma só, e quem quiser mudar a regra muda aqui.

/** Mínimo usado quando o produto ainda não tem mínimo cadastrado. */
export const MINIMO_PADRAO = 10;

/**
 * Produto sem linha na tabela `estoque` é produto que NÃO controla estoque —
 * um prato montado na hora não "acabou", ele simplesmente não tem saldo.
 */
export function controlaEstoque(estoque, produtoId) {
  return (estoque?.[produtoId] ?? null) !== null;
}

/** Mínimo cadastrado do produto, ou o padrão. */
export function minimoDoProduto(estoqueMinimos, produtoId) {
  return estoqueMinimos?.[produtoId] ?? MINIMO_PADRAO;
}

/**
 * Devolve "sem_estoque" | "baixo" | "ok" | "nao_controlado".
 * Só produto que controla estoque pode estar em ruptura.
 */
export function situacaoEstoque(produtoId, estoque, estoqueMinimos) {
  return situacaoDoSaldo(
    estoque?.[produtoId] ?? 0,
    minimoDoProduto(estoqueMinimos, produtoId),
    controlaEstoque(estoque, produtoId),
  );
}

/**
 * A mesma regra, para quem já tem o saldo e o mínimo na mão (a cor da tela de
 * Estoque, a etiqueta do celular). Saldo NEGATIVO é ruptura: acontece com venda
 * feita sem internet, e antes as telas de Estoque o mostravam como "baixo"
 * enquanto o alerta do PDV dizia "sem estoque" (refatoração 4.4).
 * Devolve "sem_estoque" | "baixo" | "ok" | "nao_controlado".
 */
export function situacaoDoSaldo(saldo, minimo, controlado = true) {
  if (!controlado) return "nao_controlado";
  const n = Number(saldo) || 0;
  if (n <= 0) return "sem_estoque";
  return n <= minimo ? "baixo" : "ok";
}

/**
 * Separa a lista de produtos nos dois grupos que as telas mostram.
 * Produto inativo fica de fora: não está à venda, faltar não é problema.
 */
export function classificarEstoque(products, estoque, estoqueMinimos) {
  const semEstoque = [];
  const baixos = [];
  for (const p of products ?? []) {
    if (p?.active === false) continue;
    const situacao = situacaoEstoque(p.id, estoque, estoqueMinimos);
    if (situacao === "sem_estoque") semEstoque.push(p);
    else if (situacao === "baixo") baixos.push(p);
  }
  return { semEstoque, baixos };
}
