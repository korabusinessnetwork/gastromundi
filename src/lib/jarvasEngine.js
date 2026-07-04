import { supabase } from "./supabase";
import { registrarInsight, buscarInsights } from "./jarvas";

/**
 * Jarvas — motor de regras (fase 3).
 * Spec: docs/03_REGRAS_DE_NEGOCIO/JARVAS.md.
 *
 * Analisa dados já carregados pelo AppContext + eventos do jarvas_eventos e
 * registra insights/alertas/sugestões. Regras desta fase:
 *   1. Ruptura/estoque baixo            → alerta + sugestão de reposição
 *   2. Divergência de caixa             → alerta (estratégico)
 *   3. Produto em alta/queda (7d vs 7d) → insight (estratégico)
 *   4. Cancelamentos recorrentes (7d)   → alerta (estratégico)
 *   5. Previsão de ruptura (consumo médio 14d vs estoque)  → sugestão
 *   6. Previsão de faturamento semanal (média das 4 últimas semanas) → insight (estratégico)
 *
 * Previsões são estimativas determinísticas calculadas dos dados-fonte
 * (médias móveis) e sempre se declaram como estimativa na descrição.
 *
 * Princípios:
 * - Roda apenas para gerente/admin (RLS bloqueia insert para os demais).
 * - Nunca bloqueia a operação: chamador usa fire-and-forget; qualquer erro é engolido.
 * - Não inventa números: toda métrica sai dos dados-fonte, referenciados em `origem`.
 * - Deduplicação por `origem.chave` contra insights abertos recentes.
 */

const MINIMO_ESTOQUE_FALLBACK = 10;   // usado quando o produto não tem mínimo cadastrado (mesmo fallback da EstoqueView)
const TOLERANCIA_CAIXA = 1;           // R$ — divergência acima disso gera alerta
const VARIACAO_RELEVANTE = 0.3;       // ±30% em vendas 7d vs 7d anteriores
const MIN_UNIDADES_TENDENCIA = 10;    // volume mínimo para tendência ser relevante
const CANCELAMENTOS_LIMITE = 5;       // por operador em 7 dias
const THROTTLE_MS = 6 * 60 * 60 * 1000; // roda no máximo a cada 6h por dispositivo
const THROTTLE_KEY = "jarvas_ultima_analise";

const dias = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** Executa todas as regras. Chamar como fire-and-forget: `void executarAnaliseJarvas(ctx)`. */
export async function executarAnaliseJarvas({ products, estoque, estoqueMinimos, sales, fechamentos, currentUser }) {
  try {
    if (!currentUser || !["admin", "gerente"].includes(currentUser.role)) return;

    // throttle por dispositivo
    const ultima = Number(localStorage.getItem(THROTTLE_KEY) ?? 0);
    if (Date.now() - ultima < THROTTLE_MS) return;
    localStorage.setItem(THROTTLE_KEY, String(Date.now()));

    // chaves de insights ainda abertos (novo/lido) nos últimos 7 dias → dedupe
    const { data: abertos } = await buscarInsights({ status: ["novo", "lido"], limite: 200 });
    const chavesAbertas = new Set((abertos ?? []).map((i) => i?.origem?.chave).filter(Boolean));
    const jaExiste = (chave) => chavesAbertas.has(chave);

    await Promise.all([
      regraEstoque({ products, estoque, estoqueMinimos, jaExiste }),
      regraDivergenciaCaixa({ fechamentos, jaExiste }),
      regraTendenciaVendas({ sales, jaExiste }),
      regraCancelamentos({ jaExiste }),
      regraPrevisaoRuptura({ products, estoque, sales, jaExiste }),
      regraPrevisaoFaturamento({ sales, jaExiste }),
    ]);
  } catch {
    // intencionalmente silencioso — falha do Jarvas nunca afeta a operação
  }
}

// ── 1. Ruptura / estoque baixo ─────────────────────────────────────
async function regraEstoque({ products, estoque, estoqueMinimos, jaExiste }) {
  const ativos = (products ?? []).filter((p) => p.active !== false);
  const zerados = ativos.filter((p) => (estoque?.[p.id] ?? 0) === 0 && p.id in (estoque ?? {}));
  const baixos = ativos.filter((p) => {
    const q = estoque?.[p.id] ?? 0;
    const min = estoqueMinimos?.[p.id] ?? MINIMO_ESTOQUE_FALLBACK;
    return q > 0 && q <= min;
  });

  const hoje = new Date().toISOString().slice(0, 10);

  if (zerados.length > 0 && !jaExiste(`estoque:ruptura:${hoje}`)) {
    const nomes = zerados.slice(0, 10).map((p) => p.name);
    await registrarInsight({
      tipo: "alerta",
      severidade: "danger",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: `Ruptura de estoque: ${zerados.length} produto(s) zerado(s)`,
      descricao: `Sem estoque: ${nomes.join(", ")}${zerados.length > 10 ? "…" : ""}. Vendas destes itens podem ser perdidas.`,
      acao: { label: "Repor estoque", tipo: "abrir_estoque", params: { produto_ids: zerados.map((p) => p.id) } },
      origem: { chave: `estoque:ruptura:${hoje}`, dados: { produtos: zerados.map((p) => ({ id: p.id, nome: p.name })) } },
    });
  }

  if (baixos.length > 0 && !jaExiste(`estoque:baixo:${hoje}`)) {
    const lista = baixos.slice(0, 10).map((p) => `${p.name} (${estoque[p.id]}/${estoqueMinimos?.[p.id] ?? MINIMO_ESTOQUE_FALLBACK})`);
    await registrarInsight({
      tipo: "sugestao",
      severidade: "warning",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: `Estoque baixo em ${baixos.length} produto(s)`,
      descricao: `Abaixo do mínimo cadastrado: ${lista.join(", ")}${baixos.length > 10 ? "…" : ""}.`,
      acao: { label: "Planejar reposição", tipo: "abrir_estoque", params: { produto_ids: baixos.map((p) => p.id) } },
      origem: { chave: `estoque:baixo:${hoje}`, dados: { produtos: baixos.map((p) => ({ id: p.id, nome: p.name, qtd: estoque[p.id], minimo: estoqueMinimos?.[p.id] ?? MINIMO_ESTOQUE_FALLBACK })) } },
    });
  }
}

// ── 2. Divergência de caixa ────────────────────────────────────────
async function regraDivergenciaCaixa({ fechamentos, jaExiste }) {
  const ultimo = (fechamentos ?? [])[0];
  const d = ultimo?.data ?? ultimo;
  if (!d || typeof d.totalVendas !== "number" || typeof d.totalConferido !== "number") return;

  const diff = d.totalConferido - d.totalVendas;
  const chave = `caixa:divergencia:${ultimo.id ?? ultimo.created_at ?? "ultimo"}`;
  if (Math.abs(diff) <= TOLERANCIA_CAIXA || jaExiste(chave)) return;

  await registrarInsight({
    tipo: "alerta",
    severidade: Math.abs(diff) > 50 ? "danger" : "warning",
    visibilidade: "estrategico",
    modulo: "caixa",
    titulo: `Divergência de caixa: R$ ${diff.toFixed(2)}`,
    descricao: `Último fechamento: vendas R$ ${d.totalVendas.toFixed(2)} vs conferido R$ ${d.totalConferido.toFixed(2)} (${diff > 0 ? "sobra" : "falta"}).`,
    acao: { label: "Revisar fechamento", tipo: "abrir_fechamentos", params: {} },
    origem: { chave, dados: { fechamento_id: ultimo.id ?? null, totalVendas: d.totalVendas, totalConferido: d.totalConferido } },
  });
}

// ── 3. Produto em alta / queda (7d vs 7d anteriores) ───────────────
async function regraTendenciaVendas({ sales, jaExiste }) {
  const corte7 = dias(7);
  const corte14 = dias(14);
  const porProduto = {}; // nome → { rec, ant }

  for (const s of sales ?? []) {
    const venda = s?.data ?? s;
    const em = new Date(venda?.at ?? s?.at ?? 0);
    if (em < corte14) continue;
    const janela = em >= corte7 ? "rec" : "ant";
    for (const it of venda?.items ?? []) {
      if (it?.cancelado || !it?.name) continue;
      porProduto[it.name] = porProduto[it.name] ?? { rec: 0, ant: 0 };
      porProduto[it.name][janela] += it.qty ?? 1;
    }
  }

  const semana = new Date().toISOString().slice(0, 10);
  let melhor = null, pior = null;
  for (const [nome, { rec, ant }] of Object.entries(porProduto)) {
    if (rec + ant < MIN_UNIDADES_TENDENCIA || ant === 0) continue;
    const varia = (rec - ant) / ant;
    if (varia >= VARIACAO_RELEVANTE && (!melhor || varia > melhor.varia)) melhor = { nome, rec, ant, varia };
    if (varia <= -VARIACAO_RELEVANTE && (!pior || varia < pior.varia)) pior = { nome, rec, ant, varia };
  }

  if (melhor && !jaExiste(`vendas:alta:${semana}`)) {
    await registrarInsight({
      tipo: "insight",
      severidade: "info",
      visibilidade: "estrategico",
      modulo: "pdv",
      titulo: `${melhor.nome} em alta: +${Math.round(melhor.varia * 100)}% na semana`,
      descricao: `${melhor.rec} unidade(s) nos últimos 7 dias vs ${melhor.ant} nos 7 anteriores. Garanta estoque e considere destacar o item.`,
      acao: { label: "Ver relatório de vendas", tipo: "abrir_relatorio", params: { produto: melhor.nome } },
      origem: { chave: `vendas:alta:${semana}`, dados: melhor },
    });
  }

  if (pior && !jaExiste(`vendas:queda:${semana}`)) {
    await registrarInsight({
      tipo: "insight",
      severidade: "warning",
      visibilidade: "estrategico",
      modulo: "pdv",
      titulo: `${pior.nome} em queda: ${Math.round(pior.varia * 100)}% na semana`,
      descricao: `${pior.rec} unidade(s) nos últimos 7 dias vs ${pior.ant} nos 7 anteriores. Avalie preço, exposição ou promoção.`,
      acao: { label: "Ver relatório de vendas", tipo: "abrir_relatorio", params: { produto: pior.nome } },
      origem: { chave: `vendas:queda:${semana}`, dados: pior },
    });
  }
}

// ── 5. Previsão de ruptura (consumo médio 14d vs estoque atual) ────
async function regraPrevisaoRuptura({ products, estoque, sales, jaExiste }) {
  const corte14 = dias(14);
  const consumo = {}; // produtoId → unidades vendidas em 14d

  for (const s of sales ?? []) {
    const venda = s?.data ?? s;
    if (new Date(venda?.at ?? s?.at ?? 0) < corte14) continue;
    for (const it of venda?.items ?? []) {
      if (it?.cancelado || !it?.id) continue;
      consumo[it.id] = (consumo[it.id] ?? 0) + (it.qty ?? 1);
    }
  }

  const emRisco = [];
  for (const p of products ?? []) {
    if (p.active === false) continue;
    const qtd = estoque?.[p.id] ?? 0;
    const porDia = (consumo[p.id] ?? 0) / 14;
    if (qtd <= 0 || porDia <= 0) continue; // zerados já são cobertos pela regra 1
    const diasRestantes = qtd / porDia;
    if (diasRestantes <= 3) emRisco.push({ id: p.id, nome: p.name, qtd, porDia: +porDia.toFixed(2), diasRestantes: +diasRestantes.toFixed(1) });
  }
  if (emRisco.length === 0) return;

  emRisco.sort((a, b) => a.diasRestantes - b.diasRestantes);
  const hoje = new Date().toISOString().slice(0, 10);
  const chave = `estoque:previsao_ruptura:${hoje}`;
  if (jaExiste(chave)) return;

  const lista = emRisco.slice(0, 5).map((p) => `${p.nome} (~${p.diasRestantes}d)`);
  await registrarInsight({
    tipo: "sugestao",
    severidade: "warning",
    visibilidade: "operacional",
    modulo: "estoque",
    titulo: `Ruptura prevista em até 3 dias: ${emRisco.length} produto(s)`,
    descricao: `Estimativa pelo consumo médio dos últimos 14 dias: ${lista.join(", ")}${emRisco.length > 5 ? "…" : ""}. Reponha antes de esgotar.`,
    acao: { label: "Planejar reposição", tipo: "abrir_estoque", params: { produto_ids: emRisco.map((p) => p.id) } },
    origem: { chave, dados: { metodo: "consumo médio 14d", produtos: emRisco } },
  });
}

// ── 6. Previsão de faturamento semanal (média das 4 últimas) ───────
async function regraPrevisaoFaturamento({ sales, jaExiste }) {
  const somaSemana = [0, 0, 0, 0]; // 0 = semana passada … 3 = 4 semanas atrás
  for (const s of sales ?? []) {
    const venda = s?.data ?? s;
    const em = new Date(venda?.at ?? s?.at ?? 0).getTime();
    const idade = Date.now() - em;
    const semana = Math.floor(idade / (7 * 24 * 60 * 60 * 1000)) - 1; // ignora a semana corrente (parcial)
    if (semana < 0 || semana > 3) continue;
    somaSemana[semana] += Number(venda?.total ?? 0);
  }

  const semanasComVenda = somaSemana.filter((v) => v > 0).length;
  if (semanasComVenda < 2) return; // histórico insuficiente para estimar

  const media = somaSemana.reduce((a, b) => a + b, 0) / semanasComVenda;
  const chaveSemana = new Date().toISOString().slice(0, 10);
  const chave = `financeiro:previsao_semana:${chaveSemana}`;
  if (jaExiste(chave)) return;

  const ultima = somaSemana[0];
  const tendencia = ultima > 0 && media > 0 ? ((ultima - media) / media) * 100 : 0;
  await registrarInsight({
    tipo: "insight",
    severidade: "info",
    visibilidade: "estrategico",
    modulo: "financeiro",
    titulo: `Faturamento previsto para a semana: R$ ${media.toFixed(2)}`,
    descricao: `Estimativa pela média das últimas ${semanasComVenda} semana(s) com venda. Semana passada: R$ ${ultima.toFixed(2)} (${tendencia >= 0 ? "+" : ""}${tendencia.toFixed(0)}% vs média).`,
    acao: { label: "Ver relatório de vendas", tipo: "abrir_relatorio", params: {} },
    origem: { chave, dados: { metodo: "média móvel 4 semanas (sem a corrente)", somaSemana, media: +media.toFixed(2) } },
  });
}

// ── 4. Cancelamentos recorrentes por operador (7 dias) ─────────────
async function regraCancelamentos({ jaExiste }) {
  const { data: eventos, error } = await supabase
    .from("jarvas_eventos")
    .select("id, operator_id, payload, created_at")
    .eq("tipo", "pedido.cancelado")
    .gte("created_at", dias(7).toISOString())
    .limit(500);
  if (error || !eventos?.length) return;

  const porOperador = {};
  for (const e of eventos) {
    const op = e.operator_id ?? "desconhecido";
    porOperador[op] = porOperador[op] ?? [];
    porOperador[op].push(e.id);
  }

  const semana = new Date().toISOString().slice(0, 10);
  for (const [op, ids] of Object.entries(porOperador)) {
    if (ids.length < CANCELAMENTOS_LIMITE) continue;
    const chave = `pedidos:cancelamentos:${op}:${semana}`;
    if (jaExiste(chave)) continue;
    await registrarInsight({
      tipo: "alerta",
      severidade: "warning",
      visibilidade: "estrategico",
      modulo: "pedidos",
      titulo: `${ids.length} cancelamentos em 7 dias por ${op}`,
      descricao: `O operador "${op}" registrou ${ids.length} cancelamento(s) de comanda na última semana. Vale revisar os motivos nos logs.`,
      acao: { label: "Ver logs do operador", tipo: "abrir_logs", params: { operador: op } },
      origem: { chave, evento_ids: ids, dados: { operador: op, quantidade: ids.length } },
    });
  }
}
