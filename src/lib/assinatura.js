import { supabase } from "./supabase";

/**
 * Assinatura — Fase 4 da camada de comercialização
 * (docs/08_DECISOES/adr-006.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md).
 *
 * SEM ENFORCEMENT AQUI: esta fase só modela a mensalidade do plano e
 * calcula o status (ativo/carência/bloqueado) para EXIBIÇÃO — nenhuma
 * escrita é impedida ainda (isso é a Fase 5). `calcularStatusAssinatura`
 * espelha exatamente `public.calcular_status_assinatura` (SQL) para
 * poder ser testada sem depender do Postgres, mas o cálculo real de
 * enforcement (Fase 5) sempre vem do banco — nunca confie só nesta
 * cópia em produção para decisões de segurança.
 *
 * Add-ons (NF-e/TEF, decisão 019, Fase 3) têm ciclo/cobrança
 * independentes — não entram nesta assinatura (ver ADR-006 §1).
 *
 * Fase 5 (`supabase/migrations/20260720_assinatura_enforcement.sql`,
 * ADR-006 §4) liga o enforcement REAL: bloqueio TOTAL via RLS
 * (`assinatura_ativa`/`assinatura_atual_ativa`, SQL). `assinaturaPermiteOperacao`
 * espelha essa checagem em JS (mesma regra: 'ativo'/'carencia' passam,
 * 'bloqueado'/'cancelado' não) só para a UI decidir o que mostrar
 * (`PrivateRoute`) — a fonte de verdade de segurança é sempre o banco.
 */

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * A partir de quantos dias antes do vencimento o sistema avisa. Uma
 * constante só: o banner do topo (`AssinaturaBanner`) e a aba "Minha
 * assinatura" precisam concordar — a tela não pode dizer "está em dia"
 * enquanto o banner avisa que vence.
 */
export const DIAS_AVISO_PRE_VENCIMENTO = 5;

// "YYYY-MM-DD" e nada mais — é exatamente o formato em que uma coluna `date`
// do Postgres chega pelo PostgREST.
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Reduz uma data ao DIA de calendário a que ela pertence, para a comparação
 * ser entre dois dias e não entre dois instantes.
 *
 * A armadilha que isto resolve: `data_vencimento` é `date` e chega como
 * "2026-08-15", que `new Date()` interpreta como meia-noite em UTC — no
 * Brasil (UTC-3) os getters locais dessa data devolvem dia 14. Já `hoje`
 * chega como `new Date()`, cujo dia local é o certo. Ler os dois com getters
 * locais jogava todo vencimento um dia para trás: no próprio dia de vencer o
 * sistema já dizia "atrasado" e no último dia de carência já mostrava a tela
 * de bloqueio. Aqui uma data-só-dia é lida como data de calendário (é o que
 * `date` significa no Postgres) e um instante é lido pelo calendário local de
 * quem está operando.
 */
function diaDoCalendario(data) {
  if (typeof data === "string") {
    const partes = SO_DATA.exec(data);
    if (partes) return Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  }
  const d = new Date(data);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calcula o status da assinatura a partir de data_vencimento +
 * carencia_dias, comparando com a data atual — NUNCA de uma coluna
 * que dependeria de job (ADR-006 §3). Espelha `calcular_status_assinatura`
 * (SQL, 20260719_assinaturas.sql):
 *   - hoje <= vencimento              → 'ativo'
 *   - hoje <= vencimento + carência   → 'carencia'
 *   - caso contrário                  → 'bloqueado'
 *
 * @param {Date|string} dataVencimento
 * @param {number} carenciaDias
 * @param {Date|string} [hoje]
 * @returns {"ativo"|"carencia"|"bloqueado"}
 */
export function calcularStatusAssinatura(dataVencimento, carenciaDias, hoje = new Date()) {
  const vencimento = diaDoCalendario(dataVencimento);
  const agora = diaDoCalendario(hoje);
  const diffDias = Math.round((agora - vencimento) / MS_POR_DIA);

  if (diffDias <= 0) return "ativo";
  if (diffDias <= (Number(carenciaDias) || 0)) return "carencia";
  return "bloqueado";
}

/**
 * Dias até o vencimento (positivo = ainda faltam; 0 = vence hoje;
 * negativo = já venceu há N dias). Função pura, sem side-effect.
 *
 * @param {Date|string} dataVencimento
 * @param {Date|string} [hoje]
 * @returns {number}
 */
export function calcularDiasParaVencimento(dataVencimento, hoje = new Date()) {
  const vencimento = diaDoCalendario(dataVencimento);
  const agora = diaDoCalendario(hoje);
  return Math.round((vencimento - agora) / MS_POR_DIA);
}

/**
 * Espelha `assinatura_ativa`/`assinatura_atual_ativa` (SQL, Fase 5):
 * 'ativo' e 'carencia' permitem operar; 'bloqueado' e 'cancelado' não.
 * Usada só pela UI (ex.: `PrivateRoute`) para decidir se mostra a tela
 * de bloqueio — a decisão que realmente vale é sempre a do Postgres.
 *
 * @param {"ativo"|"carencia"|"bloqueado"|"cancelado"|undefined|null} status
 * @returns {boolean}
 */
export function assinaturaPermiteOperacao(status) {
  return status === "ativo" || status === "carencia";
}

/**
 * Busca a assinatura do tenant (linha crua — vencimento, carência,
 * valor, status em cache). Nunca lança: falha retorna
 * { data: null, error }, para o chamador decidir o fallback.
 *
 * @param {string} tenantId
 * @returns {Promise<{data: {dataVencimento: string, carenciaDias: number, valorMensal: number, statusCache: string}|null, error: object|null}>}
 */
export async function buscarAssinaturaAtual(tenantId) {
  if (!tenantId) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from("assinaturas")
      .select("data_vencimento, carencia_dias, valor_mensal, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: null, error: null };
    return {
      data: {
        dataVencimento: data.data_vencimento,
        carenciaDias: data.carencia_dias,
        valorMensal: data.valor_mensal,
        statusCache: data.status,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao buscar a assinatura do tenant." } };
  }
}

/**
 * Sincroniza o CACHE de status (coluna `assinaturas.status`) no banco
 * — usada de forma lazy a partir do bootstrap (sem `pg_cron` nesta
 * fase, decisão do founder). Fire-and-forget: nunca deve bloquear o
 * carregamento do app nem é usada para decidir o que exibir (quem
 * decide é `calcularStatusAssinatura`, calculado localmente a partir
 * dos dados já buscados).
 *
 * @param {string} tenantId
 * @returns {Promise<{data: string|null, error: object|null}>}
 */
export async function sincronizarStatusAssinatura(tenantId) {
  if (!tenantId) return { data: null, error: null };
  try {
    const { data, error } = await supabase.rpc("sincronizar_status_assinatura", { p_tenant_id: tenantId });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao sincronizar o status da assinatura." } };
  }
}

/**
 * Confirma a renovação manual da assinatura (pagamento fora do sistema
 * — Pix/transferência; nenhum gateway pago integrado nesta fase,
 * Restrições de Custo).
 *
 * Restrito à PLATAFORMA (`is_super_admin()`, checado dentro da função
 * SQL `SECURITY DEFINER` — `20260909_renovacao_assinatura_so_plataforma.sql`).
 * Uma tela de estabelecimento que chame isto recebe 42501: quem paga a
 * mensalidade não dá baixa nela. Antes desse ajuste gerente/admin
 * renovava o próprio estabelecimento de graça e sem limite.
 *
 * `competencia` é o MÊS de referência: o banco normaliza para o dia 1 e
 * aceita uma única confirmação por mês (índice único em
 * (tenant_id, competencia)) — repetir devolve erro `23505`, então um
 * duplo-clique não vale um ciclo de graça.
 *
 * @param {{tenantId: string, competencia: string, valor: number, metodo: string, confirmadoPor: string}} params
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function confirmarRenovacaoAssinatura({ tenantId, competencia, valor, metodo, confirmadoPor }) {
  if (!tenantId) return { data: null, error: { message: "Tenant inválido." } };
  if (!(Number(valor) > 0)) return { data: null, error: { message: "Valor deve ser maior que zero." } };
  if (!competencia) return { data: null, error: { message: "Competência é obrigatória." } };

  try {
    const { data, error } = await supabase.rpc("confirmar_renovacao_assinatura", {
      p_tenant_id: tenantId,
      p_competencia: competencia,
      p_valor: valor,
      p_metodo: metodo ?? null,
      p_confirmado_por: confirmadoPor ?? null,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao confirmar a renovação da assinatura." } };
  }
}

/**
 * Histórico de pagamentos da mensalidade de um estabelecimento
 * (F022-HISTORICO).
 *
 * Leitura DIRETA, sem RPC: a policy `assinaturas_pagamentos_select_gerencia`
 * (20260726) tem o ramo `is_super_admin()`, então o Console lê o histórico de
 * qualquer estabelecimento e um gerente lê só o do próprio tenant. Campos
 * explícitos — nunca `select *` em tabela de billing (CLAUDE.md).
 *
 * Nunca lança: falha volta como { data: [], error }. Quem chama precisa
 * distinguir "não consegui ler" de "não há pagamento": lista vazia por engano
 * levaria a lançar o mesmo mês duas vezes.
 *
 * @param {string} tenantId
 * @returns {Promise<{data: Array<object>, error: object|null}>}
 */
export async function listarPagamentosAssinatura(tenantId) {
  if (!tenantId) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from("assinaturas_pagamentos")
      .select(
        "id, competencia, valor, metodo, confirmado_por, confirmado_em, estornado_em, estornado_por, estorno_motivo"
      )
      .eq("tenant_id", tenantId);
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao carregar os pagamentos da assinatura." } };
  }
}

/**
 * Cancela (estorna) um pagamento lançado por engano — devolve o ciclo que ele
 * empurrou no vencimento e libera a competência para ser lançada de novo com o
 * valor certo (`estornar_pagamento_assinatura`, 20260913).
 *
 * O estabelecimento NÃO é parâmetro de propósito: sai da própria linha de
 * pagamento dentro do banco. Mandá-lo daqui permitiria estornar o pagamento de
 * um e descontar o ciclo de outro.
 *
 * Restrito à PLATAFORMA (`is_super_admin()` dentro da função SECURITY
 * DEFINER) — e o motivo é obrigatório no banco, não só na tela.
 *
 * @param {{pagamentoId: string, motivo: string, estornadoPor: string}} params
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function estornarPagamentoAssinatura({ pagamentoId, motivo, estornadoPor }) {
  if (!pagamentoId) return { data: null, error: { message: "Pagamento inválido." } };
  if (!motivo || String(motivo).trim().length < 3) {
    return { data: null, error: { message: "Escreva o motivo do cancelamento — ele fica gravado no histórico." } };
  }

  try {
    const { data, error } = await supabase.rpc("estornar_pagamento_assinatura", {
      p_pagamento_id: pagamentoId,
      p_motivo: String(motivo).trim(),
      p_estornado_por: estornadoPor ?? null,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao cancelar o pagamento da assinatura." } };
  }
}

/** "2026-08-01" (competência, `date`) → 202608, para ordenar sem `new Date()`. */
function chaveCompetencia(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
}

/**
 * Organiza o histórico de pagamentos para a tela (F022-HISTORICO). Pura, sem
 * I/O — testável isoladamente (CLAUDE.md).
 *
 * Dinheiro em CENTAVOS INTEIROS: `assinaturas_pagamentos.valor` é `numeric` e
 * chega como número em reais; somar dez linhas dessas em float erra o total
 * por centavos. Cada linha é convertida na entrada e o total só vira real na
 * hora de formatar.
 *
 * Ordena do mais recente para o mais antigo (competência e, no empate, a hora
 * do lançamento): quem abre o histórico está procurando o que acabou de
 * lançar. Pagamento estornado continua na lista — some do total, não da
 * memória.
 *
 * @param {Array<object>} pagamentos linhas cruas de `assinaturas_pagamentos`
 * @returns {{linhas: Array<object>, totalCentavos: number, quantidadeValidos: number, quantidadeEstornados: number}}
 */
export function resumirPagamentos(pagamentos = []) {
  const linhas = (pagamentos ?? [])
    .map((p) => ({
      id: p.id,
      competencia: p.competencia,
      valorCentavos: Math.round((Number(p.valor) || 0) * 100),
      metodo: p.metodo ?? null,
      confirmadoPor: p.confirmado_por ?? null,
      confirmadoEm: p.confirmado_em ?? null,
      estornado: Boolean(p.estornado_em),
      estornadoEm: p.estornado_em ?? null,
      estornadoPor: p.estornado_por ?? null,
      motivoEstorno: p.estorno_motivo ?? null,
    }))
    .sort((a, b) => {
      const dif = chaveCompetencia(b.competencia) - chaveCompetencia(a.competencia);
      if (dif !== 0) return dif;
      return String(b.confirmadoEm ?? "").localeCompare(String(a.confirmadoEm ?? ""));
    });

  const validas = linhas.filter((l) => !l.estornado);

  return {
    linhas,
    totalCentavos: validas.reduce((soma, l) => soma + l.valorCentavos, 0),
    quantidadeValidos: validas.length,
    quantidadeEstornados: linhas.length - validas.length,
  };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * "2026-08" → "agosto/2026". Devolve "" para mês vazio ou malformado.
 *
 * Mora aqui, e não no modal do Console onde nasceu, porque a tela do
 * ESTABELECIMENTO (Minha assinatura) nomeia o mesmo mês de competência —
 * e uma tela de tenant importando um componente do Console amarraria as
 * duas superfícies, que a decisão 027 mantém separadas.
 */
export function rotuloCompetencia(mes) {
  const m = String(mes ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  const nome = MESES[Number(m[2]) - 1];
  return nome ? `${nome}/${m[1]}` : "";
}

/** "2026-08-05" (`date`) → "05/08/2026", pela string — nunca por new Date(). */
function dataBr(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Traduz a assinatura do tenant logado para a frase que o dono do
 * restaurante lê (S1-3). Pura, sem I/O.
 *
 * Recalcula o status a partir de data/carência em vez de reaproveitar o
 * `assinatura.status` que veio do bootstrap: uma sessão aberta atravessa a
 * meia-noite, e a frase "vence hoje" não pode continuar na tela no dia
 * seguinte. Mesmo motivo pelo qual o status nunca vem da coluna `status` do
 * banco, que é cache (ADR-006 §3).
 *
 * `tom` é a intenção da mensagem, não a cor: quem pinta é o CSS.
 *
 * @param {{dataVencimento: string, carenciaDias: number, valorMensal: number}|null} assinatura
 * @param {Date|string} [hoje]
 * @returns {{status: string, tom: "ok"|"aviso"|"critico", titulo: string, detalhe: string, vencimentoBr: string, mensalidadeCentavos: number, isento: boolean}|null}
 */
export function resumirPlanoDoTenant(assinatura, hoje = new Date()) {
  if (!assinatura || !assinatura.dataVencimento) return null;

  const carencia = Number(assinatura.carenciaDias) || 0;
  const status = calcularStatusAssinatura(assinatura.dataVencimento, carencia, hoje);
  const dias = calcularDiasParaVencimento(assinatura.dataVencimento, hoje);
  const vencimentoBr = dataBr(assinatura.dataVencimento);
  const mensalidadeCentavos = Math.round((Number(assinatura.valorMensal) || 0) * 100);

  const base = {
    status,
    vencimentoBr,
    mensalidadeCentavos,
    isento: mensalidadeCentavos === 0,
  };

  if (status === "carencia") {
    const restantes = Math.max(0, carencia - Math.abs(dias ?? 0));
    return {
      ...base,
      tom: "critico",
      titulo: "Sua mensalidade está atrasada",
      detalhe: restantes > 0
        ? `Venceu em ${vencimentoBr}. Você tem mais ${restantes} dia${restantes === 1 ? "" : "s"} para regularizar antes de perder o acesso.`
        : `Venceu em ${vencimentoBr}. O prazo para regularizar termina hoje.`,
    };
  }

  if (status === "bloqueado") {
    return {
      ...base,
      tom: "critico",
      titulo: "Seu acesso está bloqueado por falta de pagamento",
      detalhe: `A mensalidade venceu em ${vencimentoBr} e o prazo de regularização terminou.`,
    };
  }

  if (dias === 0) {
    return {
      ...base,
      tom: "aviso",
      titulo: "Sua mensalidade vence hoje",
      detalhe: `O acesso continua liberado hoje, ${vencimentoBr}.`,
    };
  }

  if (dias !== null && dias <= DIAS_AVISO_PRE_VENCIMENTO) {
    return {
      ...base,
      tom: "aviso",
      titulo: `Sua mensalidade vence em ${dias} dia${dias === 1 ? "" : "s"}`,
      detalhe: `Próximo vencimento em ${vencimentoBr}.`,
    };
  }

  return {
    ...base,
    tom: "ok",
    titulo: "Sua assinatura está em dia",
    detalhe: `Próximo vencimento em ${vencimentoBr}.`,
  };
}
