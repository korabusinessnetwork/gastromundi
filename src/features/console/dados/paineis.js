import { supabase } from "@/lib/supabase";
import { calcularStatusAssinatura, calcularDiasParaVencimento } from "@/lib/assinatura";
import { URGENCIA_STATUS, precisaAtencao } from "../regras/lista";

// Painéis do Console: resumo da plataforma, uso e saúde dos estabelecimentos.
/**
 * Função PURA — agrega tenants + planos + assinaturas na visão da
 * plataforma (dashboard do Console): status recalculado por tenant, KPIs,
 * o "alerta de validade" (quem precisa de ação) e a distribuição por
 * plano. Não faz I/O — testável isoladamente (CLAUDE.md: função pura
 * nasce com teste).
 *
 * O status NÃO vem do cache do banco: é recalculado com
 * `calcularStatusAssinatura` (mesma fonte de verdade da Fase 4), exceto
 * 'cancelado', que é manual e nunca recalculado (espelha o SQL). Tenant
 * sem linha de assinatura vira status 'sem_assinatura' (não é erro).
 *
 * MRR = soma das mensalidades da base que efetivamente paga (ativo +
 * carência); bloqueado/cancelado/sem_assinatura não contam como receita.
 *
 * @param {Array<{id:string, nome:string, plano_codigo?:string}>} tenants
 * @param {Array<{codigo:string, nome:string}>} planos
 * @param {Array<{tenant_id:string, valor_mensal:number, data_vencimento:string, carencia_dias:number, status:string}>} assinaturas
 * @param {Date} [hoje]
 * @returns {{linhas:Array<object>, kpis:object, precisamAtencao:Array<object>, distribuicaoPlano:Array<object>}}
 */
export function resumirPlataforma(tenants = [], planos = [], assinaturas = [], hoje = new Date()) {
  const porTenant = new Map((assinaturas ?? []).map((a) => [a.tenant_id, a]));
  const nomePlano = new Map((planos ?? []).map((p) => [p.codigo, p.nome]));

  const linhas = (tenants ?? []).map((t) => {
    const a = porTenant.get(t.id) ?? null;
    let status = "sem_assinatura";
    let diasParaVencer = null;
    if (a) {
      status = a.status === "cancelado"
        ? "cancelado"
        : calcularStatusAssinatura(a.data_vencimento, a.carencia_dias, hoje);
      diasParaVencer = calcularDiasParaVencimento(a.data_vencimento, hoje);
    }
    return {
      tenantId: t.id,
      nome: t.nome,
      planoCodigo: t.plano_codigo ?? null,
      planoNome: t.plano_codigo ? (nomePlano.get(t.plano_codigo) ?? t.plano_codigo) : null,
      valorMensal: a ? (Number(a.valor_mensal) || 0) : 0,
      dataVencimento: a?.data_vencimento ?? null,
      diasParaVencer,
      status, // ativo | carencia | bloqueado | cancelado | sem_assinatura
    };
  });

  const contar = (s) => linhas.filter((l) => l.status === s).length;

  const kpis = {
    totalTenants: linhas.length,
    ativos: contar("ativo"),
    emCarencia: contar("carencia"),
    bloqueados: contar("bloqueado"),
    cancelados: contar("cancelado"),
    semAssinatura: contar("sem_assinatura"),
    mrr: linhas
      .filter((l) => l.status === "ativo" || l.status === "carencia")
      .reduce((soma, l) => soma + l.valorMensal, 0),
    // Quantos da base que PAGA estão sem mensalidade definida. Existe porque
    // `valor_mensal` nasce em 0 (20260719/20260908) e por muito tempo nada no
    // sistema o escrevia: o MRR acima somava zero com clientes reais na base e
    // a tela afirmava "Receita mensal R$ 0,00" como se fosse fato. Este número
    // é o que permite à tela dizer POR QUE o MRR está baixo.
    semPreco: linhas.filter(
      (l) => (l.status === "ativo" || l.status === "carencia") && l.valorMensal <= 0
    ).length,
  };

  // Alerta de validade — o "alerta" que saiu do banner do tenant e passou
  // a viver no Console: quem precisa de ação da plataforma AGORA.
  //
  // 'sem_assinatura' entra e vem primeiro: é o único estado em que o
  // estabelecimento opera sem NUNCA ser cobrado — não bloqueia (as policies
  // de 20260720 liberam quem não tem linha), não conta no MRR e não aparece
  // em nenhum outro lugar da tela. Ficar fora daqui era justamente o que
  // fazia um cliente vendido operar de graça para sempre em silêncio.
  //
  // 'cancelado' continua fora de propósito: é decisão manual da plataforma
  // (já resolvido), não pendência.
  const precisamAtencao = linhas
    .filter(precisaAtencao)
    .sort((a, b) =>
      (URGENCIA_STATUS[a.status] ?? 9) - (URGENCIA_STATUS[b.status] ?? 9) ||
      (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0)
    );

  // Distribuição por plano, na ordem do catálogo; só planos com ao menos
  // um tenant (não polui a tela com planos vazios).
  const distribuicaoPlano = (planos ?? [])
    .map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      quantidade: linhas.filter((l) => l.planoCodigo === p.codigo).length,
    }))
    .filter((d) => d.quantidade > 0);

  return { linhas, kpis, precisamAtencao, distribuicaoPlano };
}

/** Períodos aceitos pela RPC `analytics_plataforma` (20260912) — a lista é
 *  fechada no BANCO; aqui é só o que a tela oferece. */
export const PERIODOS_ANALYTICS = [7, 30, 90];

/**
 * Uso da base por estabelecimento (F022-ANALYTICS) via RPC
 * `analytics_plataforma` (20260912): faturamento, pedidos e última venda.
 *
 * Por que RPC e não `.from("vendas")`: a policy de `vendas` NÃO tem o ramo
 * `OR is_super_admin()` — e isso é decisão escrita (ADR-008, decisão v2
 * nº 2), não esquecimento. O super-admin não lê o dado operacional bruto
 * de todos os tenants; lê AGREGADO, por uma RPC SECURITY DEFINER que
 * revalida o papel dentro do banco. Uma leitura direta daqui voltaria
 * vazia, e é assim que tem que ser.
 *
 * A RPC devolve só quatro colunas, nenhuma identificando uma venda.
 *
 * Nunca lança: falha de rede/RLS/função ausente volta como
 * { data: [], error } — a tela precisa dizer que não sabe, não mostrar zero.
 *
 * @param {number} dias 7, 30 ou 90 (o banco recusa o resto)
 * @returns {Promise<{data: Array<{tenant_id:string, faturamento_centavos:number, pedidos:number, ultima_venda:string|null}>, error: object|null}>}
 */
export async function listarAnalitico(dias = 30) {
  try {
    const { data, error } = await supabase.rpc("analytics_plataforma", { p_dias: dias });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao carregar o uso dos estabelecimentos." } };
  }
}

/** Dias de CALENDÁRIO desde uma data ISO. `null` quando não há data (nunca
 *  vendeu) ou quando a data é inválida — a tela distingue "nunca" de "há 0
 *  dias".
 *
 *  A conta é de dias de calendário, não de intervalo decorrido: a venda das
 *  22h de ontem vista às 9h de hoje passou 11 horas, e `floor(11h/24h)` daria
 *  0 — a tela diria "Hoje" para um estabelecimento que ainda não abriu o
 *  caixa. Normalizamos as duas pontas para o dia local antes de subtrair.
 *  `ultima_venda` é `timestamptz`, então os getters locais são os corretos. */
export function diasDesde(iso, hoje) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diaVenda = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diaHoje = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((diaHoje - diaVenda) / 86400000));
}

/**
 * Função PURA — cruza os estabelecimentos, as assinaturas e o agregado de
 * uso na visão "a base está operando?". Não faz I/O (CLAUDE.md: função
 * pura nasce com teste).
 *
 * O cruzamento é o produto aqui: faturamento sozinho é um número; o que o
 * dono precisa ver é **quem paga e não usa** — assinatura em dia e zero
 * pedidos no período. Esse é o churn que hoje só aparece no cancelamento.
 *
 * "Paga" usa o mesmo critério do MRR de `resumirPlataforma` (ativo ou
 * carência, com o status recalculado por `calcularStatusAssinatura`, não o
 * cache do banco). Bloqueado fica fora de propósito: perdeu o acesso, não
 * vender é consequência, não sintoma. Cancelado e sem assinatura também —
 * não pagam.
 *
 * Dinheiro em CENTAVOS INTEIROS do começo ao fim: a RPC já devolve assim e
 * nada aqui divide por 100 — isso é trabalho da formatação, na tela.
 *
 * @param {Array<{id:string, nome:string}>} tenants
 * @param {Array<{tenant_id:string, data_vencimento:string, carencia_dias:number, status:string}>} assinaturas
 * @param {Array<{tenant_id:string, faturamento_centavos:number, pedidos:number, ultima_venda:string|null}>} analitico
 * @param {Date} [hoje]
 * @returns {{linhas:Array<object>, kpis:object, pagandoSemUso:Array<object>}}
 */
export function resumirUso(tenants = [], assinaturas = [], analitico = [], hoje = new Date()) {
  const usoDe = new Map((analitico ?? []).map((u) => [u.tenant_id, u]));
  const assinaturaDe = new Map((assinaturas ?? []).map((a) => [a.tenant_id, a]));

  const linhas = (tenants ?? []).map((t) => {
    const u = usoDe.get(t.id) ?? null;
    const a = assinaturaDe.get(t.id) ?? null;
    // Number(undefined) é NaN e NaN || 0 é 0 — o `|| 0` cobre ausente,
    // nulo e lixo de uma vez.
    const faturamentoCentavos = Math.round(Number(u?.faturamento_centavos) || 0);
    const pedidos = Math.trunc(Number(u?.pedidos) || 0);

    let statusAssinatura = "sem_assinatura";
    if (a) {
      statusAssinatura = a.status === "cancelado"
        ? "cancelado"
        : calcularStatusAssinatura(a.data_vencimento, a.carencia_dias, hoje);
    }

    return {
      tenantId: t.id,
      nome: t.nome,
      faturamentoCentavos,
      pedidos,
      // Divisão inteira: ticket médio de 3 pedidos somando 1000 centavos é
      // 333, não 333.3333. Sem pedido não existe ticket — `null` vira "—"
      // na tela, nunca 0 (que leria como "vendeu de graça").
      ticketMedioCentavos: pedidos > 0 ? Math.round(faturamentoCentavos / pedidos) : null,
      ultimaVenda: u?.ultima_venda ?? null,
      diasSemVender: diasDesde(u?.ultima_venda, hoje),
      paga: statusAssinatura === "ativo" || statusAssinatura === "carencia",
    };
  });

  // Quem mais fatura primeiro. Empate em zero é o caso comum (base nova):
  // desempata por pedidos e depois por nome, para a lista não dançar entre
  // dois carregamentos.
  const ordenadas = [...linhas].sort(
    (x, y) =>
      y.faturamentoCentavos - x.faturamentoCentavos ||
      y.pedidos - x.pedidos ||
      String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR")
  );

  const faturamentoCentavos = linhas.reduce((s, l) => s + l.faturamentoCentavos, 0);
  const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0);

  // Paga e não vendeu nada no período. Mais tempo parado = mais urgente;
  // "nunca vendeu" (sem data) é o pior de todos e vem primeiro. O sentinela
  // é finito de propósito: com Infinity, dois "nunca vendeu" dariam
  // `Infinity - Infinity` = NaN e o comparador ficaria indefinido.
  const NUNCA = Number.MAX_SAFE_INTEGER;
  const pagandoSemUso = ordenadas
    .filter((l) => l.paga && l.pedidos === 0)
    .sort((x, y) => (y.diasSemVender ?? NUNCA) - (x.diasSemVender ?? NUNCA));

  return {
    linhas: ordenadas,
    kpis: {
      faturamentoCentavos,
      pedidos,
      ticketMedioCentavos: pedidos > 0 ? Math.round(faturamentoCentavos / pedidos) : null,
      operando: linhas.filter((l) => l.pedidos > 0).length,
      semUso: pagandoSemUso.length,
    },
    pagandoSemUso,
  };
}

/**
 * Saúde da operação por estabelecimento (F022-SAUDE) via RPC
 * `saude_plataforma` (20260928): nota fiscal recusada ou parada e
 * impressão com erro ou parada.
 *
 * Por que RPC e não `.from("nfce_emitidas")`: as duas tabelas são
 * OPERACIONAIS, e a policy de tabela operacional não tem o ramo
 * `OR is_super_admin()` — decisão escrita (ADR-008, decisão v2 nº 2).
 * Uma leitura direta daqui voltaria vazia, e é assim que tem que ser.
 * A RPC devolve contagem e a data do mais antigo, nunca a linha do
 * documento: nem a chave da nota, nem o que a comanda mandava imprimir.
 *
 * Nunca lança: falha de rede/RLS/função ausente volta como
 * { data: [], error } — a tela precisa dizer que não sabe, não afirmar
 * que está tudo certo numa base onde a leitura falhou.
 *
 * @param {number} dias 7, 30 ou 90 (o banco recusa o resto)
 * @returns {Promise<{data: Array<object>, error: object|null}>}
 */
export async function listarSaude(dias = 30) {
  try {
    const { data, error } = await supabase.rpc("saude_plataforma", { p_dias: dias });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao carregar a saúde dos estabelecimentos." } };
  }
}

/**
 * Função PURA — cruza os estabelecimentos com o agregado de saúde na
 * visão "para quem o sistema está quebrado". Não faz I/O (CLAUDE.md:
 * função pura nasce com teste).
 *
 * A distinção que o produto exige, e que a RPC já entrega separada:
 *
 *   • RECUSADA e COM ERRO são eventos do período. Contam quantas vezes
 *     falhou, e servem para ver se o problema é crônico.
 *   • PARADA é estado de agora, sem corte de período. É o que precisa de
 *     ação hoje, e é por ela que a lista é ordenada.
 *
 * A gravidade não é a soma das duas: um estabelecimento com 1 nota parada
 * há 40 dias está pior que outro com 30 notas paradas desde hoje de manhã.
 * Por isso a ordenação é por há quanto tempo está parado primeiro, e só
 * depois por quantidade.
 *
 * Tenant que a RPC não devolveu (nunca emitiu nota nem imprimiu nada) entra
 * na lista com tudo zerado, e NÃO entra em `quebrados`: ausência de linha
 * é ausência de falha, não falha desconhecida.
 *
 * @param {Array<{id:string, nome:string}>} tenants
 * @param {Array<object>} saude  linhas da RPC `saude_plataforma`
 * @param {Date} [hoje]
 * @returns {{linhas:Array<object>, kpis:object, quebrados:Array<object>}}
 */
export function resumirSaude(tenants = [], saude = [], hoje = new Date()) {
  const saudeDe = new Map((saude ?? []).map((s) => [s.tenant_id, s]));

  const inteiro = (v) => Math.max(0, Math.trunc(Number(v) || 0));

  const linhas = (tenants ?? []).map((t) => {
    const s = saudeDe.get(t.id) ?? null;
    const fiscaisParadas = inteiro(s?.fiscais_paradas);
    const impressoesParadas = inteiro(s?.impressoes_paradas);

    // A data só vale quando existe pendência. O banco já devolve `null`
    // quando não há nenhuma, mas depender disso deixaria a tela mostrar
    // "parado desde terça" para quem tem zero parado se a RPC mudar.
    const fiscalParadaDesde = fiscaisParadas > 0 ? (s?.fiscal_parada_desde ?? null) : null;
    const impressaoParadaDesde = impressoesParadas > 0 ? (s?.impressao_parada_desde ?? null) : null;

    const diasFiscal = diasDesde(fiscalParadaDesde, hoje);
    const diasImpressao = diasDesde(impressaoParadaDesde, hoje);

    return {
      tenantId: t.id,
      nome: t.nome,
      fiscaisRecusadas: inteiro(s?.fiscais_recusadas),
      fiscaisParadas,
      fiscalParadaDesde,
      diasFiscalParada: diasFiscal,
      impressoesComErro: inteiro(s?.impressoes_com_erro),
      impressoesParadas,
      impressaoParadaDesde,
      diasImpressaoParada: diasImpressao,
      paradas: fiscaisParadas + impressoesParadas,
      // Há quanto tempo a coisa mais antiga está parada, seja qual for.
      // `null` quando não há nada parado — a tela distingue isso de "há 0
      // dias", que é a pendência que nasceu hoje.
      diasParado: diasFiscal == null && diasImpressao == null
        ? null
        : Math.max(diasFiscal ?? 0, diasImpressao ?? 0),
    };
  });

  // Quebrado é quem tem algo PARADO agora. Recusa antiga já resolvida não
  // põe ninguém na lista de ação: ela conta no histórico, ao lado.
  const quebrados = linhas
    .filter((l) => l.paradas > 0)
    .sort(
      (x, y) =>
        (y.diasParado ?? 0) - (x.diasParado ?? 0) ||
        y.paradas - x.paradas ||
        String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR")
    );

  // A tabela de baixo mostra a base inteira, do mais quebrado para o menos,
  // e quem está limpo no fim, por nome.
  const ordenadas = [...linhas].sort(
    (x, y) =>
      y.paradas - x.paradas ||
      (y.diasParado ?? -1) - (x.diasParado ?? -1) ||
      y.fiscaisRecusadas + y.impressoesComErro - (x.fiscaisRecusadas + x.impressoesComErro) ||
      String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR")
  );

  return {
    linhas: ordenadas,
    kpis: {
      estabelecimentosQuebrados: quebrados.length,
      fiscaisParadas: linhas.reduce((s, l) => s + l.fiscaisParadas, 0),
      impressoesParadas: linhas.reduce((s, l) => s + l.impressoesParadas, 0),
      fiscaisRecusadas: linhas.reduce((s, l) => s + l.fiscaisRecusadas, 0),
      impressoesComErro: linhas.reduce((s, l) => s + l.impressoesComErro, 0),
    },
    quebrados,
  };
}
