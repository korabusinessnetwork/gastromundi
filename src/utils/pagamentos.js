export function normalizarPagamentos(sale) {
  if (Array.isArray(sale?.pagamentos)) return sale.pagamentos;
  return [{
    metodo:   sale?.metodo,
    valor:    sale?.total,
    recebido: sale?.recebido,
    troco:    sale?.troco,
  }];
}

export function totalPorMetodo(sale) {
  return normalizarPagamentos(sale).reduce((acc, p) => {
    if (p?.metodo != null) acc[p.metodo] = (acc[p.metodo] ?? 0) + (p.valor ?? 0);
    return acc;
  }, {});
}

export function totalTroco(sale) {
  return normalizarPagamentos(sale).reduce((acc, p) => acc + (p.troco ?? 0), 0);
}
