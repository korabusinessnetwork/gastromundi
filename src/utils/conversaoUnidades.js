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
 * Converte quantidade de uma unidade de compra para unidade de estoque.
 * Aceita um objeto de unidade {fator} ou um produto (backward compat).
 */
export function compraParaEstoque(qtdCompra, unitObj) {
  const fator = unitObj.fator ?? unitObj.fator_compra_estoque ?? 1;
  return qtdCompra * Number(fator);
}

/**
 * Converte quantidade de unidade de consumo para unidade de estoque.
 * Usado ao dar baixa via ficha técnica.
 */
export function consumoParaEstoque(qtdConsumo, insumo) {
  const fator = insumo.fator_consumo_estoque ?? 1;
  return qtdConsumo * fator;
}

/**
 * Converte saldo em estoque para equivalente em unidade de consumo.
 * Usado para exibir "≈ 120 garrafas" na página de estoque.
 */
export function estoqueParaConsumo(saldoEstoque, insumo) {
  const fator = insumo.fator_consumo_estoque ?? 1;
  if (!fator || fator === 0) return 0;
  return saldoEstoque / fator;
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
