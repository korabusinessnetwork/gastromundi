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

// Normaliza para "dia" em UTC — evita que fuso/horário do dia mude o
// resultado da comparação (mesma semântica de `date` no Postgres).
function inicioDoDiaUTC(data) {
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
  const vencimento = inicioDoDiaUTC(dataVencimento);
  const agora = inicioDoDiaUTC(hoje);
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
  const vencimento = inicioDoDiaUTC(dataVencimento);
  const agora = inicioDoDiaUTC(hoje);
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
 * Restrições de Custo). Restrito a gerente/admin (checagem de role
 * dentro da função SQL, `SECURITY DEFINER`).
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
