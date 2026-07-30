/**
 * Retorna o array de unidades de compra de um produto.
 * Suporta o campo novo (unidades_compra jsonb) com fallback para os campos legados.
 */
export function getUnidadesCompra(insumo) {
  if (Array.isArray(insumo.unidades_compra) && insumo.unidades_compra.length > 0) {
    return insumo.unidades_compra;
  }
  // Fallback para campos legados (migração)
  if (insumo.unidade_compra) {
    return [{
      unidade: insumo.unidade_compra,
      fator: insumo.fator_compra_estoque ?? 1,
      detalhamento: insumo.detalhamento_compra ?? "",
    }];
  }
  return [];
}

/**
 * Arredonda uma quantidade de estoque para 3 casas, sem o viés de ponto
 * flutuante (0.1 + 0.2 !== 0.3).
 *
 * Toda multiplicação de fator produz sujeira binária: 3 garrafas de 0,35 L dá
 * 1.0499999999999998 L, e era esse número que ia para o banco. O saldo
 * acumulava a sujeira lançamento após lançamento, e a tela — que formata com
 * 3 casas — mostrava um valor diferente do que estava gravado.
 *
 * 3 casas é de propósito: é exatamente o que `fmtQtd` mostra, então o saldo
 * gravado é sempre igual ao saldo que o operador lê. Em quilo dá 1 grama, em
 * litro dá 1 mililitro — suficiente para cozinha.
 *
 * Quantidade inválida (texto, null, NaN, Infinity) devolve 0: quem chama nunca
 * recebe NaN para gravar.
 *
 * @param {any} v
 * @returns {number}
 */
export function arredondarQtd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Converte quantidade de uma unidade de compra para unidade de estoque.
 * Aceita um objeto de unidade {fator} ou um produto (backward compat).
 *
 * Unidade ausente (produto editado em outro aparelho enquanto esta tela estava
 * aberta, índice de aba que não existe mais) devolve 0 em vez de estourar
 * TypeError no meio do lançamento — quem chama trata 0 como "não dá para
 * converter".
 */
export function compraParaEstoque(qtdCompra, unitObj) {
  if (!unitObj || typeof unitObj !== "object") return 0;
  const fator = unitObj.fator ?? unitObj.fator_compra_estoque ?? 1;
  return arredondarQtd(Number(qtdCompra) * Number(fator));
}

/**
 * Converte quantidade de unidade de consumo para unidade de estoque.
 * Usado ao dar baixa via ficha técnica.
 */
export function consumoParaEstoque(qtdConsumo, insumo) {
  const fator = insumo?.fator_consumo_estoque ?? 1;
  return arredondarQtd(Number(qtdConsumo) * Number(fator));
}

/**
 * Converte saldo em estoque para equivalente em unidade de consumo.
 * Usado para exibir "≈ 120 garrafas" na página de estoque.
 */
export function estoqueParaConsumo(saldoEstoque, insumo) {
  const fator = Number(insumo?.fator_consumo_estoque ?? 1);
  if (!Number.isFinite(fator) || fator === 0) return 0;
  return arredondarQtd(Number(saldoEstoque) / fator);
}

/**
 * Retorna o label de unidade de consumo, caindo back para unidade de estoque.
 */
export function labelConsumo(insumo) {
  return insumo.unidade_consumo ?? insumo.unidade_estoque ?? insumo.unidade ?? 'un';
}

/**
 * Retorna o label da primeira unidade de compra, caindo back para unidade de estoque.
 */
export function labelCompra(insumo) {
  const units = getUnidadesCompra(insumo);
  if (units.length > 0) return units[0].unidade;
  return insumo.unidade_estoque ?? insumo.unidade ?? 'un';
}

/**
 * Retorna a unidade de estoque com fallback para o campo legado.
 */
export function labelEstoque(insumo) {
  return insumo.unidade_estoque ?? insumo.unidade ?? 'un';
}

/**
 * Retorna true se o insumo tem unidade de consumo diferente do estoque.
 */
export function temConversaoConsumo(insumo) {
  return !!insumo.unidade_consumo && insumo.unidade_consumo !== labelEstoque(insumo);
}

/**
 * Retorna true se o insumo tem ao menos uma unidade de compra configurada.
 */
export function temConversaoCompra(insumo) {
  return getUnidadesCompra(insumo).length > 0;
}

/**
 * Formata número removendo zeros à direita desnecessários.
 */
export function fmtQtd(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  const v = Number(n);
  return v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '');
}
