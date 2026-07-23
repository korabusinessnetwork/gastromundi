import { supabase } from "./supabase";

/**
 * Estações (workstations) — Fase 2 do sistema de impressão.
 *
 * "Estação" = um PC físico do restaurante. O vínculo local-de-impressão →
 * impressora física agora vive no banco (`public.estacoes.impressoras`,
 * jsonb), por tenant — a RLS já isola por tenant, então o app NUNCA passa
 * tenant_id nas queries daqui.
 *
 * Shape de `impressoras`: { [local_impressao_id]: { nome: "<impressora>" } }.
 *
 * Cada máquina guarda no localStorage só QUAL estação ela é
 * (`CHAVE_ESTACAO_ID`). Além disso mantemos um CACHE de leitura dos
 * vínculos da estação atual (`CHAVE_BINDINGS_CACHE`) para o caminho de
 * impressão ser síncrono e funcionar offline — o banco continua sendo a
 * fonte de verdade; o cache é só uma foto da última sincronização.
 *
 * Toda função async aqui NUNCA lança — se a tabela `estacoes` ainda não
 * existir (dono roda a migration manualmente depois), o erro do Supabase
 * só é repassado no `{ data, error }` e o app continua de pé.
 */

export const CHAVE_ESTACAO_ID = "gastromundi:estacao_id";
export const CHAVE_BINDINGS_CACHE = "gastromundi:estacao_bindings.v1";

// Colunas explícitas — nunca `select *` (padrão de segurança do projeto).
const COLUNAS = "id,nome,impressoras";

function temLocalStorage() {
  return typeof localStorage !== "undefined";
}

/**
 * Qual estação esta máquina é, segundo o localStorage. Síncrona; nunca
 * lança (ex.: localStorage bloqueado/indisponível) — degrada para null.
 *
 * @returns {string|null}
 */
export function estacaoIdAtual() {
  if (!temLocalStorage()) return null;
  try {
    return localStorage.getItem(CHAVE_ESTACAO_ID) || null;
  } catch {
    return null;
  }
}

/**
 * Grava qual estação esta máquina é. `id` vazio/null remove a chave
 * (desvincula a máquina de qualquer estação). Síncrona, silenciosa.
 *
 * @param {string|null|undefined} id
 */
export function definirEstacaoAtual(id) {
  if (!temLocalStorage()) return;
  try {
    if (id === null || id === undefined || id === "") {
      localStorage.removeItem(CHAVE_ESTACAO_ID);
    } else {
      localStorage.setItem(CHAVE_ESTACAO_ID, String(id));
    }
  } catch {
    // localStorage indisponível (modo privado, quota, etc.) — segue sem cache.
  }
}

/**
 * Lê o cache local dos vínculos da estação atual. Uso interno.
 *
 * @returns {{estacaoId: string, impressoras: object}|null}
 */
function lerCacheBindings() {
  if (!temLocalStorage()) return null;
  try {
    const bruto = localStorage.getItem(CHAVE_BINDINGS_CACHE);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

/**
 * Grava o cache local dos vínculos da estação atual. Uso interno.
 *
 * @param {string} estacaoId
 * @param {object} impressoras
 */
function gravarCacheBindings(estacaoId, impressoras) {
  if (!temLocalStorage()) return;
  try {
    localStorage.setItem(
      CHAVE_BINDINGS_CACHE,
      JSON.stringify({ estacaoId, impressoras: impressoras ?? {} })
    );
  } catch {
    // Sem cache local — o app segue funcionando, só perde o caminho síncrono/offline.
  }
}

/**
 * Lista as estações do tenant atual (RLS cuida do isolamento). Nunca
 * lança — se a tabela ainda não existir ou der erro, retorna `data: []`.
 *
 * @returns {Promise<{data: Array<object>, error: (Error|object|null)}>}
 */
export async function listarEstacoes() {
  try {
    const { data, error } = await supabase
      .from("estacoes")
      .select(COLUNAS)
      .order("nome", { ascending: true });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

/**
 * Cria uma estação nova com o nome informado. Nunca lança.
 *
 * @param {string} nome
 * @returns {Promise<{data: object|null, error: (Error|object|null)}>}
 */
export async function criarEstacao(nome) {
  try {
    const { data, error } = await supabase
      .from("estacoes")
      .insert({ nome: String(nome).trim() })
      .select(COLUNAS)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Renomeia uma estação existente. Nunca lança.
 *
 * @param {string} id
 * @param {string} nome
 * @returns {Promise<{error: (Error|object|null)}>}
 */
export async function renomearEstacao(id, nome) {
  try {
    const { error } = await supabase
      .from("estacoes")
      .update({ nome: String(nome).trim() })
      .eq("id", id);
    return { error: error ?? null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Exclui uma estação. Nunca lança.
 *
 * @param {string} id
 * @returns {Promise<{error: (Error|object|null)}>}
 */
export async function excluirEstacao(id) {
  try {
    const { error } = await supabase.from("estacoes").delete().eq("id", id);
    return { error: error ?? null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Grava os vínculos local-de-impressão→impressora física de uma estação.
 * Quando a estação alvo é a MÁQUINA ATUAL (`estacaoIdAtual() === id`),
 * também atualiza o cache local — assim a próxima impressão nesta mesma
 * máquina já enxerga o vínculo novo sem precisar sincronizar de novo.
 * Nunca lança.
 *
 * @param {string} id
 * @param {object} impressoras
 * @returns {Promise<{error: (Error|object|null)}>}
 */
export async function salvarImpressorasEstacao(id, impressoras) {
  try {
    const { error } = await supabase
      .from("estacoes")
      .update({ impressoras, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error };

    if (id === estacaoIdAtual()) {
      gravarCacheBindings(id, impressoras);
    }
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Busca no banco os vínculos da estação atual (localStorage) e atualiza
 * o cache local. Sem `estacaoIdAtual()` (máquina ainda não vinculada a
 * nenhuma estação), é um no-op: retorna `{}` e NÃO mexe no cache. Em
 * erro do Supabase, retorna `{ data: {}, error }` SEM sobrescrever o
 * cache existente (mantém o último bom conhecido para o caminho
 * offline). Nunca lança.
 *
 * @returns {Promise<{data: object, error: (Error|object|null)}>}
 */
export async function sincronizarBindingsEstacao() {
  try {
    const id = estacaoIdAtual();
    if (!id) return { data: {}, error: null };

    const { data, error } = await supabase
      .from("estacoes")
      .select("impressoras")
      .eq("id", id)
      .maybeSingle();
    if (error) return { data: {}, error };

    const impressoras = data?.impressoras ?? {};
    gravarCacheBindings(id, impressoras);
    return { data: impressoras, error: null };
  } catch (err) {
    return { data: {}, error: err };
  }
}
