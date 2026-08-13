import { supabase } from "./supabase";

/**
 * Pautas da Kora — ferramenta INTERNA dos sócios
 * (docs/03_REGRAS_DE_NEGOCIO/PAUTAS.md · ADR-011 · decisão 034).
 *
 * Uma pauta é o que o dono estipula para os sócios programarem. Guarda as
 * três coisas que a conversa de WhatsApp perde: o que é (título), PARA QUE
 * serve (intuito) e o que já se sabe (contexto) — mais quem está envolvido
 * e em que pé está (pendente / em progresso / finalizado).
 *
 * NÃO é dado de estabelecimento: as tabelas `public.pautas` e
 * `public.pautas_pessoas` não têm tenant_id e a RLS exige um JWT do
 * namespace @pautas.local (public.eh_socio_pautas()).
 *
 * Requer a migração supabase/migrations/20260919_pautas.sql aplicada.
 */

// Colunas explícitas em toda leitura (nunca `select *`).
const COLUNAS_PAUTA =
  "id, titulo, intuito, contexto, envolvidos, status, criada_por, atualizada_por, created_at, updated_at, finalizada_em";

/** Os três estados — os mesmos três botões da tela e o CHECK do banco. */
export const STATUS_PAUTA = {
  PENDENTE:     "pendente",
  EM_PROGRESSO: "em_progresso",
  FINALIZADO:   "finalizado",
};

/** Ordem em que as colunas/filtros aparecem: o caminho natural da pauta. */
export const STATUS_EM_ORDEM = [
  STATUS_PAUTA.PENDENTE,
  STATUS_PAUTA.EM_PROGRESSO,
  STATUS_PAUTA.FINALIZADO,
];

const ROTULOS = {
  [STATUS_PAUTA.PENDENTE]:     "Pendente",
  [STATUS_PAUTA.EM_PROGRESSO]: "Em progresso",
  [STATUS_PAUTA.FINALIZADO]:   "Finalizado",
};

/**
 * Rótulo do status em português do dia a dia (é o que vai na tela).
 * @param {string} status
 * @returns {string}
 */
export function rotuloStatus(status) {
  return ROTULOS[status] ?? "Pendente";
}

/**
 * O status é um dos três conhecidos? Barra escrita torta antes do banco —
 * o CHECK devolveria um erro cru de constraint na tela.
 * @param {string} status
 * @returns {boolean}
 */
export function statusValido(status) {
  return Object.values(STATUS_PAUTA).includes(status);
}

/**
 * Valida a pauta antes de qualquer ida ao Supabase — exposta separadamente
 * para uso síncrono no formulário (desabilitar "Salvar" sem round-trip).
 *
 * Título e intuito são obrigatórios (pauta sem intuito é exatamente o que
 * este sistema existe para evitar). Contexto e envolvidos são opcionais:
 * exigir os dois travaria o registro rápido de uma ideia.
 *
 * @param {{ titulo?: string, intuito?: string, contexto?: string, envolvidos?: string[], status?: string }} dados
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarPauta(dados) {
  const titulo  = String(dados?.titulo  ?? "").trim();
  const intuito = String(dados?.intuito ?? "").trim();

  if (!titulo)  return { valido: false, erro: "Dê um nome para a pauta." };
  if (titulo.length > 120)
    return { valido: false, erro: "O nome da pauta ficou muito longo (máximo 120 caracteres)." };
  if (!intuito) return { valido: false, erro: "Escreva para que serve esta pauta." };
  if (intuito.length > 1000)
    return { valido: false, erro: "O intuito ficou muito longo (máximo 1000 caracteres)." };
  if (String(dados?.contexto ?? "").length > 5000)
    return { valido: false, erro: "O contexto ficou muito longo (máximo 5000 caracteres)." };

  const envolvidos = dados?.envolvidos;
  if (envolvidos != null && !Array.isArray(envolvidos))
    return { valido: false, erro: "Envolvidos precisa ser uma lista de pessoas." };

  const status = dados?.status;
  if (status != null && !statusValido(status))
    return { valido: false, erro: "Status desconhecido." };

  return { valido: true, erro: null };
}

/**
 * Nomes de quem está envolvido, prontos para a tela. Slug sem pessoa
 * correspondente aparece como o próprio slug em vez de sumir — sócio
 * removido da lista não apaga a memória de quem participou.
 *
 * @param {string[]} envolvidos - slugs
 * @param {Array<{slug: string, nome: string}>} pessoas
 * @returns {string[]}
 */
export function nomesDosEnvolvidos(envolvidos, pessoas) {
  const lista = Array.isArray(envolvidos) ? envolvidos : [];
  const porSlug = new Map((pessoas ?? []).map((p) => [p.slug, p.nome]));
  return lista.map((slug) => porSlug.get(slug) ?? slug);
}

/**
 * Filtra a lista já carregada — filtro é instantâneo na tela, sem nova ida
 * ao banco (a lista de pautas dos sócios é pequena por natureza).
 *
 * @param {object[]} pautas
 * @param {{ status?: string|null, pessoa?: string|null, busca?: string }} [filtros]
 * @returns {object[]}
 */
export function filtrarPautas(pautas, filtros = {}) {
  const lista  = Array.isArray(pautas) ? pautas : [];
  const status = filtros.status || null;
  const pessoa = filtros.pessoa || null;
  const busca  = String(filtros.busca ?? "").trim().toLowerCase();

  return lista.filter((p) => {
    if (status && p.status !== status) return false;
    if (pessoa && !(Array.isArray(p.envolvidos) && p.envolvidos.includes(pessoa))) return false;
    if (busca) {
      const alvo = `${p.titulo ?? ""} ${p.intuito ?? ""} ${p.contexto ?? ""}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/**
 * Quantas pautas em cada estado — alimenta os números dos filtros, para a
 * pessoa ver o que tem antes de clicar.
 *
 * @param {object[]} pautas
 * @returns {{pendente: number, em_progresso: number, finalizado: number, total: number}}
 */
export function contarPorStatus(pautas) {
  const lista = Array.isArray(pautas) ? pautas : [];
  const contagem = {
    [STATUS_PAUTA.PENDENTE]: 0,
    [STATUS_PAUTA.EM_PROGRESSO]: 0,
    [STATUS_PAUTA.FINALIZADO]: 0,
    total: lista.length,
  };
  for (const p of lista) {
    if (statusValido(p?.status)) contagem[p.status] += 1;
  }
  return contagem;
}

/**
 * Lista os sócios (ativos primeiro pela ordem definida no banco).
 * @returns {Promise<{data: object[]|null, error: object|null}>}
 */
export async function listarPessoas() {
  const { data, error } = await supabase
    .from("pautas_pessoas")
    .select("slug, nome, ativo, ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: true });
  return { data, error };
}

/**
 * Lista as pautas, mais novas primeiro. Sem paginação de propósito: são
 * pautas de três sócios, não um feed — a tela mostra tudo e filtra local.
 * @returns {Promise<{data: object[]|null, error: object|null}>}
 */
export async function listarPautas() {
  const { data, error } = await supabase
    .from("pautas")
    .select(COLUNAS_PAUTA)
    .order("created_at", { ascending: false });
  return { data, error };
}

/**
 * Cria uma pauta.
 *
 * @param {{ titulo: string, intuito: string, contexto?: string, envolvidos?: string[], status?: string }} dados
 * @param {string|null} [autor] - slug de quem está logado
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function criarPauta(dados, autor = null) {
  const { valido, erro } = validarPauta(dados);
  if (!valido) return { data: null, error: { message: erro } };

  const status = statusValido(dados.status) ? dados.status : STATUS_PAUTA.PENDENTE;
  const payload = {
    titulo:     String(dados.titulo).trim(),
    intuito:    String(dados.intuito).trim(),
    contexto:   String(dados.contexto ?? "").trim(),
    envolvidos: (Array.isArray(dados.envolvidos) ? dados.envolvidos : []).map((s) => String(s)),
    status,
    criada_por:     autor || null,
    atualizada_por: autor || null,
    finalizada_em:  status === STATUS_PAUTA.FINALIZADO ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("pautas")
    .insert(payload)
    .select(COLUNAS_PAUTA)
    .single();
  return { data, error };
}

/**
 * Edita título/intuito/contexto/envolvidos de uma pauta existente.
 *
 * @param {string} id
 * @param {{ titulo: string, intuito: string, contexto?: string, envolvidos?: string[] }} dados
 * @param {string|null} [autor]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function atualizarPauta(id, dados, autor = null) {
  if (!id) return { data: null, error: { message: "Pauta não identificada." } };
  const { valido, erro } = validarPauta(dados);
  if (!valido) return { data: null, error: { message: erro } };

  const payload = {
    titulo:     String(dados.titulo).trim(),
    intuito:    String(dados.intuito).trim(),
    contexto:   String(dados.contexto ?? "").trim(),
    envolvidos: (Array.isArray(dados.envolvidos) ? dados.envolvidos : []).map((s) => String(s)),
    atualizada_por: autor || null,
  };

  const { data, error } = await supabase
    .from("pautas")
    .update(payload)
    .eq("id", id)
    .select(COLUNAS_PAUTA)
    .single();
  return { data, error };
}

/**
 * Move o status — é o clique mais frequente da tela.
 *
 * `finalizada_em` acompanha o estado: carimba ao finalizar e volta a NULL
 * se a pauta reabrir, para o histórico não mentir a data de conclusão.
 *
 * @param {string} id
 * @param {string} status
 * @param {string|null} [autor]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function atualizarStatus(id, status, autor = null) {
  if (!id) return { data: null, error: { message: "Pauta não identificada." } };
  if (!statusValido(status)) return { data: null, error: { message: "Status desconhecido." } };

  const payload = {
    status,
    atualizada_por: autor || null,
    finalizada_em: status === STATUS_PAUTA.FINALIZADO ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("pautas")
    .update(payload)
    .eq("id", id)
    .select(COLUNAS_PAUTA)
    .single();
  return { data, error };
}
