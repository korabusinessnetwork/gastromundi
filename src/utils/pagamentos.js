// Rótulos amigáveis dos métodos nativos. Métodos personalizados do
// estabelecimento (custom_*) não entram aqui — são derivados do próprio id.
const ROTULOS_METODO_BASE = {
  dinheiro: "Dinheiro",
  credito: "Crédito",
  debito: "Débito",
  pix: "Pix",
  fiado: "Fiado",
  voucher: "Voucher",
  vale: "Vale",
};

/**
 * Rótulo humano de um método de pagamento, para telas e relatórios
 * (Princípio nº1: nada de código interno na tela). Ordem de resolução:
 *   1. rótulo configurado pelo estabelecimento (mapa `rotulos`, ex.: do PDV);
 *   2. método nativo conhecido (Dinheiro, Crédito, Pix…);
 *   3. método PERSONALIZADO (`custom_<nome>_<timestamp>`, criado em
 *      ConfiguracoesView): deriva o nome do próprio id — tira o prefixo e o
 *      timestamp final, troca "_" por espaço e capitaliza ("custom_crédito_
 *      cielo_1783529650712" → "Crédito Cielo");
 *   4. fallback: o próprio id, ou "—" se vazio.
 *
 * @param {string|null|undefined} metodo
 * @param {Record<string,string>} [rotulos] rótulos por id (ex.: customLabels do PDV)
 * @returns {string}
 */
export function rotuloMetodo(metodo, rotulos = {}) {
  if (metodo == null || metodo === "") return "—";
  const id = String(metodo);
  if (rotulos && rotulos[id]) return rotulos[id];
  if (ROTULOS_METODO_BASE[id]) return ROTULOS_METODO_BASE[id];
  if (id.startsWith("custom_")) {
    const nome = id.slice("custom_".length).replace(/_\d+$/, "").replace(/_/g, " ").trim();
    if (nome) {
      return nome
        .split(" ")
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
  }
  return id;
}

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
