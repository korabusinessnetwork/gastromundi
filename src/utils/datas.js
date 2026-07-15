// Utilidades de data com fuso local — B2 (relatórios dia a dia).
//
// As vendas gravam `at` em ISO8601 UTC. Agrupar por dia usando o dia UTC
// jogaria vendas após ~21h (horário de Brasília) para o dia seguinte. Estas
// funções resolvem o dia LOCAL (America/Sao_Paulo por padrão) via Intl —
// sem dependência externa paga (Restrições de Custo).

export const TZ_PADRAO = "America/Sao_Paulo";

/**
 * Dia local (YYYY-MM-DD) de um timestamp UTC no fuso informado.
 * en-CA formata como YYYY-MM-DD, ideal para usar como chave ordenável.
 *
 * @param {string|Date} iso - timestamp ISO8601 (UTC) ou Date
 * @param {string} [tz]
 * @returns {string|null} "YYYY-MM-DD" ou null se inválido
 */
export function diaLocalISO(iso, tz = TZ_PADRAO) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Rótulo pt-BR (dd/mm/aaaa) a partir de uma chave "YYYY-MM-DD".
 * Não reinterpreta fuso — só reordena os campos da chave já resolvida.
 *
 * @param {string} diaISO - "YYYY-MM-DD"
 * @returns {string} "dd/mm/aaaa" ou "—"
 */
export function rotuloDiaBR(diaISO) {
  if (!diaISO || typeof diaISO !== "string") return "—";
  const partes = diaISO.split("-");
  if (partes.length !== 3) return "—";
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

/**
 * Agrupa vendas por dia local, somando total, contando comandas e
 * calculando ticket médio. Aceita um coletor de método opcional para
 * somar por forma de pagamento sem acoplar às regras de pagamento aqui.
 *
 * @param {Array<object>} vendas
 * @param {object} [opts]
 * @param {(sale:object)=>Record<string,number>} [opts.totalPorMetodo] - se
 *   fornecido, soma os valores por método em `metodos` de cada dia
 * @param {string} [opts.tz]
 * @returns {Array<{dia:string, comandas:number, total:number, ticket:number, metodos:Record<string,number>}>}
 *   ordenado do dia mais recente para o mais antigo
 */
export function agruparVendasPorDia(vendas, opts = {}) {
  const { totalPorMetodo, tz = TZ_PADRAO } = opts;
  const mapa = new Map();
  for (const v of Array.isArray(vendas) ? vendas : []) {
    const dia = diaLocalISO(v?.at, tz);
    if (!dia) continue;
    if (!mapa.has(dia)) mapa.set(dia, { dia, comandas: 0, total: 0, metodos: {} });
    const g = mapa.get(dia);
    g.comandas += 1;
    g.total += Number(v?.total ?? 0);
    if (typeof totalPorMetodo === "function") {
      for (const [m, val] of Object.entries(totalPorMetodo(v) ?? {})) {
        g.metodos[m] = (g.metodos[m] ?? 0) + (Number(val) || 0);
      }
    }
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, ticket: g.comandas > 0 ? g.total / g.comandas : 0 }))
    .sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
}

/**
 * Resolve o intervalo [ini, fim] em milissegundos de um período nomeado
 * do RelatorioView. Espelha a lógica de filtrarPorPeriodo (hora local da
 * máquina) para as agregações admin baterem com a lista de vendas.
 * "tudo" e um custom vazio retornam {ini:null, fim:null} (sem recorte).
 *
 * @param {"hoje"|"semana"|"mes"|"tudo"|"custom"} periodo
 * @param {string} [customInicio] - "YYYY-MM-DD"
 * @param {string} [customFim] - "YYYY-MM-DD"
 * @param {number} [agora] - epoch ms de referência
 * @returns {{ini:number|null, fim:number|null}}
 */
export function intervaloPeriodo(periodo, customInicio, customFim, agora = Date.now()) {
  if (periodo === "tudo") return { ini: null, fim: null };
  if (periodo === "custom") {
    const ini = customInicio ? new Date(customInicio + "T00:00:00").getTime() : null;
    const fim = customFim ? new Date(customFim + "T23:59:59").getTime() : null;
    if (ini == null && fim == null) return { ini: null, fim: null };
    return { ini: ini ?? 0, fim: fim ?? agora };
  }
  const hojeInicio = new Date(new Date(agora).toDateString()).getTime();
  if (periodo === "hoje") return { ini: hojeInicio, fim: agora };
  const dias = periodo === "semana" ? 7 : 30;
  return { ini: agora - dias * 24 * 60 * 60 * 1000, fim: agora };
}

/**
 * Agrupa vendas por operador que cobrou (campo `cashier`), somando total
 * e contando vendas, com ticket médio e participação (%) no faturamento.
 * Visão administrativa (dados de todos os operadores). Pura.
 *
 * @param {Array<object>} vendas
 * @returns {Array<{operador:string, vendas:number, total:number, ticket:number, participacao:number}>}
 *   ordenado por total (desc)
 */
export function agruparVendasPorOperador(vendas) {
  const mapa = new Map();
  let totalGeral = 0;
  for (const v of Array.isArray(vendas) ? vendas : []) {
    const operador = v?.cashier || "—";
    const valor = Number(v?.total ?? 0);
    totalGeral += valor;
    if (!mapa.has(operador)) mapa.set(operador, { operador, vendas: 0, total: 0 });
    const g = mapa.get(operador);
    g.vendas += 1;
    g.total += valor;
  }
  return [...mapa.values()]
    .map((g) => ({
      ...g,
      ticket: g.vendas > 0 ? g.total / g.vendas : 0,
      participacao: totalGeral > 0 ? (g.total / totalGeral) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
