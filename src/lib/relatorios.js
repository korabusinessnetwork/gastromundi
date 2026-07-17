import { supabase } from "./supabase";

/**
 * Relatórios — F011 (docs/03_REGRAS_DE_NEGOCIO/RELATORIOS.md).
 *
 * Somente leitura: agrega vendas/venda_itens/venda_pagamentos (TD009)
 * via RPC no Postgres (public.relatorio_vendas,
 * supabase/migrations/20260714_relatorio_vendas.sql) — nunca baixa o
 * blob `sales` nem agrega no cliente. Margem cruza o retorno da RPC
 * com a ficha técnica (public.config, key 'fichas_tecnicas'); onde não
 * há ficha cadastrada, sinaliza "sem custo" em vez de inventar número.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Calcula o intervalo [inicio, fim) de um período nomeado, a partir de
 * uma data de referência (default: agora).
 *
 * @param {"dia"|"semana"|"mes"} tipo
 * @param {Date} [referencia]
 * @returns {{ inicio: Date, fim: Date }}
 */
export function calcularPeriodo(tipo, referencia = new Date()) {
  const fimDoDia = new Date(referencia);
  fimDoDia.setHours(23, 59, 59, 999);
  const fim = new Date(fimDoDia.getTime() + 1); // exclusivo

  const inicioDoDia = new Date(referencia);
  inicioDoDia.setHours(0, 0, 0, 0);

  if (tipo === "dia") return { inicio: inicioDoDia, fim };
  if (tipo === "semana") return { inicio: new Date(inicioDoDia.getTime() - 6 * DIA_MS), fim };
  if (tipo === "mes") return { inicio: new Date(inicioDoDia.getTime() - 29 * DIA_MS), fim };
  throw new Error(`Período desconhecido: ${tipo}`);
}

/**
 * Dado um intervalo [inicio, fim), retorna o intervalo imediatamente
 * anterior de mesma duração — usado para a visão comparativa simples
 * ("essa semana" vs "semana passada").
 *
 * @param {Date|string} inicio
 * @param {Date|string} fim
 * @returns {{ inicio: Date, fim: Date }}
 */
export function calcularPeriodoAnterior(inicio, fim) {
  const i = new Date(inicio).getTime();
  const f = new Date(fim).getTime();
  const duracao = f - i;
  return { inicio: new Date(i - duracao), fim: new Date(i) };
}

/**
 * Variação percentual entre dois valores, para a comparação de
 * período. Retorna null quando não há base de comparação (anterior
 * zerado) para o chamador exibir "—" em vez de um percentual
 * arbitrário — "+100%" quando o anterior é 0 seria um número
 * inventado, não uma variação real.
 *
 * @param {number} atual
 * @param {number} anterior
 * @returns {number|null}
 */
export function calcularVariacaoPercentual(atual, anterior) {
  const a = Number(atual) || 0;
  const b = Number(anterior) || 0;
  if (b === 0) return null;
  return ((a - b) / b) * 100;
}

/**
 * Cruza o top de produtos (retorno da RPC) com a ficha técnica
 * cadastrada (custo por porção). Produtos sem ficha vêm marcados com
 * `semCusto: true` em vez de um número inventado — regra do Jarvas
 * (nunca fabricar dado que não existe).
 *
 * @param {Array<{produto_id:number|null, nome:string, unidades:number, receita:number}>} topProdutos
 * @param {Array<{produtoId:number, rendimento:string|number, ingredientes:Array<{qtd:string|number, custoUnit:string|number}>}>} fichasTecnicas
 * @returns {Array<object>}
 */
export function calcularMargemProdutos(topProdutos, fichasTecnicas) {
  const fichasPorProduto = new Map((fichasTecnicas ?? []).map((f) => [f.produtoId, f]));

  return (topProdutos ?? []).map((p) => {
    const ficha = p.produto_id != null ? fichasPorProduto.get(p.produto_id) : null;
    if (!ficha) return { ...p, semCusto: true };

    const rendimento = parseFloat(ficha.rendimento) || 1;
    const custoTotalFicha = (ficha.ingredientes ?? []).reduce(
      (s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0),
      0,
    );
    const custoUnitario = custoTotalFicha / rendimento;
    const custoTotal = custoUnitario * (Number(p.unidades) || 0);
    const margemValor = (Number(p.receita) || 0) - custoTotal;
    const margemPercentual = p.receita > 0 ? (margemValor / p.receita) * 100 : 0;

    return { ...p, semCusto: false, custoUnitario, custoTotal, margemValor, margemPercentual };
  });
}

/**
 * Busca o relatório de vendas de um período via RPC (agregação no
 * Postgres). Sempre valida o intervalo antes de chamar o Supabase.
 *
 * @param {{inicio: Date|string, fim: Date|string, limiteProdutos?: number, timezone?: string}} params
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function buscarRelatorioVendas({ inicio, fim, limiteProdutos = 20, timezone } = {}) {
  if (!inicio || !fim) return { data: null, error: { message: "Período inválido." } };
  const inicioISO = new Date(inicio).toISOString();
  const fimISO = new Date(fim).toISOString();
  if (new Date(inicioISO) >= new Date(fimISO)) {
    return { data: null, error: { message: "A data de início deve ser anterior à data de fim." } };
  }

  // Fuso do estabelecimento para a série diária: sem ele a RPC agrupa
  // em UTC e vendas da noite (após 21h no Brasil) caem no dia seguinte.
  let tz = timezone;
  if (!tz) {
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { tz = "UTC"; }
  }

  try {
    const { data, error } = await supabase.rpc("relatorio_vendas", {
      p_inicio: inicioISO,
      p_fim: fimISO,
      p_limite_produtos: limiteProdutos,
      p_tz: tz,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao buscar o relatório de vendas." } };
  }
}

/**
 * Busca as fichas técnicas cadastradas (custo por porção), usadas para
 * a margem. Ficam em public.config (key 'fichas_tecnicas') — não é
 * uma tabela normalizada ainda, mas é um único registro pequeno, sem
 * relação com o volume de vendas.
 *
 * @returns {Promise<{data: Array<object>, error: object|null}>}
 */
export async function buscarFichasTecnicas() {
  try {
    const { data, error } = await supabase
      .from("config")
      .select("key, value")
      .eq("key", "fichas_tecnicas")
      .single();
    if (error) {
      // Nenhuma ficha cadastrada ainda não é erro — só não há linha.
      if (error.code === "PGRST116") return { data: [], error: null };
      return { data: [], error };
    }
    return { data: Array.isArray(data?.value) ? data.value : [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar fichas técnicas." } };
  }
}
