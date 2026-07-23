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
 * Como o claim tira a linha de `pendente`, uma máquina que morre no meio do
 * trabalho deixaria a via presa em `processando` para sempre. Por isso todo
 * ciclo começa reciclando os abandonados — ver `recuperarTrabalhosPresos`.
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

/**
 * Quanto tempo uma linha pode ficar em `processando` antes de ser considerada
 * abandonada. Uma via térmica sai em segundos; 2 minutos é folga larga para
 * rede lenta sem confundir impressão em curso com máquina morta.
 */
export const TIMEOUT_PROCESSANDO_MS = 2 * 60 * 1000;

// Motivo gravado em `erro` quando o reaper recicla um trabalho abandonado.
const MOTIVO_PRESO = "impressão interrompida (trabalho preso em processando)";

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
 * Recicla trabalhos ABANDONADOS em `processando` desta máquina.
 *
 * O claim de `processarFilaImpressao` é atômico, mas se a máquina morre entre
 * o claim e o update final (aba fechada, PC reiniciado, queda de rede no meio
 * da impressão) a linha fica em `processando` para sempre: o poll só busca
 * `pendente`, então ninguém volta a olhar para ela e a via nunca chega na
 * cozinha — falha silenciosa, que só aparece quando o cliente cobra o prato.
 *
 * O escopo são os locais DESTA estação porque o caso real de recuperação é a
 * própria máquina voltando (reload/restart) e reencontrando o que ela mesma
 * abandonou. `tentativas` é incrementado a cada reciclagem, então um documento
 * que trava a impressão toda vez não fica em loop: estoura `MAX_TENTATIVAS`,
 * vira `erro` e aparece no histórico.
 *
 * Aceita o risco de duplicar a via no caso estreito em que a impressão saiu e
 * a máquina morreu antes de marcar `impresso` — mesma política de retry que o
 * caminho de erro já adota. Comanda repetida o cozinheiro descarta; comanda
 * perdida vira pedido perdido.
 *
 * Nunca lança.
 *
 * @param {{timeoutMs?: number, limite?: number}} params
 * @returns {Promise<{recuperados: number, error: (Error|object|null)}>}
 */
export async function recuperarTrabalhosPresos({
  timeoutMs = TIMEOUT_PROCESSANDO_MS,
  limite = 10,
} = {}) {
  let recuperados = 0;

  try {
    const locais = locaisDaEstacaoAtual();
    if (locais.length === 0) return { recuperados: 0, error: null };

    const corte = new Date(Date.now() - timeoutMs).toISOString();

    const { data: presos, error } = await supabase
      .from(TABELA)
      .select("id, tentativas")
      .eq("status", STATUS.PROCESSANDO)
      .in("local_impressao_id", locais)
      .lt("atualizado_em", corte)
      .limit(limite);
    if (error) return { recuperados, error };

    for (const p of presos ?? []) {
      const t = (p.tentativas ?? 0) + 1;
      const proximoStatus = t < MAX_TENTATIVAS ? STATUS.PENDENTE : STATUS.ERRO;

      // Guarda `status = processando`: se a estação original ressuscitou e
      // concluiu no meio do caminho, não sobrescrevemos o resultado dela.
      const { data: reciclado } = await supabase
        .from(TABELA)
        .update({
          status: proximoStatus,
          tentativas: t,
          erro: MOTIVO_PRESO,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", p.id)
        .eq("status", STATUS.PROCESSANDO)
        .select("id");

      if (reciclado?.length) recuperados++;
    }

    return { recuperados, error: null };
  } catch (err) {
    return { recuperados, error: err };
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
 * Antes de buscar trabalho novo, recicla o que ficou preso em `processando`
 * (ver `recuperarTrabalhosPresos`).
 *
 * @param {{imprimir: Function, resolverPerfil: Function, configImpressao?: any, limite?: number, timeoutProcessandoMs?: number}} params
 * @returns {Promise<{impressos: number, erros: number, error: (Error|object|null)}>}
 */
export async function processarFilaImpressao({
  imprimir,
  resolverPerfil,
  configImpressao,
  limite = 10,
  timeoutProcessandoMs = TIMEOUT_PROCESSANDO_MS,
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

    // Devolve para a fila o que ficou preso em `processando` antes de buscar
    // trabalho novo. Falha aqui não interrompe o ciclo: o próximo poll (5s)
    // tenta de novo, e o retorno desta função segue sendo só sobre impressão.
    await recuperarTrabalhosPresos({ timeoutMs: timeoutProcessandoMs });

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
