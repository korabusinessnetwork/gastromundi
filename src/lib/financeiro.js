import { supabase } from "./supabase";
import { emitirEvento } from "./jarvas";
import { round2 } from "./vendas";

/**
 * Financeiro — fase 1 (docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md).
 *
 * Lançamentos (receita/despesa), receita automática por venda, fiado
 * como conta a receber, baixa de contas e fluxo de caixa previsto vs
 * realizado. NÃO cobre nesta fase: estorno/reversão, margem por
 * custo de estoque, conciliação bancária, DRE, centros de custo.
 *
 * Requer a migração supabase/migrations/20260710_financeiro.sql aplicada.
 */

/**
 * Cria um lançamento (despesa/conta manual ou receita automática de venda).
 * Valida: valor > 0, competência obrigatória, vencimento obrigatório
 * quando o status é 'previsto' (contas a pagar/receber).
 *
 * @param {object} dados
 * @param {"receita"|"despesa"} dados.tipo
 * @param {string} dados.categoria
 * @param {string} [dados.descricao]
 * @param {number} dados.valor
 * @param {string} dados.competencia - YYYY-MM-DD
 * @param {string} [dados.vencimento] - YYYY-MM-DD
 * @param {"previsto"|"pago"|"recebido"} [dados.status] - default "previsto"
 * @param {"venda"|"manual"|"estoque"} [dados.origem] - default "manual"
 * @param {string} [dados.venda_id]
 * @param {string} [dados.cliente_id] - F010: vínculo do fiado ao cliente
 * @param {boolean} [dados.retroativo]
 * @param {string} usuario - username de quem lançou
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function criarLancamento(dados, usuario) {
  const valor = Number(dados?.valor);
  if (!(valor > 0)) {
    return { data: null, error: { message: "Valor deve ser maior que zero." } };
  }
  // Tipo fora de receita/despesa passa pelo insert e depois não é somado nem
  // como entrada nem como saída: o valor existe na tabela e não aparece em
  // nenhum card. Barrar aqui é a única forma de o dinheiro nunca ficar órfão.
  if (dados?.tipo !== "receita" && dados?.tipo !== "despesa") {
    return { data: null, error: { message: "Tipo deve ser receita ou despesa." } };
  }
  if (!String(dados?.categoria ?? "").trim()) {
    return { data: null, error: { message: "Categoria é obrigatória." } };
  }
  if (!dados?.competencia) {
    return { data: null, error: { message: "Competência é obrigatória." } };
  }
  const status = dados.status ?? "previsto";
  if (status === "previsto" && !dados.vencimento) {
    return { data: null, error: { message: "Vencimento é obrigatório para lançamentos previstos." } };
  }

  const payload = {
    tipo: dados.tipo,
    categoria: dados.categoria,
    descricao: dados.descricao ?? null,
    valor,
    competencia: dados.competencia,
    vencimento: dados.vencimento ?? null,
    status,
    origem: dados.origem ?? "manual",
    venda_id: dados.venda_id ?? null,
    cliente_id: dados.cliente_id ?? null,
    retroativo: !!dados.retroativo,
    criado_por: usuario ?? null,
  };

  const { data, error } = await supabase.from("lancamentos").insert(payload).select().single();
  if (!error) {
    emitirEvento("financeiro.lancamento.criado", "financeiro", {
      lancamento_id: data?.id,
      tipo: payload.tipo,
      categoria: payload.categoria,
      valor,
      origem: payload.origem,
    }, usuario);
  }
  return { data, error };
}

/**
 * Baixa uma conta: previsto → pago (despesa) ou recebido (receita).
 * Grava quem baixou e quando.
 *
 * @param {string} id
 * @param {string} usuario
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function baixarConta(id, usuario) {
  const { data: atual, error: eSelect } = await supabase
    .from("lancamentos").select("id, tipo").eq("id", id).single();
  if (eSelect) return { data: null, error: eSelect };

  const novoStatus = atual.tipo === "despesa" ? "pago" : "recebido";
  const { data, error } = await supabase
    .from("lancamentos")
    .update({ status: novoStatus, baixado_por: usuario ?? null, baixado_em: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (!error) {
    emitirEvento("financeiro.conta.baixada", "financeiro", { lancamento_id: id, status: novoStatus }, usuario);
  }
  return { data, error };
}

/**
 * Lista lançamentos com filtros opcionais, mais recentes por competência primeiro.
 *
 * @param {object} [opts]
 * @param {string} [opts.de] - YYYY-MM-DD
 * @param {string} [opts.ate] - YYYY-MM-DD
 * @param {"receita"|"despesa"} [opts.tipo]
 * @param {"previsto"|"pago"|"recebido"|"vencido"} [opts.status]
 * @returns {Promise<{data: object[]|null, error: object|null}>}
 */
export async function listarLancamentos({ de, ate, tipo, status } = {}) {
  // Colunas explícitas — tabela financeira, nunca select * (CLAUDE.md/Segurança)
  let query = supabase
    .from("lancamentos")
    .select("id,tipo,categoria,descricao,valor,competencia,vencimento,status,origem,venda_id,retroativo,criado_por,baixado_por,baixado_em,created_at,cliente_id")
    .order("competencia", { ascending: false });
  if (de) query = query.gte("competencia", de);
  if (ate) query = query.lte("competencia", ate);
  if (tipo) query = query.eq("tipo", tipo);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  return { data, error };
}

/**
 * Marca no banco (update em lote) os lançamentos previstos vencidos e
 * emite um evento por conta recém-vencida. Retorna os lançamentos com
 * o status local já refletindo a mudança (evita precisar recarregar).
 *
 * @param {object[]} lancamentos
 * @param {Date|string} [hoje]
 * @returns {Promise<object[]>}
 */
export async function processarVencidos(lancamentos, hoje = new Date()) {
  const idsVencidos = marcarVencidos(lancamentos, hoje);
  if (idsVencidos.length === 0) return lancamentos ?? [];

  const { error } = await supabase.from("lancamentos").update({ status: "vencido" }).in("id", idsVencidos);
  if (error) {
    console.error("[financeiro] falha ao marcar vencidos:", error);
    return lancamentos ?? [];
  }

  for (const id of idsVencidos) {
    emitirEvento("financeiro.conta.vencida", "financeiro", { lancamento_id: id }, null);
  }

  const vencidosSet = new Set(idsVencidos);
  return (lancamentos ?? []).map((l) => (vencidosSet.has(l.id) ? { ...l, status: "vencido" } : l));
}

// ── Funções puras (testadas em financeiro.test.js) ────────────────

/**
 * Status de conta EM ABERTO: o dinheiro ainda não entrou nem saiu, então
 * continua sendo "a receber / a pagar". `vencido` é só um `previsto` atrasado —
 * é a conta mais urgente que existe, e por isso não pode desaparecer da conta
 * do previsto nem perder o botão de baixa (era o defeito da Run 2).
 */
const STATUS_EM_ABERTO = ["previsto", "vencido"];

/** Status de conta já liquidada: virou dinheiro de verdade no período. */
const STATUS_REALIZADO = ["pago", "recebido"];

/**
 * A conta ainda pode ser baixada (marcada como paga/recebida)?
 *
 * @param {object} lancamento
 * @returns {boolean}
 */
export function contaEmAberto(lancamento) {
  return STATUS_EM_ABERTO.includes(lancamento?.status);
}

/**
 * Calcula o fluxo de caixa previsto vs realizado num período.
 * "Previsto" = contas em aberto ('previsto' ou 'vencido') cuja competência cai
 * no período; "realizado" = status 'pago'/'recebido' no período.
 *
 * @param {object[]} lancamentos
 * @param {Date|string} de
 * @param {Date|string} ate
 * @returns {{ previsto: {entradas:number, saidas:number, saldo:number}, realizado: {entradas:number, saidas:number, saldo:number} }}
 */
export function calcularFluxoCaixa(lancamentos, de, ate) {
  const inicio = new Date(de).getTime();
  const fim = new Date(ate).getTime();

  const doPeriodo = (lancamentos ?? []).filter((l) => {
    const t = new Date(l.competencia).getTime();
    return t >= inicio && t <= fim;
  });

  // round2 na soma: sem ele, R$ 39,90 + R$ 8,70 = 48.599999999999994 e um saldo
  // exatamente zerado sai como -0.000000000000007 — a tela mostra "-R$ 0.00"
  // em vermelho, como se o negócio estivesse no vermelho.
  const somar = (lista, tipo) =>
    round2(lista.filter((l) => l.tipo === tipo).reduce((s, l) => s + (Number(l.valor) || 0), 0));

  const previstos  = doPeriodo.filter((l) => contaEmAberto(l));
  const realizados = doPeriodo.filter((l) => STATUS_REALIZADO.includes(l.status));

  const previstoEntradas  = somar(previstos, "receita");
  const previstoSaidas    = somar(previstos, "despesa");
  const realizadoEntradas = somar(realizados, "receita");
  const realizadoSaidas   = somar(realizados, "despesa");

  return {
    previsto:  { entradas: previstoEntradas,  saidas: previstoSaidas,  saldo: round2(previstoEntradas  - previstoSaidas)  },
    realizado: { entradas: realizadoEntradas, saidas: realizadoSaidas, saldo: round2(realizadoEntradas - realizadoSaidas) },
  };
}

/**
 * Data de CALENDÁRIO (YYYY-MM-DD) de um valor. Para `Date` usa os componentes
 * LOCAIS (não UTC): é assim que o operador enxerga "hoje". Para string
 * date-only devolve os 10 primeiros caracteres como estão. Evita o bug de
 * comparar `new Date("2026-07-15")` (meia-noite UTC) com `new Date()` (agora
 * local): em BRT a conta que vence hoje era lida como já vencida no próprio dia.
 *
 * @param {Date|string} valor
 * @returns {string} YYYY-MM-DD
 */
function dataCalendario(valor) {
  if (valor instanceof Date) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }
  return String(valor).slice(0, 10);
}

/**
 * Retorna os ids dos lançamentos previstos cujo vencimento já passou.
 * Compara por DATA de calendário: o que vence hoje NÃO conta como vencido —
 * só o que venceu em dias anteriores.
 *
 * @param {object[]} lancamentos
 * @param {Date|string} [hoje]
 * @returns {string[]}
 */
export function marcarVencidos(lancamentos, hoje = new Date()) {
  const hojeStr = dataCalendario(hoje);
  return (lancamentos ?? [])
    .filter((l) => l.status === "previsto" && l.vencimento && dataCalendario(l.vencimento) < hojeStr)
    .map((l) => l.id);
}
