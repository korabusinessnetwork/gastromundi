// Abas, recorte de período e formato de data dos Relatórios, usados pelo gancho
// e pelas abas da tela (refatoração 4.10).

export const ABAS_BASE = ["Vendas", "Desempenho", "Cancelamentos", "Fechamentos", "Logs", "Credenciais"];

export const SALE_PREFIXES = new Set(["comanda", "itens", "produto"]);

export function filtrarPorPeriodo(list, campo, periodo, customInicio, customFim) {
  if (periodo === "tudo") return list;
  if (periodo === "custom") {
    if (!customInicio && !customFim) return list;
    const ini = customInicio ? new Date(customInicio + "T00:00:00").getTime() : 0;
    const fim = customFim    ? new Date(customFim    + "T23:59:59").getTime() : Infinity;
    return list.filter(r => {
      const t = r[campo] ? new Date(r[campo]).getTime() : 0;
      return t >= ini && t <= fim;
    });
  }
  const hojeInicio = new Date(new Date().toDateString()).getTime();
  const dias  = periodo === "semana" ? 7 : 30;
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  return list.filter(r => {
    const t = r[campo] ? new Date(r[campo]).getTime() : 0;
    return periodo === "hoje" ? t >= hojeInicio : t >= desde;
  });
}

export function fmtData(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
