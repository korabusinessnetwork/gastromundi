import { supabase } from "../supabase";
import { estacaoIdAtual, CHAVE_BINDINGS_CACHE } from "../estacao";

/**
 * Fila de impressão em rede — Fase 3 do sistema de impressão.
 *
 * O documento a imprimir é enfileirado no banco (`public.trabalhos_impressao`)
 * amarrado a um LOCAL de impressão (ex.: "cozinha", "bar", "caixa"). Cada
 * máquina do restaurante ("estação") sabe QUAIS locais ela imprime a partir do
 * cache local de vínculos (`CHAVE_BINDINGS_CACHE`, gravado por `estacao.js`) e
 * fica processando a fila só dos SEUS locais.
 *
 * O claim de cada trabalho é ATÔMICO no banco (`update ... where status =
 * 'pendente'`): duas máquinas podem imprimir o mesmo local sem duplicar —
 * quem "ganhar" a linha imprime, a outra apenas segue em frente.
 *
 * Toda função async aqui NUNCA lança — segue o estilo de `estacao.js`: o erro
 * do Supabase só é repassado no retorno e a operação principal (PDV) nunca
 * quebra por causa da impressão.
 */

export const STATUS = {
  PENDENTE: "pendente",
  PROCESSANDO: "processando",
  IMPRESSO: "impresso",
  ERRO: "erro",
};

export const MAX_TENTATIVAS = 3;

// Nome da tabela da fila no banco.
const TABELA = "trabalhos_impressao";

function temLocalStorage() {
  return typeof localStorage !== "undefined";
}

/**
 * Enfileira UM trabalho de impressão. Grava a linha `pendente` no banco e
 * devolve o id criado. Nunca lança.
 *
 * @param {{localImpressaoId: string, documento: any}} params
 * @returns {Promise<{data: {id: string}|null, error: (Error|object|null)}>}
 */
export async function enfileirarTrabalho({ localImpressaoId, documento } = {}) {
  try {
    const { data, error } = await supabase
      .from(TABELA)
      .insert({ local_impressao_id: localImpressaoId, documento })
      .select("id")
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * IDs dos locais de impressão que ESTA máquina atende — as chaves do cache de
 * bindings da estação atual cujo vínculo tem `.nome` não-vazio. Pura,
 * síncrona; nunca lança (cache ausente/corrompido degrada para []).
 *
 * @returns {string[]}
 */
export function locaisDaEstacaoAtual() {
  if (!temLocalStorage()) return [];
  try {
    const bruto = localStorage.getItem(CHAVE_BINDINGS_CACHE);
    if (!bruto) return [];
    const cache = JSON.parse(bruto);
    const impressoras = cache?.impressoras;
    if (!impressoras || typeof impressoras !== "object") return [];
    return Object.keys(impressoras).filter((localId) => {
      const nome = impressoras[localId]?.nome;
      return typeof nome === "string" && nome.trim() !== "";
    });
  } catch {
    return [];
  }
}

/**
 * Processa a fila de impressão DESTA máquina.
 *
 * `imprimir` e `resolverPerfil` são injetados para manter a função testável em
 * node, sem carregar drivers de impressão nem depender do DOM.
 *
 *  - `imprimir(documento, perfil)` → `{ error }` (erro trunca a tentativa).
 *  - `resolverPerfil(localImpressaoId, configImpressao)` → perfil da impressora.
 *
 * Nunca lança: qualquer exceção inesperada vira `{ impressos, erros, error }`.
 *
 * @param {{imprimir: Function, resolverPerfil: Function, configImpressao?: any, limite?: number}} params
 * @returns {Promise<{impressos: number, erros: number, error: (Error|object|null)}>}
 */
export async function processarFilaImpressao({
  imprimir,
  resolverPerfil,
  configImpressao,
  limite = 10,
} = {}) {
  let impressos = 0;
  let erros = 0;

  try {
    // Guarda: sem funções válidas de impressão, no-op seguro.
    if (typeof imprimir !== "function" || typeof resolverPerfil !== "function") {
      return { impressos: 0, erros: 0, error: null };
    }

    const locais = locaisDaEstacaoAtual();
    if (locais.length === 0) {
      return { impressos: 0, erros: 0, error: null };
    }

    const { data: candidatos, error } = await supabase
      .from(TABELA)
      .select("id, local_impressao_id, documento, tentativas")
      .eq("status", STATUS.PENDENTE)
      .in("local_impressao_id", locais)
      .order("criado_em", { ascending: true })
      .limit(limite);
    if (error) return { impressos, erros, error };

    for (const c of candidatos ?? []) {
      // CLAIM ATÔMICO: só imprime quem conseguir virar a linha pendente→processando.
      const { data: claim } = await supabase
        .from(TABELA)
        .update({
          status: STATUS.PROCESSANDO,
          estacao_id: estacaoIdAtual(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", c.id)
        .eq("status", STATUS.PENDENTE)
        .select("id");

      // Outra máquina venceu o claim — pula sem contar.
      if (!claim?.length) continue;

      const perfil = resolverPerfil(c.local_impressao_id, configImpressao);
      const { error: erroImpressao } = await imprimir(c.documento, perfil);

      if (!erroImpressao) {
        const agora = new Date().toISOString();
        await supabase
          .from(TABELA)
          .update({ status: STATUS.IMPRESSO, impresso_em: agora, atualizado_em: agora })
          .eq("id", c.id);
        impressos++;
      } else {
        const msg = erroImpressao?.message ?? "falha na impressão";
        const t = (c.tentativas ?? 0) + 1;
        const proximoStatus = t < MAX_TENTATIVAS ? STATUS.PENDENTE : STATUS.ERRO;
        await supabase
          .from(TABELA)
          .update({
            status: proximoStatus,
            tentativas: t,
            erro: msg,
            atualizado_em: new Date().toISOString(),
          })
          .eq("id", c.id);
        erros++;
      }
    }

    return { impressos, erros, error: null };
  } catch (err) {
    return { impressos, erros, error: err };
  }
}
