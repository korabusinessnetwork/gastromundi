import { supabase } from "../supabase";
import { estacaoIdAtual } from "../estacao";
import { STATUS } from "./fila";

/**
 * Histórico e reimpressão de comandas — Fase 4 do sistema de impressão.
 *
 * Reaproveita a tabela `public.trabalhos_impressao` (criada na Fase 3) como
 * TRILHA DE AUDITORIA única: além dos trabalhos "remotos" que a fila já grava,
 * cada via impressa LOCALMENTE (na hora) também vira uma linha `impresso`.
 * Assim o "Histórico de Impressão" mostra tudo o que saiu — de qualquer PC — e
 * a gerência pode reimprimir uma comanda quando o papel enrosca ou some.
 *
 * Regras que preservam o comportamento das fases anteriores (zero regressão):
 *  - O registro da impressão local é FIRE-AND-FORGET: a via já saiu na
 *    impressora; gravar o rastro nunca bloqueia nem derruba o PDV, e falha de
 *    rede só significa "sem registro" (igual `activity_log`). Nenhuma função
 *    aqui lança — o erro só volta no retorno.
 *  - Linhas gravadas com status `impresso` são INVISÍVEIS ao poll da fila (que
 *    só reivindica `pendente`), então auditar nunca causa impressão dupla.
 */

const TABELA = "trabalhos_impressao";

/**
 * Registra no histórico uma via que ACABOU de ser impressa localmente.
 * Fire-and-forget: chame sem `await` no caminho de impressão. Nunca lança.
 *
 * Sem `localImpressaoId` (ex.: fallback de via única sem roteamento) não há o
 * que auditar por local — vira no-op silencioso.
 *
 * @param {{localImpressaoId?: string, documento?: any}} params
 * @returns {Promise<{error: (Error|object|null)}>}
 */
export async function registrarImpressaoLocal({ localImpressaoId, documento } = {}) {
  try {
    if (!localImpressaoId) return { error: null };
    const agora = new Date().toISOString();
    const { error } = await supabase.from(TABELA).insert({
      local_impressao_id: localImpressaoId,
      documento,
      status: STATUS.IMPRESSO,
      estacao_id: estacaoIdAtual(),
      impresso_em: agora,
      atualizado_em: agora,
    });
    return { error: error ?? null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Histórico recente de impressões (mais novo primeiro), com o nome do local
 * resolvido para exibição. Nunca lança — degrada para lista vazia + erro.
 *
 * @param {{limite?: number}} params
 * @returns {Promise<{data: Array<object>, error: (Error|object|null)}>}
 */
export async function listarHistoricoImpressao({ limite = 50 } = {}) {
  try {
    const { data, error } = await supabase
      .from(TABELA)
      .select("id, local_impressao_id, documento, status, tentativas, erro, estacao_id, criado_em, impresso_em")
      .order("criado_em", { ascending: false })
      .limit(limite);
    if (error) return { data: [], error };

    const trabalhos = data ?? [];
    // Resolve os nomes dos locais numa consulta só (evita N+1).
    const ids = [...new Set(trabalhos.map((t) => t.local_impressao_id).filter(Boolean))];
    const nomes = {};
    if (ids.length > 0) {
      const { data: locais } = await supabase
        .from("locais_impressao")
        .select("id, nome")
        .in("id", ids);
      for (const l of locais ?? []) nomes[l.id] = l.nome;
    }

    return {
      data: trabalhos.map((t) => ({ ...t, local_nome: nomes[t.local_impressao_id] ?? null })),
      error: null,
    };
  } catch (err) {
    return { data: [], error: err };
  }
}

/**
 * Reimprime AGORA, nesta máquina, o documento guardado de um trabalho. Resolve
 * o perfil (impressora) do local nesta estação — ou o perfil global, se o local
 * não estiver vinculado aqui. `imprimir` e `resolverPerfil` são injetados para
 * manter a função testável em node (mesmo padrão de `processarFilaImpressao`).
 *
 * Não cria nova linha de auditoria: reimpressão é uma ação operacional pontual;
 * o histórico registra o que foi ENVIADO à produção, não cada reenvio manual.
 *
 * @param {object} trabalho - item do histórico ({ documento, local_impressao_id })
 * @param {{configImpressao?: any, imprimir: Function, resolverPerfil: Function}} deps
 * @returns {Promise<{error: (Error|object|null)}>}
 */
export async function reimprimirTrabalho(trabalho, { configImpressao, imprimir, resolverPerfil } = {}) {
  try {
    if (typeof imprimir !== "function" || typeof resolverPerfil !== "function") {
      return { error: { message: "Impressão indisponível nesta máquina." } };
    }
    if (!trabalho?.documento) {
      return { error: { message: "Este item não tem documento para reimprimir." } };
    }
    const perfil = resolverPerfil(trabalho.local_impressao_id, configImpressao);
    return await imprimir(trabalho.documento, perfil);
  } catch (err) {
    return { error: err };
  }
}
