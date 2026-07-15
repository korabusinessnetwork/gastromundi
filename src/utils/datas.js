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
